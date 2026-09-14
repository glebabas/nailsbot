"""
Модуль инициализации базы данных и создания тестовых данных для мастера маникюра.
Поддерживает SQLite (для быстрой локальной разработки) и PostgreSQL (для продакшена).
"""

import os
from datetime import date, time, timedelta
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from backend.models import (
    Base, User, UserRole, Service, ServiceCategory,
    MasterSchedule, Appointment, AppointmentStatus, GlobalConfig
)

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./nail_bot.db")

# Для SQLite требуется check_same_thread=False
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(DATABASE_URL, echo=False, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    """Dependency генератор сессии БД для FastAPI роутов"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_and_seed_db():
    """Создание таблиц и начальное наполнение услугами и графиком мастера (на русском языке)"""
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    try:
        # 1. Проверяем наличие тестового мастера
        master = db.query(User).filter(User.role == UserRole.MASTER).first()
        if not master:
            master = User(
                tg_id=777000123,
                role=UserRole.MASTER,
                first_name="Екатерина",
                last_name="Нейл-Арт",
                username="ekaterina_nails",
                phone="+7 (999) 123-45-67",
                strikes=0,
            )
            db.add(master)
            db.flush()

            # Конфигурация мастера
            config = GlobalConfig(
                master_id=master.id,
                default_sterilization_buffer=15,
                auto_cancel_hours_before=8,
                reminder_first_hours_before=24,
                reminder_second_hours_before=12,
                studio_address="г. Москва, ул. Арбат, д. 10, кабинет 304",
                preparation_instructions=(
                    "Перед визитом просьба не наносить жирный крем или масло на руки за 3 часа. "
                    "Если у вас есть аллергия на материалы, предупредите заранее."
                ),
            )
            db.add(config)

        # 2. Каталог услуг (Конструктор: Снятие, База, Дизайн, Ремонт)
        if db.query(Service).count() == 0:
            services_data = [
                # Категория 1: Снятие (Removal)
                Service(
                    category=ServiceCategory.REMOVAL,
                    name="Без снятия",
                    description="Ногти чистые, снятие предыдущего материала не требуется",
                    duration_minutes=0,
                    price=0.0,
                    sort_order=1,
                ),
                Service(
                    category=ServiceCategory.REMOVAL,
                    name="Снятие гель-лака другого мастера",
                    description="Бережное аппаратное снятие покрытия фрезой",
                    duration_minutes=20,
                    price=300.0,
                    sort_order=2,
                ),
                Service(
                    category=ServiceCategory.REMOVAL,
                    name="Снятие нарощенных ногтей / акрила",
                    description="Полное спиливание искусственного материала",
                    duration_minutes=35,
                    price=600.0,
                    sort_order=3,
                ),
                Service(
                    category=ServiceCategory.REMOVAL,
                    name="Снятие моей работы с последующим покрытием",
                    description="Бесплатное снятие предыдущей работы нашего мастера",
                    duration_minutes=15,
                    price=0.0,
                    sort_order=4,
                ),

                # Категория 2: Базовая услуга (Base)
                Service(
                    category=ServiceCategory.BASE,
                    name="Комбинированный маникюр + гель-лак (однотон)",
                    description="Аппаратная + ножничная обработка кутикулы, выравнивание базой, цветное покрытие под кутикулу",
                    duration_minutes=90,
                    price=2200.0,
                    sort_order=10,
                ),
                Service(
                    category=ServiceCategory.BASE,
                    name="Маникюр с укреплением твердым гелем / полигелем",
                    description="Укрепление тонких, ломких или скручивающихся ногтей гелем",
                    duration_minutes=110,
                    price=2700.0,
                    sort_order=11,
                ),
                Service(
                    category=ServiceCategory.BASE,
                    name="Наращивание ногтей (длина 1-3)",
                    description="Моделирование ногтей на верхние или нижние формы гелем/акригелем",
                    duration_minutes=150,
                    price=3800.0,
                    sort_order=12,
                ),
                Service(
                    category=ServiceCategory.BASE,
                    name="Экспресс-маникюр гигиенический (без покрытия)",
                    description="Обработка кутикулы, придание формы свободному краю, полировка или лечебное масло",
                    duration_minutes=45,
                    price=1200.0,
                    sort_order=13,
                ),

                # Категория 3: Дизайн (Design)
                Service(
                    category=ServiceCategory.DESIGN,
                    name="Без дизайна (чистый однотон)",
                    description="Классическое монохромное покрытие без элементов декора",
                    duration_minutes=0,
                    price=0.0,
                    sort_order=20,
                ),
                Service(
                    category=ServiceCategory.DESIGN,
                    name="Французский маникюр (Френч / Лунный)",
                    description="Идеальная белая или цветная линия улыбки на всех пальцах",
                    duration_minutes=30,
                    price=500.0,
                    sort_order=21,
                ),
                Service(
                    category=ServiceCategory.DESIGN,
                    name="Втирка / Градиент (Омбре)",
                    description="Зеркальный блеск или плавный переход цветов на всех ногтях",
                    duration_minutes=25,
                    price=450.0,
                    sort_order=22,
                ),
                Service(
                    category=ServiceCategory.DESIGN,
                    name="Сложная ручная роспись / дизайн 4+ ногтей",
                    description="Геометрия, абстракция, рисунки от руки, слайдеры, инкрустация стразами",
                    duration_minutes=45,
                    price=800.0,
                    sort_order=23,
                ),

                # Категория 4: Ремонт / Укрепление (Repair)
                Service(
                    category=ServiceCategory.REPAIR,
                    name="Ремонт трещины / донаращивание (1 ноготь)",
                    description="Восстановление сломанного уголка или трещины шелком/акригелем",
                    duration_minutes=15,
                    price=150.0,
                    sort_order=30,
                ),
            ]
            db.add_all(services_data)
            db.flush()

        # 3. Создаем расписание мастера на ближайшие 14 дней
        today = date.today()
        for offset in range(14):
            day = today + timedelta(days=offset)
            existing_schedule = db.query(MasterSchedule).filter(
                MasterSchedule.master_id == master.id,
                MasterSchedule.date == day
            ).first()

            if not existing_schedule:
                # Воскресенье сделаем выходным для реалистичности
                is_off = day.weekday() == 6
                new_sched = MasterSchedule(
                    master_id=master.id,
                    date=day,
                    is_working_day=not is_off,
                    start_time=time(10, 0),
                    end_time=time(20, 0),
                    break_start=time(14, 0) if not is_off else None,
                    break_end=time(15, 0) if not is_off else None,
                    sterilization_buffer_minutes=15,
                )
                db.add(new_sched)

        db.commit()
    except Exception as e:
        db.rollback()
        raise e
    finally:
        db.close()
