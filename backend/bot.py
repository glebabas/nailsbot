"""
Telegram Bot для онлайн-записи мастера маникюра на aiogram 3.x.
Архитектура без сторонних ИИ-модулей (Gemini отменен).

Функционал:
1. Обработка базовых команд (/start, /help).
2. Определение роли пользователя по Telegram ID (Клиент vs Мастер).
3. Инлайн-кнопки открытия Telegram Mini App (TWA WebAppInfo) с изоляцией прав:
   - Клиенту: кнопка "💅 Записаться" (открывает ClientApp) и "💬 Связь с мастером".
   - Мастеру: добавляется кнопка "⚙️ Кабинет мастера" (открывает MasterApp).
4. Игнорирование спама и вывод стандартизированного меню.
"""

import os
import logging
import asyncio
from typing import Optional, List
from datetime import datetime, date, time, timedelta

from aiogram import Bot, Dispatcher, Router, F
from aiogram.filters import CommandStart, Command
from aiogram.types import (
    Message,
    CallbackQuery,
    InlineKeyboardMarkup,
    InlineKeyboardButton,
    ReplyKeyboardMarkup,
    KeyboardButton,
    WebAppInfo,
)
from aiogram.enums import ParseMode
from aiogram.client.default import DefaultBotProperties

from backend.database import SessionLocal
from backend.models import Appointment, AppointmentStatus, User, UserRole, GlobalConfig, WaitlistEntry
from backend.time_utils import get_local_naive_now, format_address_with_cabinet
from backend.notifications import notify_waitlist_slot_available

# Логирование
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("nail_master_bot")

# Конфигурация из переменных окружения
BOT_TOKEN = os.getenv("BOT_TOKEN", "8830834734:AAEFCB2GbJxmkYDvYlBAkqQuAfwHfukiOXQ")
WEBAPP_URL = os.getenv("WEBAPP_URL", "https://foyer-purging-superbowl.ngrok-free")
MASTER_USERNAME = os.getenv("MASTER_USERNAME", "wrhal").lstrip("@")

# Список Telegram ID мастеров и администраторов
# Мастер по умолчанию (ID можно переопределить через env MASTER_TG_ID)
MASTER_TG_IDS = set(
    int(x.strip()) for x in os.getenv("MASTER_TG_IDS", "1324896381,781432351").split(",") if x.strip()
)

router = Router(name="main_router")


def is_master_user(tg_id: int) -> bool:
    """Проверка, является ли пользователь мастером/админом"""
    return tg_id in MASTER_TG_IDS


def get_client_keyboard(webapp_url: str, master_username: str) -> InlineKeyboardMarkup:
    """Клавиатура для клиента: Запись в Mini App, просмотр записей и связь с мастером"""
    buttons = [
        [
            InlineKeyboardButton(
                text="💅 Записаться (Mini App)",
                web_app=WebAppInfo(url=f"{webapp_url}?role=client")
            )
        ],
        [
            InlineKeyboardButton(
                text="📅 Мои записи",
                callback_data="client:my_appointments"
            ),
            InlineKeyboardButton(
                text="💬 Связь с мастером",
                url=f"https://t.me/{master_username}"
            )
        ],
        [
            InlineKeyboardButton(
                text="📍 Адрес и подготовка",
                callback_data="info:address"
            ),
            InlineKeyboardButton(
                text="ℹ️ Как работает запись",
                callback_data="info:rules"
            )
        ]
    ]
    return InlineKeyboardMarkup(inline_keyboard=buttons)


def get_client_reply_keyboard(webapp_url: str) -> ReplyKeyboardMarkup:
    """Постоянные кнопки чата внизу экрана для быстрого доступа клиента"""
    return ReplyKeyboardMarkup(
        keyboard=[
            [
                KeyboardButton(text="💅 Записаться онлайн", web_app=WebAppInfo(url=f"{webapp_url}?role=client")),
                KeyboardButton(text="📅 Мои записи")
            ],
            [
                KeyboardButton(text="📍 Адрес студии"),
                KeyboardButton(text="💬 Написать мастеру")
            ]
        ],
        resize_keyboard=True
    )


def get_master_keyboard(webapp_url: str, master_username: str) -> InlineKeyboardMarkup:
    """Клавиатура для мастера: Кабинет Мастера, Настройки и Тест клиента"""
    buttons = [
        [
            InlineKeyboardButton(
                text="📋 Кабинет мастера (Записи и График)",
                web_app=WebAppInfo(url=f"{webapp_url}?role=master")
            )
        ],
        [
            InlineKeyboardButton(
                text="⚙️ Настройки (Услуги, Адрес, Аватарка)",
                web_app=WebAppInfo(url=f"{webapp_url}?view=settings")
            )
        ],
        [
            InlineKeyboardButton(
                text="👁️ Предпросмотр (как клиент)",
                web_app=WebAppInfo(url=f"{webapp_url}?role=client")
            )
        ],
        [
            InlineKeyboardButton(
                text="💬 Мой профиль для клиентов",
                url=f"https://t.me/{master_username}"
            )
        ],
        [
            InlineKeyboardButton(
                text="📊 Быстрая сводка дня",
                callback_data="master:summary"
            )
        ]
    ]
    return InlineKeyboardMarkup(inline_keyboard=buttons)


