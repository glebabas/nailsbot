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


def ensure_db_schema_migrated(db_engine):
    """Автоматическая проверка и добавление недостающих столбцов в SQLite при обновлении моделей"""
    from sqlalchemy import text
    with db_engine.connect() as conn:
        # 1. global_configs
        try:
            cfg_cols = [row[1] for row in conn.execute(text("PRAGMA table_info(global_configs)")).fetchall()]
            if cfg_cols:
                cols_to_add = {
                    "studio_name": "VARCHAR(255) DEFAULT 'Студия маникюра'",
                    "studio_address": "VARCHAR(255) DEFAULT 'г. Екатеринбург, ул. Викулова 78, кв. 300'",
                    "studio_cabinet": "VARCHAR(100) DEFAULT NULL",
                    "city": "VARCHAR(100) DEFAULT 'Екатеринбург'",
                    "timezone": "VARCHAR(100) DEFAULT 'Asia/Yekaterinburg'",
                    "avatar_url": "TEXT DEFAULT NULL",
                    "preparation_instructions": "TEXT DEFAULT 'Не наносите масло и жирный крем за 3 часа до визита.'",
                    "llm_api_key": "VARCHAR(255) DEFAULT NULL",
                }
                for col_name, col_def in cols_to_add.items():
                    if col_name not in cfg_cols:
                        conn.execute(text(f"ALTER TABLE global_configs ADD COLUMN {col_name} {col_def}"))
                conn.commit()
        except Exception as e:
            logger.warning(f"Ошибка миграции global_configs: {e}")

        # 2. appointments
        try:
            app_cols = [row[1] for row in conn.execute(text("PRAGMA table_info(appointments)")).fetchall()]
            if app_cols:
                app_cols_to_add = {
                    "photo_current": "TEXT DEFAULT NULL",
                    "photo_ref": "TEXT DEFAULT NULL",
                    "comment": "TEXT DEFAULT NULL",
                    "booking_notified_at": "DATETIME DEFAULT NULL",
                    "reminder_48h_sent_at": "DATETIME DEFAULT NULL",
                    "reminder_24h_sent_at": "DATETIME DEFAULT NULL",
                    "reminder_12h_sent_at": "DATETIME DEFAULT NULL",
                    "reminder_2h_sent_at": "DATETIME DEFAULT NULL",
                    "confirmed_at": "DATETIME DEFAULT NULL",
                    "cancelled_at": "DATETIME DEFAULT NULL",
                    "cancellation_reason": "VARCHAR(255) DEFAULT NULL",
                    "feedback_requested_at": "DATETIME DEFAULT NULL",
                    "feedback_rating": "INTEGER DEFAULT NULL",
                    "feedback_text": "TEXT DEFAULT NULL",
                }
                for col_name, col_def in app_cols_to_add.items():
                    if col_name not in app_cols:
                        conn.execute(text(f"ALTER TABLE appointments ADD COLUMN {col_name} {col_def}"))
                conn.commit()
        except Exception as e:
            logger.warning(f"Ошибка миграции appointments: {e}")


        # 3. users
        try:
            user_cols = [row[1] for row in conn.execute(text("PRAGMA table_info(users)")).fetchall()]
            if user_cols:
                if "reactivation_sent_at" not in user_cols:
                    conn.execute(text("ALTER TABLE users ADD COLUMN reactivation_sent_at DATETIME DEFAULT NULL"))
                conn.commit()
        except Exception as e:
            logger.warning(f"Ошибка миграции users: {e}")


