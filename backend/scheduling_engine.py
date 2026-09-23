"""
Smart Scheduling Engine for Nail Technician Telegram Mini App & Bot
Алгоритмический модуль динамического расчёта слотов с учётом конструктора услуг и буфера стерилизации.
"""

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from typing import List, Optional, Tuple


@dataclass
class TimeInterval:
    """Временной интервал (в минутах от начала дня)"""
    start_minutes: int
    end_minutes: int

    @property
    def duration(self) -> int:
        return self.end_minutes - self.start_minutes

    def overlaps(self, other: "TimeInterval") -> bool:
        """Пересекаются ли интервалы"""
        return max(self.start_minutes, other.start_minutes) < min(self.end_minutes, other.end_minutes)


def time_to_minutes(t: time) -> int:
    """Перевод времени (HH:MM) в количество минут от 00:00"""
    return t.hour * 60 + t.minute


def minutes_to_time(m: int) -> time:
    """Перевод минут от 00:00 в объект time"""
    hours = (m // 60) % 24
    mins = m % 60
    return time(hour=hours, minute=mins)


def minutes_to_str(m: int) -> str:
    """Форматирование в строку HH:MM"""
    t = minutes_to_time(m)
    return f"{t.hour:02d}:{t.minute:02d}"


@dataclass
class ServiceItem:
    id: int
    name: str
    category: str
    duration_minutes: int
    price: float


@dataclass
class CalculatedDuration:
    """Результат расчёта времени конструктора услуг"""
    services_duration_minutes: int
    sterilization_buffer_minutes: int
    total_duration_minutes: int
    total_price: float
    services_summary: List[str]


@dataclass
class AvailableSlot:
    """Доступный временной слот для клиента"""
    start_time: str               # "14:30"
    end_time: str                 # "16:45" (с учётом процедуры)
    buffer_end_time: str          # "17:00" (с учётом стерилизации)
    start_minutes: int
    procedure_duration: int
    total_duration_with_buffer: int


class SmartSchedulingEngine:
    """
    Интеллектуальный движок расчёта доступных окон для мастера маникюра.
    Решает проблему разрушения графика из-за непредвиденных объёмов работы:
    клиент выбирает все этапы -> система считает точное время -> предлагает только подходящие окна.
    """

    DEFAULT_STERILIZATION_BUFFER = 20  # минут на перерыв между записями
    SLOT_STEP_MINUTES = 15             # шаг сетки слотов (каждые 15 минут)

    @classmethod
    def calculate_total_duration(
        cls,
        selected_services: List[ServiceItem],
        custom_buffer: Optional[int] = None
    ) -> CalculatedDuration:
        """
        Шаг 1: Конструктор услуг.
        Total_Duration = Снятие + База + Дизайн + Ремонт + Стерилизация (буфер)
        """
        buffer = custom_buffer if custom_buffer is not None else cls.DEFAULT_STERILIZATION_BUFFER
        services_duration = sum(s.duration_minutes for s in selected_services)
        total_price = sum(s.price for s in selected_services)
        services_names = [s.name for s in selected_services]

        total_with_buffer = services_duration + buffer

        return CalculatedDuration(
            services_duration_minutes=services_duration,
            sterilization_buffer_minutes=buffer,
            total_duration_minutes=total_with_buffer,
            total_price=total_price,
            services_summary=services_names,
        )

    @classmethod
    def compute_free_blocks(
        cls,
        work_start: time,
        work_end: time,
        break_start: Optional[time],
        break_end: Optional[time],
        booked_intervals: List[Tuple[time, time]],
    ) -> List[TimeInterval]:
        """
        Шаг 2: Поиск непрерывных свободных окон мастера (Free Blocks).
        Вычитает из рабочего дня обеденный перерыв мастера и занятые записи.
        """
        work_start_m = time_to_minutes(work_start)
        work_end_m = time_to_minutes(work_end)

        # Список всех занятых интервалов (в минутах)
        busy_intervals: List[TimeInterval] = []

        # Добавляем обед мастера (если задан)
        if break_start and break_end:
            b_start_m = time_to_minutes(break_start)
            b_end_m = time_to_minutes(break_end)
            if b_end_m > b_start_m:
                busy_intervals.append(TimeInterval(b_start_m, b_end_m))

        # Добавляем подтвержденные/ожидающие записи
        for b_start, b_end in booked_intervals:
            busy_intervals.append(TimeInterval(time_to_minutes(b_start), time_to_minutes(b_end)))

        # Сортируем и объединяем перекрывающиеся занятые интервалы
        if not busy_intervals:
            return [TimeInterval(work_start_m, work_end_m)]

        busy_intervals.sort(key=lambda x: x.start_minutes)
        merged_busy: List[TimeInterval] = []

        for current in busy_intervals:
            if not merged_busy:
                merged_busy.append(current)
            else:
                last = merged_busy[-1]
                if current.start_minutes <= last.end_minutes:
                    # Объединяем наложение
                    merged_busy[-1] = TimeInterval(last.start_minutes, max(last.end_minutes, current.end_minutes))
                else:
                    merged_busy.append(current)

        # Вычисляем свободные промежутки между рабочим началом, концом и занятыми окнами
        free_blocks: List[TimeInterval] = []
        cursor = work_start_m

        for busy in merged_busy:
            # Ограничиваем рамками рабочего дня
            busy_start = max(work_start_m, busy.start_minutes)
            busy_end = min(work_end_m, busy.end_minutes)

            if busy_start > cursor:
                free_blocks.append(TimeInterval(cursor, busy_start))
            cursor = max(cursor, busy_end)

        if cursor < work_end_m:
            free_blocks.append(TimeInterval(cursor, work_end_m))

        return free_blocks

    @classmethod
    def find_available_slots(
        cls,
        work_start: time,
        work_end: time,
        break_start: Optional[time],
        break_end: Optional[time],
        booked_intervals: List[Tuple[time, time]],
        total_duration_with_buffer: int,
        procedure_duration: int,
        slot_step_minutes: Optional[int] = None,
        target_date: Optional[date] = None,
        current_datetime: Optional[datetime] = None,
    ) -> List[AvailableSlot]:
        """
        Шаг 3: Генерация доступных слотов для записи.
        Показывает только те стартовые слоты, в которые гарантированно помещается:
        Время услуги + Буфер стерилизации.
        Также учитывает текущее время (нельзя записаться в прошлое).
        """
        step = slot_step_minutes or cls.SLOT_STEP_MINUTES
        free_blocks = cls.compute_free_blocks(
            work_start=work_start,
            work_end=work_end,
            break_start=break_start,
            break_end=break_end,
            booked_intervals=booked_intervals,
        )

        available_slots: List[AvailableSlot] = []

        # Минимально допустимое время старта (если запись идет на сегодня)
        min_start_minutes = 0
        if target_date and current_datetime and target_date == current_datetime.date():
            # Запрещаем слоты в прошлом + добавляем 30 минут запаса на сборы клиента
            min_start_minutes = current_datetime.hour * 60 + current_datetime.minute + 30

        for block in free_blocks:
            # Свободное окно должно быть не меньше полной продолжительности с буфером
            if block.duration < total_duration_with_buffer:
                continue

            # Генерируем точки старта с заданным шагом сетки
            current_start = block.start_minutes

            # Выравниваем первую точку старта по сетке шага (например, кратно 15 минутам)
            remainder = current_start % step
            if remainder != 0:
                current_start += (step - remainder)

            while current_start + total_duration_with_buffer <= block.end_minutes:
                if current_start >= min_start_minutes:
                    procedure_end_m = current_start + procedure_duration
                    buffer_end_m = current_start + total_duration_with_buffer

                    available_slots.append(
                        AvailableSlot(
                            start_time=minutes_to_str(current_start),
                            end_time=minutes_to_str(procedure_end_m),
                            buffer_end_time=minutes_to_str(buffer_end_m),
                            start_minutes=current_start,
                            procedure_duration=procedure_duration,
                            total_duration_with_buffer=total_duration_with_buffer,
                        )
                    )
                current_start += step

        return available_slots

    @classmethod
    def check_waitlist_eligibility(
        cls,
        freed_interval: TimeInterval,
        client_desired_duration_with_buffer: int,
        preferred_from: Optional[time] = None,
        preferred_to: Optional[time] = None,
    ) -> bool:
        """
        Шаг 4: Проверка возможности уведомить клиента из Листа Ожидания при освобождении слота.
        Срабатывает при отмене записи (T-8h или ручная отмена клиентом).
        """
        if freed_interval.duration < client_desired_duration_with_buffer:
            return False

        if preferred_from and freed_interval.start_minutes < time_to_minutes(preferred_from):
            # Освободилось раньше желаемого диапазона клиента
            pass

        if preferred_to and (freed_interval.start_minutes + client_desired_duration_with_buffer) > time_to_minutes(preferred_to):
            return False

        return True