# =====================================================================
# КОМАНДА /start
# =====================================================================
@router.message(CommandStart())
async def command_start_handler(message: Message):
    """
    Обработка команды /start:
    - Проверяет Telegram ID.
    - Мастеру выдает меню с управлением расписанием, услугами и кабинетом.
    - Клиенту выдает приветствие и кнопки записи и связи с мастером.
    """
    user = message.from_user
    if not user:
        return

    first_name = user.first_name or "Гость"
    user_id = user.id

    if is_master_user(user_id):
        # Меню мастера
        text = (
            f"👋 <b>Здравствуйте, {first_name}! (Панель мастера)</b>\n\n"
            f"Вы авторизованы как мастер ногтевого сервиса.\n\n"
            f"Вам доступны функции управления:\n"
            f"• 🛠️ <b>Настройки:</b> название студии, адрес, аватарка, каталог услуг и цены\n"
            f"• 🗓️ <b>График:</b> рабочие смены и шаблоны на месяц\n"
            f"• 📋 <b>Записи:</b> карточки клиентов с референсами и фото исходников\n"
            f"• ⏱️ <b>Перерыв:</b> автоматический 20-минутный перерыв между клиентами\n"
            f"• 💰 <b>Выручка:</b> расчет планового дохода\n"
            f"• 👁️ <b>Предпросмотр:</b> команда /test для проверки от лица клиента\n\n"
            f"Нажмите кнопку ниже, чтобы открыть нужный раздел:"
        )
        keyboard = get_master_keyboard(WEBAPP_URL, MASTER_USERNAME)
    else:
        # Меню клиента
        text = (
            f"Здравствуйте, {first_name}! 💅\n\n"
            f"Добро пожаловать в студию ногтевого сервиса <b>Екатерины</b>!\n\n"
            f"У нас действует <b>Умный Конструктор услуг</b>:\n"
            f"1. Выберите этапы (снятие, укрепление, желаемый дизайн и ремонт).\n"
            f"2. Система автоматически рассчитает точное время работы.\n"
            f"3. Выберите идеально подходящее время и прикрепите фото референса!\n\n"
            f"Нажмите <b>«Записаться»</b>, чтобы открыть Mini App:"
        )
        keyboard = get_client_keyboard(WEBAPP_URL, MASTER_USERNAME)
        await message.answer(text, reply_markup=keyboard, parse_mode=ParseMode.HTML)
        await message.answer("📌 Для быстрого доступа используйте кнопки меню ниже:", reply_markup=get_client_reply_keyboard(WEBAPP_URL))
        return

    await message.answer(text, reply_markup=keyboard, parse_mode=ParseMode.HTML)


# =====================================================================
# КОМАНДА /settings
# =====================================================================
@router.message(Command("settings"))
async def command_settings_handler(message: Message):
    """Прямая команда /settings для открытия настроек студии и услуг"""
    user = message.from_user
    user_id = user.id if user else 0
    if not is_master_user(user_id):
        await message.answer("Эта команда доступна только мастеру.")
        return

    keyboard = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="⚙️ Открыть Настройки (Mini App)",
                    web_app=WebAppInfo(url=f"{WEBAPP_URL}?view=settings")
                )
            ]
        ]
    )
    await message.answer(
        "🛠 <b>Настройки студии и каталога услуг</b>\n\n"
        "Здесь вы можете:\n"
        "• Изменить название студии и адрес\n"
        "• Загрузить фото/аватарку студии\n"
        "• Добавлять, редактировать или удалять услуги и цены\n\n"
        "Нажмите кнопку ниже, чтобы открыть настройки:",
        reply_markup=keyboard,
        parse_mode=ParseMode.HTML
    )


# =====================================================================
# КОМАНДА /test (Предпросмотр от лица клиента)
# =====================================================================
@router.message(Command("test"))
async def command_test_handler(message: Message):
    """
    Команда /test для мастера:
    Позволяет мастеру увидеть и протестировать интерфейс онлайн-записи
    глазами обычного клиента.
    """
    user = message.from_user
    user_id = user.id if user else 0
    if not is_master_user(user_id):
        await message.answer("Эта команда доступна только мастеру.")
        return

    first_name = user.first_name if user else "Мастер"
    text = (
        f"👁️ <b>Режим предпросмотра для мастера ({first_name}):</b>\n\n"
        "Вы открываете приложение точно так же, как его видит клиент.\n"
        "Можно протестировать выбор услуг, подсчет времени, "
        "выбор даты и создание записи.\n\n"
        "Нажмите кнопку ниже:"
    )

    keyboard = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="💅 Открыть как клиент (Тест)",
                    web_app=WebAppInfo(url=f"{WEBAPP_URL}?role=client")
                )
            ],
            [
                InlineKeyboardButton(
                    text="⚙️ Вернуться в Кабинет мастера",
                    web_app=WebAppInfo(url=f"{WEBAPP_URL}?role=master")
                )
            ]
        ]
    )
    await message.answer(text, reply_markup=keyboard, parse_mode=ParseMode.HTML)


