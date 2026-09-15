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
from typing import Optional

from aiogram import Bot, Dispatcher, Router, F
from aiogram.filters import CommandStart, Command
from aiogram.types import (
    Message,
    CallbackQuery,
    InlineKeyboardMarkup,
    InlineKeyboardButton,
    WebAppInfo,
)
from aiogram.enums import ParseMode
from aiogram.client.default import DefaultBotProperties

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
    """Клавиатура для клиента: Запись в Mini App и связь с мастером"""
    buttons = [
        [
            InlineKeyboardButton(
                text="💅 Записаться (Mini App)",
                web_app=WebAppInfo(url=f"{webapp_url}?role=client")
            )
        ],
        [
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


def get_master_keyboard(webapp_url: str, master_username: str) -> InlineKeyboardMarkup:
    """Клавиатура для мастера: Кабинет Мастера и Настройки"""
    buttons = [
        [
            InlineKeyboardButton(
                text="⚙️ Кабинет мастера (Записи и График)",
                web_app=WebAppInfo(url=f"{webapp_url}?role=master")
            )
        ],
        [
            InlineKeyboardButton(
                text="🛠 Настройки (Услуги, Адрес, Аватарка)",
                web_app=WebAppInfo(url=f"{webapp_url}?role=master&tab=settings")
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
                text="📋 Быстрая сводка дня",
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
            f"• ⏱️ <b>Стерилизация:</b> учет 15-минутного буфера\n"
            f"• 💰 <b>Выручка:</b> расчет планового дохода\n\n"
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
            f"2. Система автоматически рассчитает точное время работы и буфер стерилизации.\n"
            f"3. Выберите идеально подходящее время и прикрепите фото референса!\n\n"
            f"Нажмите <b>«Записаться»</b>, чтобы открыть Mini App:"
        )
        keyboard = get_client_keyboard(WEBAPP_URL, MASTER_USERNAME)

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
                    text="🛠 Открыть Настройки (Mini App)",
                    web_app=WebAppInfo(url=f"{WEBAPP_URL}?role=master&tab=settings")
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
# CALLBACK-ЗАПРОСЫ ИНФО-КНОПОК
# =====================================================================
@router.callback_query(F.data == "info:address")
async def callback_address_handler(callback: CallbackQuery):
    await callback.answer()
    text = (
        "📍 <b>Адрес студии:</b>\n"
        "г. Москва, ул. Арбат, д. 10 (3 минуты от м. Арбатская)\n"
        "Кабинет 204, домофон 204В.\n\n"
        "⚠️ <b>Памятка перед визитом:</b>\n"
        "• Пожалуйста, не наносите жирный крем или масло для кутикулы за 2-3 часа до визита.\n"
        "• Старайтесь приходить вовремя: опоздание более чем на 15 минут сокращает время на сложный дизайн."
    )
    await callback.message.answer(text, parse_mode=ParseMode.HTML)


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
        "• Буфер стерилизации: 15 минут\n\n"
        "Для детального просмотра записей и настройки шаблона графика на месяц "
        "откройте <b>«⚙️ Кабинет мастера (Mini App)»</b>."
    )
    await callback.message.answer(text, parse_mode=ParseMode.HTML)


# =====================================================================
# ОБРАБОТКА ТЕКСТОВОГО СПАМА / НЕИЗВЕСТНЫХ СООБЩЕНИЙ
# =====================================================================
@router.message()
async def fallback_text_handler(message: Message):
    """
    Игнорирует спам и вежливо возвращает пользователя к основному меню
    без использования внешних ИИ-моделей.
    """
    user_id = message.from_user.id if message.from_user else 0
    is_master = is_master_user(user_id)

    # Вежливый короткий ответ с меню
    text = (
        "Я работаю в автоматическом режиме для онлайн-записи. "
        "Пожалуйста, воспользуйтесь кнопкой ниже для перехода в <b>Mini App</b> "
        f"или напишите напрямую мастеру: @{MASTER_USERNAME}."
    )
    kb = get_master_keyboard(WEBAPP_URL, MASTER_USERNAME) if is_master else get_client_keyboard(WEBAPP_URL, MASTER_USERNAME)
    await message.answer(text, reply_markup=kb, parse_mode=ParseMode.HTML)


# =====================================================================
# ТОЧКА ВХОДА БОТА
# =====================================================================
async def start_bot():
    """Запуск long-polling бота"""
    bot = Bot(token=BOT_TOKEN, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
    dp = Dispatcher()
    dp.include_router(router)

    logger.info("Бот запущен. Ожидание событий Telegram...")
    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(start_bot())
