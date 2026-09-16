"""
FastAPI Router для Telegram Mini App мастера маникюра.
Эндпоинты:
1. GET  /api/services    — Каталог услуг конструктора по категориям
2. POST /api/slots       — Интеллектуальный расчёт доступных слотов через SmartSchedulingEngine
3. POST /api/appointments— Создание бронирования с фото-фиксацией (исходник + референс)
4. GET  /api/schedule    — Расписание и загрузка мастера на день / месяц
"""

import os
from datetime import date, datetime, time, timedelta
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy import func

from backend.database import get_db
from backend.notifications import (
    notify_new_booking_created, notify_booking_cancelled_to_master, notify_waitlist_slot_available
)
from backend.models import (
    User, UserRole, Service, ServiceCategory,
    MasterSchedule, Appointment, AppointmentStatus, appointment_services_table,
    GlobalConfig, WaitlistEntry
)
from backend.schemas import (
    CategorizedServicesResponse, ServiceResponse,
    SlotsRequest, SlotsResponse, CalculatedDurationDTO, AvailableSlotDTO,
    AppointmentCreateRequest, AppointmentResponse,
    MasterDayScheduleResponse, MasterMonthOverviewResponse, MasterMonthDaySummary,
    ScheduleDaySetting, ScheduleTemplateApplyRequest, BulkScheduleSaveRequest, ScheduleBulkResponse,
    StudioConfigResponse, StudioConfigUpdateRequest, ServiceCreateRequest, ServiceUpdateRequest,
    ClientAppointmentItem, ClientCancelRequest
)
from backend.scheduling_engine import (
    SmartSchedulingEngine, ServiceItem, minutes_to_str, time_to_minutes
)
from backend.time_utils import CITY_TIMEZONES, format_address_with_cabinet, get_local_naive_now

router = APIRouter(tags=["Nail Studio Mini App API"])


# =====================================================================
# 1. /api/services — ПОЛУЧЕНИЕ УСЛУГ С РАЗДЕЛЕНИЕМ ПО КАТЕГОРИЯМ
# =====================================================================
@router.get(
    "/services",
    response_model=CategorizedServicesResponse,
    summary="Каталог услуг для конструктора бронирования"
)
def get_services(db: Session = Depends(get_db)):
    """
    Возвращает активные услуги мастера, сгруппированные по категориям:
    - removal: Снятие старого покрытия
    - base: Основное покрытие (маникюр, укрепление, наращивание)
    - design: Дизайн (френч, втирка, роспись)
    - repair: Ремонт и донаращивание отдельных ногтей

    Каждая услуга содержит длительность в минутах и цену в рублях.
    """
    active_services = (
        db.query(Service)
        .filter(Service.is_active == True)
        .order_by(Service.sort_order.asc(), Service.id.asc())
        .all()
    )

    categorized = CategorizedServicesResponse()

    for item in active_services:
        dto = ServiceResponse.model_validate(item)
        if item.category == ServiceCategory.REMOVAL:
            categorized.removal.append(dto)
        elif item.category == ServiceCategory.BASE:
            categorized.base.append(dto)
        elif item.category == ServiceCategory.DESIGN:
            categorized.design.append(dto)
        elif item.category == ServiceCategory.REPAIR:
            categorized.repair.append(dto)

    return categorized