# =====================================================================
# КОМАНДА /help
# =====================================================================
@router.message(Command("help"))
async def command_help_handler(message: Message):
    """Справка о сервисе и контакты"""
    user_id = message.from_user.id if message.from_user else 0
    is_master = is_master_user(user_id)

    text = (
        "<b>Справка по онлайн-записи:</b>\n\n"
        "✨ <b>Как работает динамический расчет?</b>\n"
        "Каждая процедура состоит из этапов: снятие старого материала, маникюр с выравниванием, дизайн и ремонт. "
        "Система на лету суммирует точное время каждого этапа и закладывает 15 минут на дезинфекцию и сушку инструментов. "
        "Вам показываются только те окна, в которые процедура гарантированно поместится!\n\n"
        "📸 <b>Зачем нужны фотографии?</b>\n"
        "Фото исходника помогает мастеру заранее оценить сложность кутикулы и длину, а референс — подготовить нужные материалы.\n\n"
        f"💬 <b>Прямой контакт мастера:</b> @{MASTER_USERNAME}"
    )

    kb = get_master_keyboard(WEBAPP_URL, MASTER_USERNAME) if is_master else get_client_keyboard(WEBAPP_URL, MASTER_USERNAME)
    await message.answer(text, reply_markup=kb, parse_mode=ParseMode.HTML)


# =====================================================================
# ПРОСМОТР ЗАПИСЕЙ КЛИЕНТА (В БОТЕ)
# =====================================================================
async def send_client_appointments(bot: Bot, chat_id: int, tg_id: int):
    """Отправляет клиенту детальный список его записей с кнопками управления"""
    db = SessionLocal()
    try:
        conf = db.query(GlobalConfig).first()
        raw_addr = conf.studio_address if conf and conf.studio_address else "г. Екатеринбург, ул. Викулова 78, кв. 300"
        cab = conf.studio_cabinet if conf else None
        formatted_address = format_address_with_cabinet(raw_addr, cab)

        client_user = db.query(User).filter(User.tg_id == tg_id).first()
        if not client_user:
            text = (
                "💅 <b>У вас пока нет активных записей.</b>\n\n"
                "Вы можете выбрать удобный день и время в онлайн-расписании прямо сейчас:"
            )
            kb = InlineKeyboardMarkup(
                inline_keyboard=[
                    [
                        InlineKeyboardButton(
                            text="💅 Записаться онлайн",
                            web_app=WebAppInfo(url=f"{WEBAPP_URL}?role=client")
                        )
                    ]
                ]
            )
            await bot.send_message(chat_id, text, reply_markup=kb, parse_mode=ParseMode.HTML)
            return

        apps = (
            db.query(Appointment)
            .filter(Appointment.client_id == client_user.id)
            .order_by(Appointment.date.desc(), Appointment.start_time.desc())
            .limit(10)
            .all()
        )

        if not apps:
            text = (
                "💅 <b>У вас пока нет активных записей.</b>\n\n"
                "Вы можете выбрать удобный день и время в онлайн-расписании:"
            )
            kb = InlineKeyboardMarkup(
                inline_keyboard=[
                    [
                        InlineKeyboardButton(
                            text="💅 Записаться онлайн",
                            web_app=WebAppInfo(url=f"{WEBAPP_URL}?role=client")
                        )
                    ]
                ]
            )
            await bot.send_message(chat_id, text, reply_markup=kb, parse_mode=ParseMode.HTML)
            return

        today = date.today()
        upcoming = [a for a in apps if a.date >= today and a.status in (AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED)]
        past = [a for a in apps if a not in upcoming]

        if upcoming:
            await bot.send_message(chat_id, f"📋 <b>Ваши предстоящие записи ({len(upcoming)}):</b>", parse_mode=ParseMode.HTML)
            for app in upcoming:
                status_badge = "⏳ Ожидает подтверждения" if app.status == AppointmentStatus.PENDING else "✅ Подтверждена"
                date_str = app.date.strftime("%d.%m.%Y")
                start_str = app.start_time.strftime("%H:%M")
                end_str = app.end_time.strftime("%H:%M")
                services_str = ", ".join(s.name for s in app.services) if app.services else "Маникюр"
                price_str = f"{float(app.total_price):,.0f} ₽"

                card_text = (
                    f"💅 <b>Запись на {date_str}</b>\n\n"
                    f"⏰ <b>Время:</b> {start_str} — {end_str}\n"
                    f"📌 <b>Статус:</b> {status_badge}\n"
                    f"💰 <b>Стоимость:</b> {price_str}\n"
                    f"💅 <b>Услуги:</b> {services_str}\n\n"
                    f"📍 <b>Адрес:</b> {formatted_address}"
                )

                kb = InlineKeyboardMarkup(
                    inline_keyboard=[
                        [
                            InlineKeyboardButton(
                                text="❌ Отменить эту запись",
                                callback_data=f"cancel_client:{app.id}"
                            )
                        ],
                        [
                            InlineKeyboardButton(
                                text="💅 Открыть в Mini App",
                                web_app=WebAppInfo(url=f"{WEBAPP_URL}?role=client")
                            )
                        ]
                    ]
                )
                await bot.send_message(chat_id, card_text, reply_markup=kb, parse_mode=ParseMode.HTML)
        else:
            await bot.send_message(
                chat_id,
                "✨ <b>Предстоящих записей пока нет.</b>\nВы можете оформить новую запись в любое удобное время:",
                reply_markup=InlineKeyboardMarkup(
                    inline_keyboard=[
                        [
                            InlineKeyboardButton(
                                text="💅 Записаться онлайн",
                                web_app=WebAppInfo(url=f"{WEBAPP_URL}?role=client")
                            )
                        ]
                    ]
                ),
                parse_mode=ParseMode.HTML
            )

        if past:
            past_lines = []
            for a in past[:4]:
                st_icon = "🏁" if a.status == AppointmentStatus.COMPLETED else "❌"
                st_label = "Завершена" if a.status == AppointmentStatus.COMPLETED else "Отменена"
                past_lines.append(f"• {a.date.strftime('%d.%m.%Y')} в {a.start_time.strftime('%H:%M')} — {st_icon} {st_label}")
            past_summary = "📜 <b>История предыдущих визитов:</b>\n" + "\n".join(past_lines)
            await bot.send_message(chat_id, past_summary, parse_mode=ParseMode.HTML)

    finally:
        db.close()


