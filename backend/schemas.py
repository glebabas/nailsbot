"""
Pydantic-схемы валидации запросов и ответов для API Telegram Mini App
Стек: Pydantic v2, Python 3.11+
Все описания и поля ориентированы на русскоязычный интерфейс Mini App.
"""

import datetime as dt
from datetime import date, time, datetime
from typing import List, Optional, Dict
from pydantic import BaseModel, Field
from backend.models import ServiceCategory, AppointmentStatus, UserRole


# ==========================================
# 1. УСЛУГИ (SERVICES)
# ==========================================
class ServiceResponse(BaseModel):
    id: int
    category: ServiceCategory
    name: str
    description: Optional[str] = None
    duration_minutes: int
    price: float
    is_active: bool
    sort_order: int

    class Config:
        from_attributes = True


class CategorizedServicesResponse(BaseModel):
    """Сгруппированные услуги для конструктора Mini App"""
    removal: List[ServiceResponse] = Field(default_factory=list, description="Снятие старого покрытия")
    base: List[ServiceResponse] = Field(default_factory=list, description="Основной маникюр / покрытие / наращивание")
    design: List[ServiceResponse] = Field(default_factory=list, description="Дизайн ногтей")
    repair: List[ServiceResponse] = Field(default_factory=list, description="Ремонт и укрепление")


# ==========================================
# 2. РАСЧЁТ СЛОТОВ (SLOTS & CONSTRUCTOR)
# ==========================================
class SlotsRequest(BaseModel):
    """Запрос на расчёт доступных слотов"""
    master_id: int = Field(..., description="ID мастера маникюра")
    target_date: date = Field(..., description="Выбранная дата записи (YYYY-MM-DD)")
    service_ids: List[int] = Field(..., min_length=1, description="Список ID выбранных услуг из конструктора")


class CalculatedDurationDTO(BaseModel):
    services_duration_minutes: int = Field(..., description="Суммарное время процедур (мин)")
    sterilization_buffer_minutes: int = Field(..., description="Время на стерилизацию инструментов (мин)")
    total_duration_minutes: int = Field(..., description="Полное время окна с буфером (мин)")
    total_price: float = Field(..., description="Итоговая ориентировочная стоимость (руб)")
    services_summary: List[str] = Field(..., description="Список названий выбранных услуг")


class AvailableSlotDTO(BaseModel):
    start_time: str = Field(..., description="Время начала процедуры, например '14:30'")
    end_time: str = Field(..., description="Расчётное время завершения процедуры, например '16:30'")
    buffer_end_time: str = Field(..., description="Время завершения вместе со стерилизацией, например '16:45'")
    start_minutes: int


class SlotsResponse(BaseModel):
    date: str
    is_day_off: bool = False
    duration_breakdown: CalculatedDurationDTO
    available_slots: List[AvailableSlotDTO]
    message: Optional[str] = None


# ==========================================
# 3. ЗАПИСИ (APPOINTMENTS)
# ==========================================
class AppointmentCreateRequest(BaseModel):
    """Создание бронирования из Mini App"""
    master_id: int = Field(..., description="ID мастера")
    tg_id: int = Field(..., description="Telegram ID клиента")
    client_name: str = Field(..., min_length=2, description="Имя клиента для контакта")
    client_phone: Optional[str] = Field(None, description="Контактный номер телефона")
    client_username: Optional[str] = Field(None, description="Telegram username без @")
    
    date: dt.date = Field(..., description="Дата визита (YYYY-MM-DD)")
    start_time: str = Field(..., description="Выбранное время начала в формате 'HH:MM'")
    service_ids: List[int] = Field(..., min_length=1, description="ID выбранных услуг")
    
    # Фото-система (исходник и референс)
    photo_current_url_or_file_id: Optional[str] = Field(
        None, description="Telegram file_id или ссылка на фото текущего состояния ногтей (Исходник)"
    )
    photo_ref_url_or_file_id: Optional[str] = Field(
        None, description="Telegram file_id или ссылка на фото желаемого дизайна (Референс)"
    )
    comment: Optional[str] = Field(None, description="Пожелания клиента / комментарий к фото")


class AppointmentResponse(BaseModel):
    id: int
    client_id: int
    client_name: str
    client_phone: Optional[str] = None
    client_username: Optional[str] = None
    master_id: int
    date: str
    start_time: str
    end_time: str
    total_procedure_minutes: int
    sterilization_buffer_minutes: int
    total_duration_minutes: int
    total_price: float
    status: AppointmentStatus
    photo_current: Optional[str] = None
    photo_ref: Optional[str] = None
    comment: Optional[str] = None
    services: List[str]
    created_at: dt.datetime

    class Config:
        from_attributes = True


# ==========================================
# 4. РАСПИСАНИЕ МАСТЕРА (SCHEDULE)
# ==========================================
class ScheduleDaySetting(BaseModel):
    date: dt.date
    is_working_day: bool
    start_time: str = "10:00"
    end_time: str = "20:00"
    break_start: Optional[str] = "14:00"
    break_end: Optional[str] = "15:00"
    sterilization_buffer_minutes: int = 15


class ScheduleTemplateApplyRequest(BaseModel):
    """Применение шаблона расписания на месяц"""
    master_id: int = Field(..., description="ID мастера")
    month: str = Field(..., description="Месяц в формате YYYY-MM (например, '2026-09')")
    pattern: str = Field("5_2", description="Шаблон смен: '2_2', '5_2', 'all', 'custom'")
    start_time: str = Field("10:00", description="Время начала рабочего дня (HH:MM)")
    end_time: str = Field("20:00", description="Время окончания рабочего дня (HH:MM)")
    break_start: Optional[str] = Field("14:00", description="Время начала обеда (HH:MM)")
    break_end: Optional[str] = Field("15:00", description="Время окончания обеда (HH:MM)")
    sterilization_buffer_minutes: int = Field(15, description="Буфер стерилизации между клиентами в минутах")
    custom_working_dates: Optional[List[dt.date]] = Field(None, description="Список конкретных рабочих дат (для custom)")


class BulkScheduleSaveRequest(BaseModel):
    """Пакетное сохранение произвольного списка настроек дней"""
    master_id: int
    days: List[ScheduleDaySetting]


class ScheduleBulkResponse(BaseModel):
    status: str
    message: str
    saved_days_count: int
    month: str


class MasterDayScheduleResponse(BaseModel):
    date: str
    is_working_day: bool
    start_time: str
    end_time: str
    break_start: Optional[str] = None
    break_end: Optional[str] = None
    sterilization_buffer_minutes: int
    appointments: List[AppointmentResponse]
    total_bookings_count: int
    total_revenue_expected: float


class MasterMonthDaySummary(BaseModel):
    date: str
    day_number: int
    day_of_week: int # 0=Monday, 6=Sunday
    is_working_day: bool
    start_time: str
    end_time: str
    break_start: Optional[str] = None
    break_end: Optional[str] = None
    sterilization_buffer_minutes: int
    appointments_count: int
    revenue_expected: float


class MasterMonthOverviewResponse(BaseModel):
    master_id: int
    month: str # "2026-09"
    days: List[MasterMonthDaySummary]
    total_working_days: int
    total_appointments: int
    total_revenue: float