def init_and_seed_db():
    """Создание таблиц и начальное наполнение услугами и графиком мастера (на русском языке)"""
    Base.metadata.create_all(bind=engine)
    ensure_db_schema_migrated(engine)
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
                studio_name="Студия маникюра",
                studio_address="г. Екатеринбург, ул. Викулова 78, кв. 300",
                studio_cabinet=None,
                city="Екатеринбург",
                timezone="Asia/Yekaterinburg",
                preparation_instructions=(
                    "Перед визитом просьба не наносить жирный крем или масло на руки за 3 часа. "
                    "Если у вас есть аллергия на материалы, предупредите заранее."
                ),
            )
            db.add(config)
        else:
            # Обновляем существующий конфиг, если в нем еще дефолтная Москва
            cfg = db.query(GlobalConfig).first()
            if cfg:
                if not cfg.city:
                    cfg.city = "Екатеринбург"
                if not cfg.timezone:
                    cfg.timezone = "Asia/Yekaterinburg"
                if "Арбат" in (cfg.studio_address or ""):
                    cfg.studio_address = "г. Екатеринбург, ул. Викулова 78, кв. 300"
                    cfg.studio_cabinet = None
                db.commit()

        # 2. Каталог услуг (Конструктор: Снятие, База, Дизайн, Ремонт)
        if db.query(Service).count() == 0:
            services_data = [
                # Категория 1: Снятие (Removal)
                Service(
                    category=ServiceCategory.REMOVAL,
                    name="без снятия",
                    description="Ногти чистые, снятие предыдущего материала не требуется",
                    duration_minutes=0,
                    price=0.0,
                    sort_order=1,
                ),
                Service(
                    category=ServiceCategory.REMOVAL,
                    name="снятие покрытия",
                    description="Бережное аппаратное снятие покрытия фрезой",
                    duration_minutes=15,
                    price=0.0,
                    sort_order=2,
                ),
                Service(
                    category=ServiceCategory.REMOVAL,
                    name="снятие наращенных ногтей",
                    description="Снятие наращенных ногтей",
                    duration_minutes=20,
                    price=0.0,
                    sort_order=3,
                ),
                Service(
                    category=ServiceCategory.REMOVAL,
                    name="любое снятие + маникюр (без дальнейшего покрытия)",
                    description="Снятие любого покрытия и гигиенический маникюр",
                    duration_minutes=60,
                    price=900.0,
                    sort_order=4,
                ),

                # Категория 2: Базовая услуга (Base)
                Service(
                    category=ServiceCategory.BASE,
                    name="-",
                    description="Без основного покрытия",
                    duration_minutes=0,
                    price=0.0,
                    sort_order=10,
                ),
                Service(
                    category=ServiceCategory.BASE,
                    name="маникюр с покрытием на свои до 1 длины",
                    description="Маникюр с покрытием на свои ногти до 1 длины",
                    duration_minutes=105,
                    price=1900.0,
                    sort_order=11,
                ),
                Service(
                    category=ServiceCategory.BASE,
                    name="маникюр с наращиванием ногтей длина до 3",
                    description="Маникюр с наращиванием ногтей длина до 3",
                    duration_minutes=140,
                    price=2400.0,
                    sort_order=12,
                ),
                Service(
                    category=ServiceCategory.BASE,
                    name="маникюр с наращивание ногтей длина до 7",
                    description="Маникюр с наращиванием ногтей длина до 7",
                    duration_minutes=160,
                    price=2800.0,
                    sort_order=13,
                ),
                Service(
                    category=ServiceCategory.BASE,
                    name="маникюр с наращиванием ногтей длина до 10",
                    description="Маникюр с наращиванием ногтей длина до 10",
                    duration_minutes=180,
                    price=3400.0,
                    sort_order=14,
                ),

                # Категория 3: Дизайн (Design)
                Service(
                    category=ServiceCategory.DESIGN,
                    name="без дизайна (чистый однотон)",
                    description="Классическое однотонное покрытие",
                    duration_minutes=0,
                    price=0.0,
                    sort_order=20,
                ),
                Service(
                    category=ServiceCategory.DESIGN,
                    name="френч любым цветом",
                    description="Френч любым цветом на всех ногтях",
                    duration_minutes=25,
                    price=0.0,
                    sort_order=21,
                ),
                Service(
                    category=ServiceCategory.DESIGN,
                    name="легкий дизайн (втирка/покрытие гель-лаком/кошачий глаз)",
                    description="Втирка, покрытие гель-лаком или кошачий глаз",
                    duration_minutes=20,
                    price=0.0,
                    sort_order=22,
                ),
                Service(
                    category=ServiceCategory.DESIGN,
                    name="средний дизайн (декоративные элементы/фигурки/бульонки/стразы/паутинка/градиент/минималистичная роспись/наклейки/слайдеры/френч с вышеперечисленным)",
                    description="Декоративные элементы, фигурки, бульонки, стразы, слайдеры, роспись",
                    duration_minutes=45,
                    price=0.0,
                    sort_order=23,
                ),
                Service(
                    category=ServiceCategory.DESIGN,
                    name="сложный дизайн (аквариумный дизайн/авторская роспись/сочетание большого количества элементов и цветов/инкрустация кристаллами/геометрия)",
                    description="Аквариумный дизайн, сложная авторская роспись, инкрустация",
                    duration_minutes=75,
                    price=300.0,
                    sort_order=24,
                ),

                # Категория 4: Ремонт / Укрепление (Repair)
                Service(
                    category=ServiceCategory.REPAIR,
                    name="Ремонт трещины / донаращивание (1 ноготь)",
                    description="Восстановление сломанного уголка или трещины",
                    duration_minutes=15,
                    price=150.0,
                    sort_order=30,
                ),
                Service(
                    category=ServiceCategory.REPAIR,
                    name="Донаращивание угла / длины (1 ноготь)",
                    description="Восстановление формы или донаращивание одного ногтя",
                    duration_minutes=15,
                    price=200.0,
                    sort_order=31,
                ),
            ]
            db.add_all(services_data)
            db.commit()

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