@router.message(Command("my_appointments"))
@router.message(Command("appointments"))
@router.message(F.text.in_(["📅 Мои записи", "Мои записи", "мои записи"]))
async def message_my_appointments_handler(message: Message):
    """Команда просмотра записей клиентом"""
    user = message.from_user
    if not user:
        return
    await send_client_appointments(message.bot, message.chat.id, user.id)


@router.callback_query(F.data == "client:my_appointments")
async def callback_my_appointments_handler(callback: CallbackQuery):
    """Инлайн-кнопка просмотра записей клиентом"""
    await callback.answer()
    user = callback.from_user
    if not user:
        return
    await send_client_appointments(callback.bot, callback.message.chat.id, user.id)


@router.message(F.text.in_(["📍 Адрес студии", "Адрес студии", "адрес"]))
async def message_address_handler(message: Message):
    """Быстрый просмотр адреса по кнопке меню"""
    db = SessionLocal()
    try:
        conf = db.query(GlobalConfig).first()
        studio_addr = conf.studio_address if conf and conf.studio_address else "г. Екатеринбург, ул. Викулова 78, кв. 300"
        cab = conf.studio_cabinet if conf else None
        formatted_address = format_address_with_cabinet(studio_addr, cab)
        instructions = conf.preparation_instructions if conf and conf.preparation_instructions else "Пожалуйста, не наносите жирный крем или масло для кутикулы за 2-3 часа до визита."
        text = (
            f"📍 <b>Адрес студии:</b>\n"
            f"{formatted_address}\n\n"
            f"⚠️ <b>Памятка перед визитом:</b>\n"
            f"• {instructions}\n"
            f"• Старайтесь приходить вовремя: мастер готовит рабочее место индивидуально."
        )
        await message.answer(text, parse_mode=ParseMode.HTML)
    finally:
        db.close()


@router.message(F.text.in_(["💬 Написать мастеру", "Связь с мастером"]))
async def message_contact_master_handler(message: Message):
    """Быстрая ссылка на диалог с мастером"""
    kb = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="💬 Открыть диалог с мастером",
                    url=f"https://t.me/{MASTER_USERNAME}"
                )
            ]
        ]
    )
    await message.answer(
        f"💅 <b>Мастер маникюра на связи:</b> @{MASTER_USERNAME}\n"
        f"Вы можете задать любой вопрос или уточнить детали дизайна:",
        reply_markup=kb,
        parse_mode=ParseMode.HTML
    )


# =====================================================================
# CALLBACK-ЗАПРОСЫ ИНФО-КНОПОК
# =====================================================================
@router.callback_query(F.data == "info:address")
async def callback_address_handler(callback: CallbackQuery):
    await callback.answer()
    db = SessionLocal()
    try:
        conf = db.query(GlobalConfig).first()
        studio_addr = conf.studio_address if conf and conf.studio_address else "г. Екатеринбург, ул. Викулова 78, кв. 300"
        cab = conf.studio_cabinet if conf else None
        formatted_address = format_address_with_cabinet(studio_addr, cab)
        instructions = conf.preparation_instructions if conf and conf.preparation_instructions else "Пожалуйста, не наносите жирный крем или масло для кутикулы за 2-3 часа до визита."
        text = (
            f"📍 <b>Адрес студии:</b>\n"
            f"{formatted_address}\n\n"
            f"⚠️ <b>Памятка перед визитом:</b>\n"
            f"• {instructions}\n"
            f"• Старайтесь приходить вовремя: мастер готовит инструменты и рабочее место заранее."
        )
        await callback.message.answer(text, parse_mode=ParseMode.HTML)
    finally:
        db.close()


@router.callback_query(F.data == "info:rules")
async def callback_rules_handler(callback: CallbackQuery):
    await callback.answer()
    text = (
        "🛡️ <b>Правила записи и подтверждения:</b>\n\n"
        "• За 24 часа и за 12 часов бот присылает автоматическое напоминание с кнопкой подтверждения.\n"
        "• Если запись не подтверждена за 8 часов до визита, слот автоматически освобождается для листа ожидания.\n"
        "• Отменить или перенести запись без потери рейтинга можно не позднее чем за 12 часов."
    )
    await callback.message.answer(text, parse_mode=ParseMode.HTML)


@router.callback_query(F.data == "master:summary")
async def callback_master_summary(callback: CallbackQuery):
    user_id = callback.from_user.id if callback.from_user else 0
    if not is_master_user(user_id):
        await callback.answer("Доступ только для мастера", show_alert=True)
        return

    await callback.answer()
    text = (
        "📊 <b>Быстрая сводка мастера на сегодня:</b>\n\n"
        "• Рабочие часы: 10:00 — 20:00\n"
        "• Обеденный перерыв: 14:00 — 15:00\n"
        "• Перерыв между окнами: 20 минут\n\n"
        "Для детального просмотра записей и настройки шаблона графика на месяц "
        "откройте <b>«⚙️ Кабинет мастера (Mini App)»</b>."
    )
    await callback.message.answer(text, parse_mode=ParseMode.HTML)


