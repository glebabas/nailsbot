"""
Database models for Nail Technician Telegram Bot & Mini App
Stack: Python, SQLAlchemy 2.0 (Declarative Base), PostgreSQL
All user-facing statuses and categories have Russian descriptions.
"""

from datetime import datetime, date, time
from enum import Enum as PyEnum
from typing import List, Optional

from sqlalchemy import (
    BigInteger,
    Boolean,
    Column,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Table,
    Text,
    Time,
    func,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class UserRole(str, PyEnum):
    CLIENT = "client"      # Клиент
    MASTER = "master"      # Мастер маникюра
    ADMIN = "admin"        # Администратор / Владелец


class ServiceCategory(str, PyEnum):
    REMOVAL = "removal"    # Снятие старого материала
    BASE = "base"          # Основная процедура (маникюр, покрытие, укрепление, наращивание)
    DESIGN = "design"      # Дизайн (френч, втирка, стемпинг, сложная роспись)
    REPAIR = "repair"      # Ремонт / донаращивание одного ногтя


class AppointmentStatus(str, PyEnum):
    PENDING = "pending"          # Ожидает подтверждения
    CONFIRMED = "confirmed"      # Подтверждена клиентом (T-24 / T-12)
    CANCELLED = "cancelled"      # Отменена клиентом или авто-отменена (T-8)
    COMPLETED = "completed"      # Успешно выполнена
    NO_SHOW = "no_show"          # Неявка клиента (увеличивает strikes)


# Вспомогательная таблица связи "Многие-ко-многим" для услуг в записи
appointment_services_table = Table(
    "appointment_services",
    Base.metadata,
    Column("appointment_id", Integer, ForeignKey("appointments.id", ondelete="CASCADE"), primary_key=True),
    Column("service_id", Integer, ForeignKey("services.id", ondelete="RESTRICT"), primary_key=True),
    Column("price_at_booking", Numeric(10, 2), nullable=False, comment="Фиксированная цена на момент записи"),
    Column("duration_at_booking", Integer, nullable=False, comment="Фиксированная длительность в минутах"),
)


class User(Base):
    """Пользователи системы: Клиенты, Мастера и Администраторы"""
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tg_id: Mapped[int] = mapped_column(BigInteger, unique=True, index=True, nullable=False, comment="Telegram Chat/User ID")
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), default=UserRole.CLIENT, nullable=False)
    
    first_name: Mapped[str] = mapped_column(String(100), nullable=False)
    last_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    username: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, comment="Telegram username без @")
    phone: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    
    strikes: Mapped[int] = mapped_column(Integer, default=0, nullable=False, comment="Количество пропусков записей")
    is_blocked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    reactivation_sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True, comment="Дата отправки предложения вернуться (через 90 дней)")
    
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Связи
    client_appointments: Mapped[List["Appointment"]] = relationship(
        "Appointment", foreign_keys="Appointment.client_id", back_populates="client"
    )
    master_schedules: Mapped[List["MasterSchedule"]] = relationship(
        "MasterSchedule", back_populates="master", cascade="all, delete-orphan"
    )
    waitlist_entries: Mapped[List["WaitlistEntry"]] = relationship(
        "WaitlistEntry", foreign_keys="WaitlistEntry.client_id", back_populates="client"
    )


class Service(Base):
    """Справочник услуг (Конструктор: Снятие, База, Дизайн, Ремонт)"""
    __tablename__ = "services"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    category: Mapped[ServiceCategory] = mapped_column(Enum(ServiceCategory), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(150), nullable=False, comment="Название услуги на русском")
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False, comment="Время выполнения в минутах")
    price: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False, comment="Стоимость услуги в рублях")
    
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class MasterSchedule(Base):
    """Рабочий график мастера по дням"""
    __tablename__ = "master_schedules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    master_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True, comment="Дата смены")
    is_working_day: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    
    start_time: Mapped[time] = mapped_column(Time, nullable=False, default=time(10, 0), comment="Начало рабочего дня")
    end_time: Mapped[time] = mapped_column(Time, nullable=False, default=time(20, 0), comment="Окончание рабочего дня")
    
    # Перерыв мастера (обед / отдых)
    break_start: Mapped[Optional[time]] = mapped_column(Time, nullable=True, comment="Начало обеденного перерыва")
    break_end: Mapped[Optional[time]] = mapped_column(Time, nullable=True, comment="Окончание обеденного перерыва")
    
    # Буфер на стерилизацию и проветривание кабинета
    sterilization_buffer_minutes: Mapped[int] = mapped_column(
        Integer, default=15, nullable=False, comment="Буфер на стерилизацию между клиентами (мин)"
    )

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Связи
    master: Mapped["User"] = relationship("User", back_populates="master_schedules")