# =====================================================================
# 2. /api/slots — ДИНАМИЧЕСКИЙ РАСЧЁТ ДОСТУПНОГО ВРЕМЕНИ
# =====================================================================
@router.post(
    "/slots",
    response_model=SlotsResponse,
    summary="Умный расчёт свободных слотов под выбранный комплекс услуг"
)
def calculate_available_slots(payload: SlotsRequest, db: Session = Depends(get_db)):
    """
    Ключевой алгоритмический эндпоинт системы бронирования:
    1. Получает выбранные ID услуг из Конструктора (снятие + база + дизайн + ремонт).
    2. Рассчитывает суммарное время процедуры + добавляет 15 минут на стерилизацию.
    3. Загружает график мастера на выбранную дату (начало дня, конец, обед).
    4. Загружает все занятые записи на этот день (со статусом PENDING или CONFIRMED).
    5. Передаёт данные в `SmartSchedulingEngine`, который вычисляет свободные окна
       и возвращает только те стартовые слоты, в которые помещается вся процедура целиком!
    """
    # 1. Проверяем существование мастера
    master = db.query(User).filter(User.id == payload.master_id).first()
    if not master:
        raise HTTPException(status_code=404, detail="Мастер с указанным ID не найден")

    # 2. Получаем выбранные услуги из БД
    services = db.query(Service).filter(Service.id.in_(payload.service_ids)).all()
    if not services:
        raise HTTPException(status_code=400, detail="Не выбрана ни одна услуга")

    # Преобразуем в объекты ServiceItem для движка расчёта
    service_items = [
        ServiceItem(
            id=s.id,
            name=s.name,
            category=s.category.value,
            duration_minutes=s.duration_minutes,
            price=float(s.price),
        )
        for s in services
    ]

    # 3. Находим рабочий график мастера на эту дату
    schedule = (
        db.query(MasterSchedule)
        .filter(
            MasterSchedule.master_id == payload.master_id,
            MasterSchedule.date == payload.target_date
        )
        .first()
    )

    # Определяем буфер стерилизации мастера (по умолчанию 15 мин)
    sterilization_buffer = schedule.sterilization_buffer_minutes if schedule else 15

    # Считаем совокупное время и стоимость
    timing = SmartSchedulingEngine.calculate_total_duration(
        selected_services=service_items,
        custom_buffer=sterilization_buffer
    )

    duration_dto = CalculatedDurationDTO(
        services_duration_minutes=timing.services_duration_minutes,
        sterilization_buffer_minutes=timing.sterilization_buffer_minutes,
        total_duration_minutes=timing.total_duration_minutes,
        total_price=timing.total_price,
        services_summary=timing.services_summary,
    )

    # Если график отсутствует или день помечен как выходной:
    if not schedule or not schedule.is_working_day:
        return SlotsResponse(
            date=payload.target_date.isoformat(),
            is_day_off=True,
            duration_breakdown=duration_dto,
            available_slots=[],
            message="Выбранная дата является нерабочим днем мастера",
        )

    # 4. Получаем все действующие бронирования мастера на эту дату
    active_appointments = (
        db.query(Appointment)
        .filter(
            Appointment.master_id == payload.master_id,
            Appointment.date == payload.target_date,
            Appointment.status.in_([AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED]),
        )
        .all()
    )

    # Каждая существующая запись резервирует время процедуры + свой буфер стерилизации!
    booked_intervals = []
    for app in active_appointments:
        start_t = app.start_time
        # Конец интервала брони с учётом буфера стерилизации
        start_m = time_to_minutes(start_t)
        end_m = start_m + app.total_duration_minutes
        end_t = time(hour=(end_m // 60) % 24, minute=end_m % 60)
        booked_intervals.append((start_t, end_t))

    # 5. Обращаемся к SmartSchedulingEngine для расчёта доступных слотов
    slots = SmartSchedulingEngine.find_available_slots(
        work_start=schedule.start_time,
        work_end=schedule.end_time,
        break_start=schedule.break_start,
        break_end=schedule.break_end,
        booked_intervals=booked_intervals,
        total_duration_with_buffer=timing.total_duration_minutes,
        procedure_duration=timing.services_duration_minutes,
        slot_step_minutes=15, # шаг генерации слотов (каждые 15 минут)
        target_date=payload.target_date,
        current_datetime=datetime.now(),
    )

    available_slot_dtos = [
        AvailableSlotDTO(
            start_time=s.start_time,
            end_time=s.end_time,
            buffer_end_time=s.buffer_end_time,
            start_minutes=s.start_minutes,
        )
        for s in slots
    ]

    return SlotsResponse(
        date=payload.target_date.isoformat(),
        is_day_off=False,
        duration_breakdown=duration_dto,
        available_slots=available_slot_dtos,
        message=f"Найдено доступных окон: {len(available_slot_dtos)}" if available_slot_dtos else "Нет окон подходящей длительности на выбранный день",
    )


# =====================================================================
# 3. /api/appointments — СОЗДАНИЕ НОВОЙ ЗАПИСИ (С ФОТОГРАФИЯМИ)
# =====================================================================
@router.post(
    "/appointments",
    response_model=AppointmentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Создание бронирования с загрузкой исходника и референса"
)
def create_appointment(
    payload: AppointmentCreateRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """
    Создает бронирование:
    1. Находит или создает профиль клиента по Telegram ID (`tg_id`).
    2. Проверяет мастера и график на день.
    3. Рассчитывает точное время окончания с учетом выбранных услуг и стерилизации.
    4. Проверяет, не был ли слот занят параллельно другим клиентом.
    5. Прикрепляет Telegram file_id / URL фото исходника ногтей и желаемого референса.
    """
    # 1. Поиск или создание клиента
    client = db.query(User).filter(User.tg_id == payload.tg_id).first()
    if not client:
        client = User(
            tg_id=payload.tg_id,
            role=UserRole.CLIENT,
            first_name=payload.client_name,
            phone=payload.client_phone,
            username=payload.client_username,
            strikes=0,
        )
        db.add(client)
        db.flush()
    else:
        # Обновляем контактные данные при изменении
        client.first_name = payload.client_name
        if payload.client_phone:
            client.phone = payload.client_phone
        if payload.client_username:
            client.username = payload.client_username

    # Проверка на бан за частые неявки
    if client.is_blocked or client.strikes >= 3:
        raise HTTPException(
            status_code=403,
            detail="Онлайн-запись недоступна из-за частых отмен/неявок. Свяжитесь с мастером лично."
        )

    # 2. Получение услуг
    services = db.query(Service).filter(Service.id.in_(payload.service_ids)).all()
    if not services:
        raise HTTPException(status_code=400, detail="Услуги для бронирования не найдены")

    # Считаем длительность и стоимость
    services_duration = sum(s.duration_minutes for s in services)
    total_price = sum(s.price for s in services)
    sterilization_buffer = 15

    total_duration_with_buffer = services_duration + sterilization_buffer

    # 3. Парсим время старта
    try:
        hour, minute = map(int, payload.start_time.split(":"))
        start_t = time(hour=hour, minute=minute)
    except Exception:
        raise HTTPException(status_code=400, detail="Неверный формат времени старта. Ожидается HH:MM")

    # Рассчитываем время окончания процедуры (для клиента)
    start_minutes = hour * 60 + minute
    proc_end_minutes = start_minutes + services_duration
    proc_end_t = time(hour=(proc_end_minutes // 60) % 24, minute=proc_end_minutes % 60)

    # 4. Проверка наложения с существующими активными бронями
    total_end_minutes = start_minutes + total_duration_with_buffer
    conflict = (
        db.query(Appointment)
        .filter(
            Appointment.master_id == payload.master_id,
            Appointment.date == payload.date,
            Appointment.status.in_([AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED]),
        )
        .all()
    )

    for app in conflict:
        app_start_m = time_to_minutes(app.start_time)
        app_end_m = app_start_m + app.total_duration_minutes
        # Проверка пересечения полуинтервалов [start, end)
        if max(start_minutes, app_start_m) < min(total_end_minutes, app_end_m):
            raise HTTPException(
                status_code=409,
                detail="Выбранное время только что было занято другим клиентом. Пожалуйста, выберите другой слот."
            )

    # 5. Сохраняем новую запись
    appointment = Appointment(
        client_id=client.id,
        master_id=payload.master_id,
        date=payload.date,
        start_time=start_t,
        end_time=proc_end_t,
        total_procedure_minutes=services_duration,
        sterilization_buffer_minutes=sterilization_buffer,
        total_duration_minutes=total_duration_with_buffer,
        total_price=total_price,
        status=AppointmentStatus.PENDING,
        photo_current=payload.photo_current_url_or_file_id,
        photo_ref=payload.photo_ref_url_or_file_id,
        comment=payload.comment,
    )

    db.add(appointment)
    db.flush()

    # Фиксируем выбранные услуги в промежуточной таблице с ценами на момент записи
    for s in services:
        ins_stmt = appointment_services_table.insert().values(
            appointment_id=appointment.id,
            service_id=s.id,
            price_at_booking=s.price,
            duration_at_booking=s.duration_minutes,
        )
        db.execute(ins_stmt)

    db.commit()
    db.refresh(appointment)

    # Запуск фоновой отправки мгновенных талонов клиенту и алертов мастеру
    try:
        conf = db.query(GlobalConfig).first()
        studio_addr = conf.studio_address if conf and conf.studio_address else "г. Екатеринбург, ул. Викулова 78, кв. 300"
        studio_cab = conf.studio_cabinet if conf else None
        studio_n = conf.studio_name if conf and conf.studio_name else "Студия маникюра"
        master_ids_list = [
            int(x.strip()) for x in os.getenv("MASTER_TG_IDS", "1324896381,781432351").split(",") if x.strip()
        ]

        background_tasks.add_task(
            notify_new_booking_created,
            appointment_id=appointment.id,
            client_tg_id=client.tg_id,
            client_name=client.first_name,
            client_username=client.username,
            client_phone=client.phone,
            app_date=appointment.date,
            start_time=appointment.start_time,
            end_time=appointment.end_time,
            total_procedure_minutes=appointment.total_procedure_minutes,
            total_price=float(appointment.total_price),
            service_names=[s.name for s in services],
            comment=appointment.comment,
            studio_name=studio_n,
            studio_address=studio_addr,
            studio_cabinet=studio_cab,
            master_tg_ids=master_ids_list,
            photo_current=appointment.photo_current,
            photo_ref=appointment.photo_ref,
        )
    except Exception as e:
        # Логируем, но не блокируем успешный ответ клиенту
        print(f"Ошибка постановки задачи уведомления: {e}")

    return AppointmentResponse(
        id=appointment.id,
        client_id=client.id,
        client_name=client.first_name,
        client_phone=client.phone,
        client_username=client.username,
        master_id=appointment.master_id,
        date=appointment.date.isoformat(),
        start_time=f"{appointment.start_time.hour:02d}:{appointment.start_time.minute:02d}",
        end_time=f"{appointment.end_time.hour:02d}:{appointment.end_time.minute:02d}",
        total_procedure_minutes=appointment.total_procedure_minutes,
        sterilization_buffer_minutes=appointment.sterilization_buffer_minutes,
        total_duration_minutes=appointment.total_duration_minutes,
        total_price=float(appointment.total_price),
        status=appointment.status,
        photo_current=appointment.photo_current,
        photo_ref=appointment.photo_ref,
        comment=appointment.comment,
        services=[s.name for s in services],
        created_at=appointment.created_at,
    )


# =====================================================================
# 4. /api/schedule — КАБИНЕТ МАСТЕРА (РАСПИСАНИЕ НА ДЕНЬ / МЕСЯЦ)
# =====================================================================
@router.get(
    "/schedule",
    response_model=MasterDayScheduleResponse,
    summary="Детальное расписание мастера на выбранную дату с записями"
)
def get_master_day_schedule(
    master_id: int = Query(..., description="ID мастера"),
    schedule_date: date = Query(..., description="Дата (YYYY-MM-DD)"),
    db: Session = Depends(get_db),
):
    """
    Возвращает для Кабинета Мастера (Master LK):
    - Часы работы мастера (start_time, end_time)
    - Обеденный перерыв (break_start, break_end)
    - Список всех записей на этот день с клиентами, их фото (исходник + референс),
      выбранными услугами и суммами.
    - Агрегированную статистику: число записей и плановую выручку.
    """
    schedule = (
        db.query(MasterSchedule)
        .filter(
            MasterSchedule.master_id == master_id,
            MasterSchedule.date == schedule_date,
        )
        .first()
    )

    # Дефолтные значения, если день ещё не настроен
    is_working = schedule.is_working_day if schedule else True
    work_start_str = minutes_to_str(time_to_minutes(schedule.start_time)) if schedule else "10:00"
    work_end_str = minutes_to_str(time_to_minutes(schedule.end_time)) if schedule else "20:00"
    break_start_str = minutes_to_str(time_to_minutes(schedule.break_start)) if (schedule and schedule.break_start) else None
    break_end_str = minutes_to_str(time_to_minutes(schedule.break_end)) if (schedule and schedule.break_end) else None
    buffer_mins = schedule.sterilization_buffer_minutes if schedule else 15

    # Получаем записи на эту дату
    appointments = (
        db.query(Appointment)
        .filter(
            Appointment.master_id == master_id,
            Appointment.date == schedule_date,
        )
        .order_by(Appointment.start_time.asc())
        .all()
    )

    appointment_dtos: List[AppointmentResponse] = []
    total_rev = 0.0

    for app in appointments:
        client = app.client
        if app.status != AppointmentStatus.CANCELLED:
            total_rev += float(app.total_price)

        appointment_dtos.append(
            AppointmentResponse(
                id=app.id,
                client_id=client.id if client else 0,
                client_name=client.first_name if client else "Клиент",
                client_phone=client.phone if client else None,
                client_username=client.username if client else None,
                master_id=app.master_id,
                date=app.date.isoformat(),
                start_time=f"{app.start_time.hour:02d}:{app.start_time.minute:02d}",
                end_time=f"{app.end_time.hour:02d}:{app.end_time.minute:02d}",
                total_procedure_minutes=app.total_procedure_minutes,
                sterilization_buffer_minutes=app.sterilization_buffer_minutes,
                total_duration_minutes=app.total_duration_minutes,
                total_price=float(app.total_price),
                status=app.status,
                photo_current=app.photo_current,
                photo_ref=app.photo_ref,
                comment=app.comment,
                services=[s.name for s in app.services],
                created_at=app.created_at,
            )
        )

    return MasterDayScheduleResponse(
        date=schedule_date.isoformat(),
        is_working_day=is_working,
        start_time=work_start_str,
        end_time=work_end_str,
        break_start=break_start_str,
        break_end=break_end_str,
        sterilization_buffer_minutes=buffer_mins,
        appointments=appointment_dtos,
        total_bookings_count=len(appointment_dtos),
        total_revenue_expected=total_rev,
    )


@router.post(
    "/schedule/day",
    summary="Обновление или создание рабочего дня мастера"
)
def set_master_day_schedule(payload: ScheduleDaySetting, master_id: int = Query(...), db: Session = Depends(get_db)):
    """
    Быстрая настройка рабочего дня: мастер может изменить часы работы,
    включить/выключить рабочий статус дня, поменять время обеда или буфер стерилизации.
    """
    schedule = (
        db.query(MasterSchedule)
        .filter(MasterSchedule.master_id == master_id, MasterSchedule.date == payload.date)
        .first()
    )

    def parse_t(t_str: Optional[str]) -> Optional[time]:
        if not t_str:
            return None
        h, m = map(int, t_str.split(":"))
        return time(hour=h, minute=m)

    if not schedule:
        schedule = MasterSchedule(
            master_id=master_id,
            date=payload.date,
            is_working_day=payload.is_working_day,
            start_time=parse_t(payload.start_time) or time(10, 0),
            end_time=parse_t(payload.end_time) or time(20, 0),
            break_start=parse_t(payload.break_start),
            break_end=parse_t(payload.break_end),
            sterilization_buffer_minutes=payload.sterilization_buffer_minutes,
        )
        db.add(schedule)
    else:
        schedule.is_working_day = payload.is_working_day
        schedule.start_time = parse_t(payload.start_time) or schedule.start_time
        schedule.end_time = parse_t(payload.end_time) or schedule.end_time
        schedule.break_start = parse_t(payload.break_start)
        schedule.break_end = parse_t(payload.break_end)
        schedule.sterilization_buffer_minutes = payload.sterilization_buffer_minutes

    db.commit()
    return {"status": "ok", "message": f"График на {payload.date} успешно сохранен"}


@router.get(
    "/schedule/month",
    response_model=MasterMonthOverviewResponse,
    summary="Обзор расписания мастера на весь месяц с агрегированной статистикой"
)
def get_master_month_schedule(
    master_id: int = Query(..., description="ID мастера"),
    month: str = Query(..., description="Месяц в формате YYYY-MM (например, '2026-09')"),
    db: Session = Depends(get_db)
):
    """
    Возвращает календарную сетку месяца для Кабинета мастера:
    - Статус каждого дня (рабочий / выходной)
    - Часы смены и обед
    - Число записей клиентов и плановую выручку на каждый день
    - Итоговые метрики за месяц
    """
    import calendar

    try:
        year_str, month_str = month.split("-")
        year, m_num = int(year_str), int(month_str)
    except Exception:
        raise HTTPException(status_code=400, detail="Неверный формат месяца. Ожидается YYYY-MM")

    _, num_days = calendar.monthrange(year, m_num)
    start_dt = date(year, m_num, 1)
    end_dt = date(year, m_num, num_days)

    # Загружаем существующие дни графика мастера
    schedules = (
        db.query(MasterSchedule)
        .filter(
            MasterSchedule.master_id == master_id,
            MasterSchedule.date >= start_dt,
            MasterSchedule.date <= end_dt,
        )
        .all()
    )
    schedules_by_date = {s.date.isoformat(): s for s in schedules}

    # Загружаем записи на этот месяц
    appointments = (
        db.query(Appointment)
        .filter(
            Appointment.master_id == master_id,
            Appointment.date >= start_dt,
            Appointment.date <= end_dt,
        )
        .all()
    )

    app_stats: dict[str, dict] = {}
    for app in appointments:
        d_str = app.date.isoformat()
        if d_str not in app_stats:
            app_stats[d_str] = {"count": 0, "revenue": 0.0}
        if app.status != AppointmentStatus.CANCELLED:
            app_stats[d_str]["count"] += 1
            app_stats[d_str]["revenue"] += float(app.total_price)

    day_summaries: List[MasterMonthDaySummary] = []
    total_working = 0
    total_apps = 0
    total_revenue = 0.0

    for day_num in range(1, num_days + 1):
        curr_date = date(year, m_num, day_num)
        curr_str = curr_date.isoformat()
        day_of_week = curr_date.weekday() # 0 = Пн, 6 = Вс

        sch = schedules_by_date.get(curr_str)
        # Если дня нет в базе: по умолчанию будни рабочие (0-5), воскресенье (6) выходной
        is_working = sch.is_working_day if sch else (day_of_week != 6)
        w_start = minutes_to_str(time_to_minutes(sch.start_time)) if sch else "10:00"
        w_end = minutes_to_str(time_to_minutes(sch.end_time)) if sch else "20:00"
        b_start = minutes_to_str(time_to_minutes(sch.break_start)) if (sch and sch.break_start) else "14:00"
        b_end = minutes_to_str(time_to_minutes(sch.break_end)) if (sch and sch.break_end) else "15:00"
        buff = sch.sterilization_buffer_minutes if sch else 15

        stats = app_stats.get(curr_str, {"count": 0, "revenue": 0.0})

        if is_working:
            total_working += 1
        total_apps += stats["count"]
        total_revenue += stats["revenue"]

        day_summaries.append(
            MasterMonthDaySummary(
                date=curr_str,
                day_number=day_num,
                day_of_week=day_of_week,
                is_working_day=is_working,
                start_time=w_start,
                end_time=w_end,
                break_start=b_start,
                break_end=b_end,
                sterilization_buffer_minutes=buff,
                appointments_count=stats["count"],
                revenue_expected=stats["revenue"],
            )
        )

    return MasterMonthOverviewResponse(
        master_id=master_id,
        month=month,
        days=day_summaries,
        total_working_days=total_working,
        total_appointments=total_apps,
        total_revenue=total_revenue,
    )


@router.post(
    "/schedule/template",
    response_model=ScheduleBulkResponse,
    summary="Генерация и сохранение шаблона расписания на месяц"
)
def apply_schedule_template(payload: ScheduleTemplateApplyRequest, db: Session = Depends(get_db)):
    """
    Применяет шаблон рабочего графика мастера на указанный месяц:
    1. Генерирует дни по шаблону ('5_2' — будни, '2_2' — 2 через 2, 'all' — каждый день, 'custom' — выбранные даты).
    2. Устанавливает часы работы (start_time, end_time), обед (break_start, break_end) и буфер стерилизации.
    3. Создает или обновляет записи MasterSchedule в базе данных.
    """
    import calendar

    try:
        year_str, month_str = payload.month.split("-")
        year, m_num = int(year_str), int(month_str)
    except Exception:
        raise HTTPException(status_code=400, detail="Неверный формат месяца. Ожидается YYYY-MM")

    def parse_t(t_str: Optional[str]) -> Optional[time]:
        if not t_str:
            return None
        h, m = map(int, t_str.split(":"))
        return time(hour=h, minute=m)

    parsed_start = parse_t(payload.start_time) or time(10, 0)
    parsed_end = parse_t(payload.end_time) or time(20, 0)
    parsed_b_start = parse_t(payload.break_start)
    parsed_b_end = parse_t(payload.break_end)

    _, num_days = calendar.monthrange(year, m_num)
    start_dt = date(year, m_num, 1)
    end_dt = date(year, m_num, num_days)

    # Получаем уже существующие записи графика мастера за этот месяц
    existing_schedules = (
        db.query(MasterSchedule)
        .filter(
            MasterSchedule.master_id == payload.master_id,
            MasterSchedule.date >= start_dt,
            MasterSchedule.date <= end_dt,
        )
        .all()
    )
    existing_map = {s.date: s for s in existing_schedules}

    custom_dates_set = set(payload.custom_working_dates) if payload.custom_working_dates else set()
    saved_count = 0

    for day_num in range(1, num_days + 1):
        curr_date = date(year, m_num, day_num)
        day_of_week = curr_date.weekday()

        # Вычисляем статус рабочего дня по паттерну
        if payload.pattern == "5_2":
            is_work = (day_of_week < 5) # Пн - Пт
        elif payload.pattern == "2_2":
            is_work = ((day_num - 1) % 4) < 2 # 2 раб, 2 вых
        elif payload.pattern == "all":
            is_work = True
        elif payload.pattern == "custom":
            is_work = (curr_date in custom_dates_set)
        else:
            is_work = (day_of_week != 6)

        schedule_row = existing_map.get(curr_date)
        if not schedule_row:
            schedule_row = MasterSchedule(
                master_id=payload.master_id,
                date=curr_date,
                is_working_day=is_work,
                start_time=parsed_start,
                end_time=parsed_end,
                break_start=parsed_b_start,
                break_end=parsed_b_end,
                sterilization_buffer_minutes=payload.sterilization_buffer_minutes,
            )
            db.add(schedule_row)
        else:
            schedule_row.is_working_day = is_work
            schedule_row.start_time = parsed_start
            schedule_row.end_time = parsed_end
            schedule_row.break_start = parsed_b_start
            schedule_row.break_end = parsed_b_end
            schedule_row.sterilization_buffer_minutes = payload.sterilization_buffer_minutes

        saved_count += 1

    db.commit()
    return ScheduleBulkResponse(
        status="ok",
        message=f"Шаблон графика '{payload.pattern}' успешно применен на {payload.month}",
        saved_days_count=saved_count,
        month=payload.month,
    )


@router.post(
    "/schedule/bulk",
    response_model=ScheduleBulkResponse,
    summary="Пакетное сохранение произвольных настроек дней месяца"
)
def save_bulk_schedule(payload: BulkScheduleSaveRequest, db: Session = Depends(get_db)):
    """
    Пакетное сохранение или обновление массива дней, отредактированных мастером.
    """
    def parse_t(t_str: Optional[str]) -> Optional[time]:
        if not t_str:
            return None
        h, m = map(int, t_str.split(":"))
        return time(hour=h, minute=m)

    saved_count = 0
    month_name = ""

    for item in payload.days:
        if not month_name:
            month_name = item.date.strftime("%Y-%m")

        schedule = (
            db.query(MasterSchedule)
            .filter(MasterSchedule.master_id == payload.master_id, MasterSchedule.date == item.date)
            .first()
        )

        p_start = parse_t(item.start_time) or time(10, 0)
        p_end = parse_t(item.end_time) or time(20, 0)
        p_b_start = parse_t(item.break_start)
        p_b_end = parse_t(item.break_end)

        if not schedule:
            schedule = MasterSchedule(
                master_id=payload.master_id,
                date=item.date,
                is_working_day=item.is_working_day,
                start_time=p_start,
                end_time=p_end,
                break_start=p_b_start,
                break_end=p_b_end,
                sterilization_buffer_minutes=item.sterilization_buffer_minutes,
            )
            db.add(schedule)
        else:
            schedule.is_working_day = item.is_working_day
            schedule.start_time = p_start
            schedule.end_time = p_end
            schedule.break_start = p_b_start
            schedule.break_end = p_b_end
            schedule.sterilization_buffer_minutes = item.sterilization_buffer_minutes

        saved_count += 1

    db.commit()
    return ScheduleBulkResponse(
        status="ok",
        message=f"Успешно сохранено дней: {saved_count}",
        saved_days_count=saved_count,
        month=month_name or "текущий",
    )


@router.patch(
    "/appointments/{appointment_id}/status",
    summary="Изменение статуса записи (подтверждение, отмена, завершение)"
)
def update_appointment_status(
    appointment_id: int,
    status_value: AppointmentStatus,
    reason: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Обновление статуса записи.
    Используется ботом при ответах на напоминания (T-24, T-12, T-8),
    а также мастером в Mini App.
    """
    app = db.query(Appointment).filter(Appointment.id == appointment_id).first()
    if not app:
        raise HTTPException(status_code=404, detail="Запись не найдена")

    app.status = status_value
    if status_value == AppointmentStatus.CONFIRMED:
        app.confirmed_at = datetime.now()
    elif status_value == AppointmentStatus.CANCELLED:
        app.cancelled_at = datetime.now()
        app.cancellation_reason = reason or "Отменено клиентом или системой"

    db.commit()
    return {"status": "ok", "appointment_id": app.id, "new_status": app.status}


# =====================================================================
# 8. НАСТРОЙКИ СТУДИИ (ПРОФИЛЬ, НАЗВАНИЕ, АДРЕС, ГОРОД, ЧАСОВОЙ ПОЯС)
# =====================================================================
@router.get(
    "/config",
    response_model=StudioConfigResponse,
    summary="Получение настроек студии"
)
def get_studio_config(db: Session = Depends(get_db)):
    """Возвращает настройки студии (название, адрес, город, часовой пояс, аватарку)"""
    config = db.query(GlobalConfig).first()
    if not config:
        config = GlobalConfig(
            studio_name="Студия маникюра",
            studio_address="г. Екатеринбург, ул. Викулова 78, кв. 300",
            city="Екатеринбург",
            timezone="Asia/Yekaterinburg",
        )
        db.add(config)
        db.commit()
        db.refresh(config)
    return config


@router.get(
    "/config/cities",
    summary="Список поддерживаемых городов и часовых поясов РФ"
)
def get_supported_cities():
    """Возвращает список городов с часовыми поясами для выбора в настройках"""
    return CITY_TIMEZONES


@router.post(
    "/config",
    response_model=StudioConfigResponse,
    summary="Обновление настроек студии (профиль мастера)"
)
@router.put(
    "/config",
    response_model=StudioConfigResponse,
    summary="Обновление настроек студии (профиль мастера)"
)
def update_studio_config(payload: StudioConfigUpdateRequest, db: Session = Depends(get_db)):
    """Обновляет название студии, адрес, кабинет, город, таймзону или инструкции"""
    config = db.query(GlobalConfig).first()
    if not config:
        config = GlobalConfig()
        db.add(config)

    if payload.studio_name is not None:
        config.studio_name = payload.studio_name
    if payload.studio_address is not None:
        config.studio_address = payload.studio_address
    if payload.studio_cabinet is not None:
        val = payload.studio_cabinet.strip()
        config.studio_cabinet = val if val else None
    if payload.city is not None:
        config.city = payload.city
    if payload.timezone is not None:
        config.timezone = payload.timezone
    if payload.avatar_url is not None:
        config.avatar_url = payload.avatar_url
    if payload.preparation_instructions is not None:
        config.preparation_instructions = payload.preparation_instructions
    if payload.default_sterilization_buffer is not None:
        config.default_sterilization_buffer = payload.default_sterilization_buffer

    db.commit()
    db.refresh(config)
    return config


# =====================================================================
# 9. УПРАВЛЕНИЕ УСЛУГАМИ (CRUD)
# =====================================================================
@router.post(
    "/services",
    response_model=ServiceResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Добавление новой услуги"
)
def create_service(payload: ServiceCreateRequest, db: Session = Depends(get_db)):
    """Создает новую услугу в выбранной категории"""
    # Определяем порядок сортировки, если не задан
    if payload.sort_order is None or payload.sort_order == 0:
        max_order = (
            db.query(func.max(Service.sort_order))
            .filter(Service.category == payload.category)
            .scalar()
            or 0
        )
        sort_order = max_order + 1
    else:
        sort_order = payload.sort_order

    new_service = Service(
        category=payload.category,
        name=payload.name,
        description=payload.description or "",
        duration_minutes=payload.duration_minutes,
        price=payload.price,
        sort_order=sort_order,
        is_active=payload.is_active if payload.is_active is not None else True,
    )
    db.add(new_service)
    db.commit()
    db.refresh(new_service)
    return new_service


@router.put(
    "/services/{service_id}",
    response_model=ServiceResponse,
    summary="Редактирование существующей услуги"
)
def update_service(service_id: int, payload: ServiceUpdateRequest, db: Session = Depends(get_db)):
    """Обновляет параметры услуги (название, цену, длительность, категорию, активность)"""
    srv = db.query(Service).filter(Service.id == service_id).first()
    if not srv:
        raise HTTPException(status_code=404, detail="Услуга не найдена")

    if payload.name is not None:
        srv.name = payload.name
    if payload.category is not None:
        srv.category = payload.category
    if payload.description is not None:
        srv.description = payload.description
    if payload.duration_minutes is not None:
        srv.duration_minutes = payload.duration_minutes
    if payload.price is not None:
        srv.price = payload.price
    if payload.sort_order is not None:
        srv.sort_order = payload.sort_order
    if payload.is_active is not None:
        srv.is_active = payload.is_active

    db.commit()
    db.refresh(srv)
    return srv


@router.delete(
    "/services/{service_id}",
    summary="Удаление или деактивация услуги"
)
def delete_service(service_id: int, hard: bool = False, db: Session = Depends(get_db)):
    """
    По умолчанию деактивирует услугу (is_active = False), чтобы не ломать старые записи.
    Если hard=True — полностью удаляет услугу из БД.
    """
    srv = db.query(Service).filter(Service.id == service_id).first()
    if not srv:
        raise HTTPException(status_code=404, detail="Услуга не найдена")

    if hard:
        # Проверяем, есть ли привязки к записям
        has_apps = db.execute(
            appointment_services_table.select().where(
                appointment_services_table.c.service_id == service_id
            )
        ).first()
        if has_apps:
            # Нельзя удалить жестко — деактивируем
            srv.is_active = False
            db.commit()
            return {"status": "deactivated", "message": "Услуга привязана к записям и была деактивирована"}
        db.delete(srv)
        db.commit()
        return {"status": "deleted", "message": "Услуга успешно удалена"}
    else:
        srv.is_active = False
        db.commit()
        return {"status": "deactivated", "message": "Услуга деактивирована"}


# =====================================================================
# 10. КЛИЕНТСКИЙ ЛК: ПРОСМОТР И ОТМЕНА ЗАПИСЕЙ
# =====================================================================
@router.get(
    "/client/appointments",
    response_model=List[ClientAppointmentItem],
    summary="Получение записей клиента по Telegram ID"
)
def get_client_appointments_api(
    tg_id: int = Query(..., description="Telegram ID клиента"),
    db: Session = Depends(get_db)
):
    """Возвращает историю и активные записи клиента с флагом возможности отмены"""
    user = db.query(User).filter(User.tg_id == tg_id).first()
    if not user:
        return []

    conf = db.query(GlobalConfig).first()
    studio_name = conf.studio_name if conf else "Студия маникюра"
    studio_addr = conf.studio_address if conf else "г. Екатеринбург, ул. Викулова 78, кв. 300"
    studio_cab = conf.studio_cabinet if conf else None

    apps = (
        db.query(Appointment)
        .filter(Appointment.client_id == user.id)
        .order_by(Appointment.date.desc(), Appointment.start_time.desc())
        .all()
    )

    today = date.today()
    result = []
    for app in apps:
        can_cancel = (
            app.status in (AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED)
            and app.date >= today
        )
        result.append(
            ClientAppointmentItem(
                id=app.id,
                date=app.date.isoformat(),
                start_time=f"{app.start_time.hour:02d}:{app.start_time.minute:02d}",
                end_time=f"{app.end_time.hour:02d}:{app.end_time.minute:02d}",
                total_procedure_minutes=app.total_procedure_minutes,
                total_duration_minutes=app.total_duration_minutes,
                total_price=float(app.total_price),
                status=app.status,
                services=[s.name for s in app.services],
                studio_name=studio_name,
                studio_address=studio_addr,
                studio_cabinet=studio_cab,
                comment=app.comment,
                photo_current=app.photo_current,
                photo_ref=app.photo_ref,
                can_cancel=can_cancel,
            )
        )
    return result


@router.post(
    "/appointments/{appointment_id}/client-cancel",
    summary="Отмена записи клиентом из Telegram Mini App"
)
async def cancel_appointment_by_client_api(
    appointment_id: int,
    payload: ClientCancelRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """Клиент отменяет визит, слот освобождается, мастер и лист ожидания оповещаются"""
    app = db.query(Appointment).filter(Appointment.id == appointment_id).first()
    if not app:
        raise HTTPException(status_code=404, detail="Запись не найдена")

    if app.status == AppointmentStatus.CANCELLED:
        return {"status": "already_cancelled", "message": "Запись уже была отменена ранее"}

    app.status = AppointmentStatus.CANCELLED
    app.cancelled_at = datetime.now()
    app.cancellation_reason = payload.reason or "Отменено клиентом в приложении"
    db.commit()

    # Оповещаем мастера
    master_ids_list = [
        int(x.strip()) for x in os.getenv("MASTER_TG_IDS", "1324896381,781432351").split(",") if x.strip()
    ]
    client_name = app.client.first_name if app.client else "Клиент"
    client_uname = app.client.username if app.client else None

    background_tasks.add_task(
        notify_booking_cancelled_to_master,
        appointment_id=app.id,
        client_name=client_name,
        client_username=client_uname,
        app_date=app.date,
        start_time=app.start_time,
        reason=app.cancellation_reason,
        master_tg_ids=master_ids_list,
    )

    # Проверяем лист ожидания
    wl_entry = (
        db.query(WaitlistEntry)
        .filter(
            WaitlistEntry.date == app.date,
            WaitlistEntry.is_notified == False,
        )
        .first()
    )
    if wl_entry and wl_entry.client and wl_entry.client.tg_id:
        webapp_url = os.getenv("WEBAPP_URL", "https://foyer-purging-superbowl.ngrok-free")
        background_tasks.add_task(
            notify_waitlist_slot_available,
            client_tg_id=wl_entry.client.tg_id,
            client_name=wl_entry.client.first_name,
            target_date=app.date,
            webapp_url=webapp_url,
        )
        wl_entry.is_notified = True
        wl_entry.notified_at = datetime.now()
        db.commit()

    return {"status": "ok", "message": "Запись успешно отменена"}