# =====================================================================
# ОБРАБОТЧИКИ ПОДТВЕРЖДЕНИЙ, ОТМЕН И ОТЗЫВОВ КЛИЕНТА
# =====================================================================
@router.callback_query(F.data.startswith("confirm:"))
async def callback_confirm_handler(callback: CallbackQuery):
    """Клиент подтверждает визит за 48ч или 24ч"""
    app_id = int(callback.data.split(":")[1])
    db = SessionLocal()
    try:
        app = db.query(Appointment).filter(Appointment.id == app_id).first()
        if not app:
            await callback.answer("Запись не найдена", show_alert=True)
            return

        if app.status == AppointmentStatus.CANCELLED:
            await callback.answer("Эта запись была ранее отменена", show_alert=True)
            return

        app.status = AppointmentStatus.CONFIRMED
        app.confirmed_at = datetime.now()
        db.commit()

        await callback.answer("Запись подтверждена! Ждём вас 💅")
        await callback.message.edit_text(
            f"✅ <b>Запись подтверждена!</b>\n\n"
            f"📅 <b>{app.date.strftime('%d.%m.%Y')} в {app.start_time.strftime('%H:%M')}</b>\n"
            f"Ждём вас к назначенному времени ✨",
            parse_mode=ParseMode.HTML
        )

        # Уведомляем мастера
        client_name = app.client.first_name if app.client else "Клиент"
        uname_str = f"(@{app.client.username})" if app.client and app.client.username else ""
        services_str = ", ".join(s.name for s in app.services) if app.services else "Маникюр"
        master_msg = (
            f"✅ <b>Клиент подтвердил запись!</b>\n\n"
            f"👤 Клиент: <b>{client_name}</b> {uname_str}\n"
            f"📅 <b>{app.date.strftime('%d.%m.%Y')} в {app.start_time.strftime('%H:%M')}</b>\n"
            f"💅 {services_str}"
        )
        for mid in MASTER_TG_IDS:
            try:
                await callback.bot.send_message(mid, master_msg, parse_mode=ParseMode.HTML)
            except Exception:
                pass
    finally:
        db.close()


@router.callback_query(F.data.startswith("cancel_client:"))
async def callback_cancel_client_handler(callback: CallbackQuery):
    """Клиент отменяет визит по кнопке"""
    app_id = int(callback.data.split(":")[1])
    db = SessionLocal()
    try:
        app = db.query(Appointment).filter(Appointment.id == app_id).first()
        if not app:
            await callback.answer("Запись не найдена", show_alert=True)
            return

        app.status = AppointmentStatus.CANCELLED
        app.cancelled_at = datetime.now()
        app.cancellation_reason = "Отменено клиентом в Telegram"
        db.commit()

        await callback.answer("Запись отменена")
        await callback.message.edit_text(
            f"❌ <b>Запись отменена</b>\n\n"
            f"Слот на {app.date.strftime('%d.%m.%Y')} в {app.start_time.strftime('%H:%M')} освобождён.\n"
            f"Будем рады видеть вас в другой раз! 🌸",
            parse_mode=ParseMode.HTML
        )

        # Уведомляем мастера
        client_name = app.client.first_name if app.client else "Клиент"
        uname_str = f"(@{app.client.username})" if app.client and app.client.username else ""
        master_msg = (
            f"❌ <b>Клиент отменил запись</b>\n\n"
            f"👤 Клиент: <b>{client_name}</b> {uname_str}\n"
            f"📅 <b>{app.date.strftime('%d.%m.%Y')} в {app.start_time.strftime('%H:%M')}</b>\n"
            f"Слот снова свободен в графике."
        )
        for mid in MASTER_TG_IDS:
            try:
                await callback.bot.send_message(mid, master_msg, parse_mode=ParseMode.HTML)
            except Exception:
                pass

        # Проверяем лист ожидания на освободившуюся дату
        wl_entry = (
            db.query(WaitlistEntry)
            .filter(
                WaitlistEntry.date == app.date,
                WaitlistEntry.is_notified == False,
            )
            .first()
        )
        if wl_entry and wl_entry.client and wl_entry.client.tg_id:
            try:
                await notify_waitlist_slot_available(
                    wl_entry.client.tg_id,
                    wl_entry.client.first_name,
                    app.date,
                    WEBAPP_URL,
                )
                wl_entry.is_notified = True
                wl_entry.notified_at = datetime.now()
                db.commit()
            except Exception as ex:
                logger.warning(f"Ошибка оповещения waitlist: {ex}")
    finally:
        db.close()