class Appointment(Base):
    """Бронирование процедуры маникюра"""
    __tablename__ = "appointments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    client_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True)
    master_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True)
    
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    start_time: Mapped[time] = mapped_column(Time, nullable=False, index=True)
    end_time: Mapped[time] = mapped_column(Time, nullable=False, index=True)
    
    # Рассчитанные агрегаты
    total_procedure_minutes: Mapped[int] = mapped_column(Integer, nullable=False, comment="Чистое время услуг")
    sterilization_buffer_minutes: Mapped[int] = mapped_column(Integer, default=15, nullable=False)
    total_duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False, comment="Процедура + стерилизация")
    total_price: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    
    status: Mapped[AppointmentStatus] = mapped_column(
        Enum(AppointmentStatus), default=AppointmentStatus.PENDING, nullable=False, index=True
    )
    
    # Фото-система перед записью
    photo_current: Mapped[Optional[str]] = mapped_column(Text, nullable=True, comment="URL/FileID фото текущих ногтей (Исходник)")
    photo_ref: Mapped[Optional[str]] = mapped_column(Text, nullable=True, comment="URL/FileID фото желаемого дизайна (Референс)")
    comment: Mapped[Optional[str]] = mapped_column(Text, nullable=True, comment="Комментарий клиента к референсу")
    
    # Флаги напоминаний и подтверждений (T-48h, T-24h, T-12h, T-8h, T-2h)
    booking_notified_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True, comment="Дата отправки мгновенного талона клиенту")
    reminder_48h_sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True, comment="Запрос подтверждения за 48ч")
    reminder_24h_sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True, comment="Напоминание за 24ч")
    reminder_12h_sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True, comment="Резервное напоминание за 12ч")
    reminder_2h_sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True, comment="Напоминание за 2ч с адресом и домофоном")
    confirmed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    cancelled_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    cancellation_reason: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    
    # Отзыв после процедуры (через 1ч)
    feedback_requested_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True, comment="Дата запроса отзыва")
    feedback_rating: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, comment="Оценка клиента от 1 до 5 звёзд")
    feedback_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True, comment="Текстовый комментарий клиента")
    
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Связи
    client: Mapped["User"] = relationship("User", foreign_keys=[client_id], back_populates="client_appointments")
    master: Mapped["User"] = relationship("User", foreign_keys=[master_id])
    services: Mapped[List["Service"]] = relationship("Service", secondary=appointment_services_table)


class WaitlistEntry(Base):
    """Лист ожидания: клиенты, ожидающие освобождения слота на конкретную дату"""
    __tablename__ = "waitlist"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    client_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    master_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    required_duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    preferred_time_from: Mapped[Optional[time]] = mapped_column(Time, nullable=True)
    preferred_time_to: Mapped[Optional[time]] = mapped_column(Time, nullable=True)
    
    is_notified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    notified_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Связи
    client: Mapped["User"] = relationship("User", foreign_keys=[client_id], back_populates="waitlist_entries")
    master: Mapped["User"] = relationship("User", foreign_keys=[master_id])


class GlobalConfig(Base):
    """Глобальные настройки системы и мастера (для Admin Panel)"""
    __tablename__ = "global_configs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    master_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True, unique=True)
    
    default_sterilization_buffer: Mapped[int] = mapped_column(Integer, default=15, nullable=False)
    auto_cancel_hours_before: Mapped[int] = mapped_column(Integer, default=8, nullable=False)
    reminder_first_hours_before: Mapped[int] = mapped_column(Integer, default=24, nullable=False)
    reminder_second_hours_before: Mapped[int] = mapped_column(Integer, default=12, nullable=False)
    
    studio_name: Mapped[str] = mapped_column(String(255), default="Студия маникюра", nullable=False)
    studio_address: Mapped[str] = mapped_column(String(255), default="г. Москва, ул. Арбат, д. 10", nullable=False)
    avatar_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    preparation_instructions: Mapped[str] = mapped_column(
        Text, 
        default="Не наносите масло и жирный крем для рук за 3 часа до визита. Приходите без опозданий.",
        nullable=False
    )
    llm_api_key: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