@router.callback_query(F.data.startswith("rate:"))
async def callback_rate_handler(callback: CallbackQuery):
    """Клиент ставит оценку 1..5 звёзд в 1 клик"""
    parts = callback.data.split(":")
    app_id = int(parts[1])
    stars = int(parts[2])

    db = SessionLocal()
    try:
        app = db.query(Appointment).filter(Appointment.id == app_id).first()
        if not app:
            await callback.answer("Запись не найдена", show_alert=True)
            return

        app.feedback_rating = stars
        db.commit()

        stars_str = "⭐" * stars
        await callback.answer(f"Спасибо за оценку {stars}/5!")
        await callback.message.edit_text(
            f"⭐ <b>Ваша оценка: {stars_str} ({stars}/5)</b>\n\n"
            f"Спасибо большое за обратную связь! 💖\n"
            f"<i>(Если хотите оставить пару слов или пожелание мастеру, просто напишите в ответном сообщении)</i>",
            parse_mode=ParseMode.HTML
        )

        # Уведомляем мастера
        client_name = app.client.first_name if app.client else "Клиент"
        uname_str = f"(@{app.client.username})" if app.client and app.client.username else ""
        master_msg = (
            f"⭐ <b>Новая оценка от клиента!</b>\n\n"
            f"👤 Клиент: <b>{client_name}</b> {uname_str}\n"
            f"Оценка: <b>{stars} из 5</b> {stars_str}\n"
            f"Дата визита: {app.date.strftime('%d.%m.%Y')}"
        )
        for mid in MASTER_TG_IDS:
            try:
                await callback.bot.send_message(mid, master_msg, parse_mode=ParseMode.HTML)
            except Exception:
                pass
    finally:
        db.close()


# =====================================================================
# ОБРАБОТКА ТЕКСТОВЫХ СООБЩЕНИЙ (ОТЗЫВЫ ИЛИ СПАМ)
# =====================================================================
@router.message()
async def fallback_text_handler(message: Message):
    """
    1. Если клиент недавно поставил оценку — сохраняет текстовый отзыв.
    2. Иначе вежливо возвращает пользователя к основному меню.
    """
    user_id = message.from_user.id if message.from_user else 0
    is_master = is_master_user(user_id)

    # Проверяем, не является ли это текстовым отзывом после оценки в течение последних 24ч
    db = SessionLocal()
    try:
        recent_feedback_app = (
            db.query(Appointment)
            .join(User, Appointment.client_id == User.id)
            .filter(
                User.tg_id == user_id,
                Appointment.feedback_rating.isnot(None),
                Appointment.feedback_text.is_(None),
                Appointment.feedback_requested_at >= datetime.now() - timedelta(days=1)
            )
            .order_by(Appointment.id.desc())
            .first()
        )
        if recent_feedback_app and message.text:
            recent_feedback_app.feedback_text = message.text
            db.commit()

            await message.answer(
                "💖 <b>Спасибо за ваш отзыв!</b>\n"
                "Мастер обязательно его прочитает. Будем рады видеть вас снова! ✨",
                parse_mode=ParseMode.HTML
            )

            client_name = recent_feedback_app.client.first_name if recent_feedback_app.client else "Клиент"
            uname_str = f"(@{recent_feedback_app.client.username})" if recent_feedback_app.client and recent_feedback_app.client.username else ""
            stars_visual = "⭐" * (recent_feedback_app.feedback_rating or 5)
            master_alert = (
                f"💬 <b>Отзыв от клиента {client_name} {uname_str}!</b>\n\n"
                f"Оценка: <b>{recent_feedback_app.feedback_rating}/5</b> {stars_visual}\n"
                f"Отзыв: <i>«{message.text}»</i>"
            )
            for mid in MASTER_TG_IDS:
                try:
                    await message.bot.send_message(mid, master_alert, parse_mode=ParseMode.HTML)
                except Exception:
                    pass
            return
    finally:
        db.close()

    # Стандартный ответ с меню
    text = (
        "Я работаю в автоматическом режиме для онлайн-записи. "
        "Пожалуйста, воспользуйтесь кнопкой ниже для перехода в <b>Mini App</b> "
        f"или напишите напрямую мастеру: @{MASTER_USERNAME}."
    )
    kb = get_master_keyboard(WEBAPP_URL, MASTER_USERNAME) if is_master else get_client_keyboard(WEBAPP_URL, MASTER_USERNAME)
    await message.answer(text, reply_markup=kb, parse_mode=ParseMode.HTML)


# =====================================================================
# ФОНОВЫЙ ШЕДУЛЕР УВЕДОМЛЕНИЙ (T-48h, T-24h, T-8h, T-2h, +1h, 90 дней)
# =====================================================================
async def check_and_send_scheduled_events(bot: Bot):
    """Проверяет базу данных и отправляет необходимые уведомления по графику с учетом часового пояса студии"""
    db = SessionLocal()
    try:
        conf = db.query(GlobalConfig).first()
        tz_name = conf.timezone if conf and conf.timezone else "Asia/Yekaterinburg"
        studio_addr = conf.studio_address if conf and conf.studio_address else "г. Екатеринбург, ул. Викулова 78, кв. 300"
        cab = conf.studio_cabinet if conf else None
        formatted_addr = format_address_with_cabinet(studio_addr, cab)

        now_local = get_local_naive_now(tz_name)
        now_dt = datetime.now()

        recent_date = now_local.date() - timedelta(days=1)
        future_date = now_local.date() + timedelta(days=3)

        appointments = (
            db.query(Appointment)
            .filter(
                Appointment.date >= recent_date,
                Appointment.date <= future_date,
            )
            .all()
        )

        for app in appointments:
            if not app.client or not app.client.tg_id:
                continue

            app_start = datetime.combine(app.date, app.start_time)
            app_end = datetime.combine(app.date, app.end_time)
            hours_to_start = (app_start - now_local).total_seconds() / 3600.0
            hours_since_end = (now_local - app_end).total_seconds() / 3600.0

            client_tg_id = app.client.tg_id
            client_name = app.client.first_name
            date_str = app.date.strftime("%d.%m.%Y")
            start_str = app.start_time.strftime("%H:%M")
            services_str = ", ".join(s.name for s in app.services) if app.services else "Маникюр"

            # 1. Запрос подтверждения за 48 часов (от 48ч до 8ч, status=PENDING, reminder_48h не отправлен)
            if 8.0 < hours_to_start <= 48.0 and app.status == AppointmentStatus.PENDING and app.reminder_48h_sent_at is None:
                kb = InlineKeyboardMarkup(
                    inline_keyboard=[
                        [
                            InlineKeyboardButton(text="✅ Подтверждаю", callback_data=f"confirm:{app.id}"),
                            InlineKeyboardButton(text="❌ Не смогу прийти", callback_data=f"cancel_client:{app.id}")
                        ]
                    ]
                )
                text = (
                    f"⏳ <b>Подтвердите запись на маникюр!</b>\n\n"
                    f"📅 <b>{date_str} в {start_str}</b>\n"
                    f"📍 <b>Адрес:</b> {formatted_addr}\n"
                    f"💅 {services_str}\n"
                    f"💰 {float(app.total_price):,.0f} ₽\n\n"
                    f"Пожалуйста, подтвердите визит кнопкой ниже:"
                )
                try:
                    await bot.send_message(client_tg_id, text, reply_markup=kb, parse_mode=ParseMode.HTML)
                    app.reminder_48h_sent_at = now_dt
                    db.commit()
                except Exception as ex:
                    logger.warning(f"Не удалось отправить 48h напоминание в {client_tg_id}: {ex}")

            # 2. Напоминание за 24 часа (от 24ч до 8ч, reminder_24h не отправлен)
            elif 8.0 < hours_to_start <= 24.0 and app.reminder_24h_sent_at is None:
                if app.status == AppointmentStatus.CONFIRMED:
                    text = (
                        f"🌸 <b>Напоминаем: завтра визит на маникюр!</b>\n\n"
                        f"⏰ <b>{start_str}</b> | 📍 {formatted_addr}\n"
                        f"💅 {services_str}\n\n"
                        f"💡 <i>Памятка: не наносите масло и жирный крем за 2–3 часа до визита.</i>"
                    )
                    try:
                        await bot.send_message(client_tg_id, text, parse_mode=ParseMode.HTML)
                        app.reminder_24h_sent_at = now_dt
                        db.commit()
                    except Exception as ex:
                        logger.warning(f"Не удалось отправить 24h напоминание в {client_tg_id}: {ex}")
                elif app.status == AppointmentStatus.PENDING:
                    kb = InlineKeyboardMarkup(
                        inline_keyboard=[
                            [
                                InlineKeyboardButton(text="✅ Подтверждаю", callback_data=f"confirm:{app.id}"),
                                InlineKeyboardButton(text="❌ Не смогу прийти", callback_data=f"cancel_client:{app.id}")
                            ]
                        ]
                    )
                    text = (
                        f"⚠️ <b>Вы ещё не подтвердили визит на завтра!</b>\n\n"
                        f"⏰ <b>{start_str}</b> | 📍 {formatted_addr}\n\n"
                        f"<i>Если запись не будет подтверждена за 8 часов до приёма, бронь автоматически аннулируется:</i>"
                    )
                    try:
                        await bot.send_message(client_tg_id, text, reply_markup=kb, parse_mode=ParseMode.HTML)
                        app.reminder_24h_sent_at = now_dt
                        db.commit()
                    except Exception as ex:
                        logger.warning(f"Не удалось отправить 24h запрос подтверждения в {client_tg_id}: {ex}")

            # 3. Авто-отмена за 8 часов неподтверждённых записей
            elif 0 < hours_to_start <= 8.0 and app.status == AppointmentStatus.PENDING:
                app.status = AppointmentStatus.CANCELLED
                app.cancelled_at = now_dt
                app.cancellation_reason = "Не подтверждено за 8 часов до приёма"
                db.commit()

                # Уведомление клиенту
                client_cancel_text = (
                    f"🚫 <b>Запись аннулирована</b>\n\n"
                    f"Ваша запись на сегодня в {start_str} была отменена, "
                    f"так как визит не был подтверждён за 8 часов.\n\n"
                    f"Если хотите записаться на другое время, откройте Mini App по кнопке ниже:"
                )
                cancel_kb = InlineKeyboardMarkup(
                    inline_keyboard=[
                        [
                            InlineKeyboardButton(text="💅 Записаться снова", web_app=WebAppInfo(url=f"{WEBAPP_URL}?role=client"))
                        ]
                    ]
                )
                try:
                    await bot.send_message(client_tg_id, client_cancel_text, reply_markup=cancel_kb, parse_mode=ParseMode.HTML)
                except Exception as ex:
                    logger.warning(f"Ошибка отправки автоотмены клиенту {client_tg_id}: {ex}")

                # Уведомление мастеру
                uname_str = f"(@{app.client.username})" if app.client.username else ""
                master_cancel_text = (
                    f"⚠️ <b>Запись аннулирована по таймауту</b>\n\n"
                    f"👤 Клиент: {client_name} {uname_str}\n"
                    f"📅 Сегодня в {start_str}\n"
                    f"Причина: визит не был подтверждён клиентом за 8 часов.\n\n"
                    f"Слот свободен для других клиентов."
                )
                for mid in MASTER_TG_IDS:
                    try:
                        await bot.send_message(mid, master_cancel_text, parse_mode=ParseMode.HTML)
                    except Exception:
                        pass

            # 4. Напоминание за 2 часа (только подтверждённым)
            elif 0 < hours_to_start <= 2.0 and app.status == AppointmentStatus.CONFIRMED and app.reminder_2h_sent_at is None:
                text = (
                    f"⏰ <b>Ждём вас через 2 часа (в {start_str})!</b>\n\n"
                    f"📍 <b>Адрес:</b> {formatted_addr}\n\n"
                    f"Приходите без опозданий, мастер уже готовит инструменты! ✨"
                )
                try:
                    await bot.send_message(client_tg_id, text, parse_mode=ParseMode.HTML)
                    app.reminder_2h_sent_at = now_dt
                    db.commit()
                except Exception as ex:
                    logger.warning(f"Ошибка отправки 2h напоминания клиенту {client_tg_id}: {ex}")

            # 5. Сбор отзыва через 1-6 часов после окончания
            elif 1.0 <= hours_since_end <= 6.0 and app.status in (AppointmentStatus.CONFIRMED, AppointmentStatus.COMPLETED) and app.feedback_requested_at is None:
                app.status = AppointmentStatus.COMPLETED
                rating_kb = InlineKeyboardMarkup(
                    inline_keyboard=[
                        [
                            InlineKeyboardButton(text="⭐ 1", callback_data=f"rate:{app.id}:1"),
                            InlineKeyboardButton(text="⭐ 2", callback_data=f"rate:{app.id}:2"),
                            InlineKeyboardButton(text="⭐ 3", callback_data=f"rate:{app.id}:3"),
                            InlineKeyboardButton(text="⭐ 4", callback_data=f"rate:{app.id}:4"),
                            InlineKeyboardButton(text="⭐ 5", callback_data=f"rate:{app.id}:5"),
                        ]
                    ]
                )
                text = (
                    f"💖 <b>Спасибо за визит!</b>\n\n"
                    f"Как всё прошло? Оцените работу мастера в 1 клик:"
                )
                try:
                    await bot.send_message(client_tg_id, text, reply_markup=rating_kb, parse_mode=ParseMode.HTML)
                    app.feedback_requested_at = now_dt
                    db.commit()
                except Exception as ex:
                    logger.warning(f"Ошибка отправки запроса отзыва в {client_tg_id}: {ex}")

        # 6. Реактивация спящих клиентов (не был 90 дней)
        ninety_days_ago = now_local.date() - timedelta(days=90)
        clients = db.query(User).filter(User.role == UserRole.CLIENT).all()
        for cl in clients:
            if not cl.tg_id:
                continue
            if cl.reactivation_sent_at and (now_dt - cl.reactivation_sent_at).days < 90:
                continue

            has_upcoming = db.query(Appointment).filter(
                Appointment.client_id == cl.id,
                Appointment.date >= now_local.date(),
                Appointment.status.in_([AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED])
            ).first()
            if has_upcoming:
                continue

            last_completed = db.query(Appointment).filter(
                Appointment.client_id == cl.id,
                Appointment.status == AppointmentStatus.COMPLETED
            ).order_by(Appointment.date.desc()).first()

            if last_completed and last_completed.date <= ninety_days_ago:
                text = (
                    f"👋 <b>{cl.first_name}, мы соскучились!</b>\n\n"
                    f"Прошло уже 3 месяца с вашего прошлого визита. "
                    f"Самое время порадовать себя свежим маникюром 💅"
                )
                kb = InlineKeyboardMarkup(
                    inline_keyboard=[
                        [
                            InlineKeyboardButton(
                                text="💅 Выбрать время (Mini App)",
                                web_app=WebAppInfo(url=f"{WEBAPP_URL}?role=client")
                            )
                        ]
                    ]
                )
                try:
                    await bot.send_message(cl.tg_id, text, reply_markup=kb, parse_mode=ParseMode.HTML)
                    cl.reactivation_sent_at = now_dt
                    db.commit()
                except Exception as ex:
                    logger.warning(f"Не удалось отправить реактивацию клиенту {cl.tg_id}: {ex}")

    except Exception as e:
        logger.error(f"Ошибка в цикле шедулера: {e}", exc_info=True)
    finally:
        db.close()


async def run_scheduler(bot: Bot):
    """Бесконечный цикл планировщика (проверка каждую минуту)"""
    logger.info("Фоновый планировщик уведомлений запущен.")
    while True:
        try:
            await check_and_send_scheduled_events(bot)
        except Exception as e:
            logger.error(f"Непредвиденная ошибка в run_scheduler: {e}")
        await asyncio.sleep(60)


# =====================================================================
# ТОЧКА ВХОДА БОТА
# =====================================================================
async def start_bot():
    """Запуск long-polling бота и фонового планировщика"""
    bot = Bot(token=BOT_TOKEN, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
    dp = Dispatcher()
    dp.include_router(router)

    # Фоновая задача шедулера напоминаний
    scheduler_task = asyncio.create_task(run_scheduler(bot))

    logger.info("Бот запущен. Очистка старых вебхуков и ожидание событий Telegram...")
    try:
        await bot.delete_webhook(drop_pending_updates=True)
        await dp.start_polling(bot)
    finally:
        scheduler_task.cancel()


if __name__ == "__main__":
    asyncio.run(start_bot())
