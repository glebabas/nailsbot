"""
Модуль отправки уведомлений в Telegram:
- Мгновенные талоны клиенту при бронировании
- Алерты мастеру с контактами и фото
- Вспомогательные функции форматирования
"""

import os
import logging
from typing import Optional, List
import aiohttp
from datetime import datetime, date, time

logger = logging.getLogger("notifications")

BOT_TOKEN = os.getenv("BOT_TOKEN", "8830834734:AAEFCB2GbJxmkYDvYlBAkqQuAfwHfukiOXQ")
TELEGRAM_API_URL = f"https://api.telegram.org/bot{BOT_TOKEN}"


async def send_telegram_message_async(
    chat_id: int,
    text: str,
    reply_markup: Optional[dict] = None,
    parse_mode: str = "HTML"
) -> bool:
    """Асинхронная отправка сообщения через HTTP Telegram Bot API (aiohttp)"""
    if not BOT_TOKEN or not chat_id:
        return False
    try:
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=10.0)) as session:
            payload = {
                "chat_id": chat_id,
                "text": text,
                "parse_mode": parse_mode,
            }
            if reply_markup:
                payload["reply_markup"] = reply_markup
            async with session.post(f"{TELEGRAM_API_URL}/sendMessage", json=payload) as resp:
                if resp.status != 200:
                    resp_text = await resp.text()
                    logger.warning(f"Ошибка отправки Telegram ({chat_id}): {resp.status} - {resp_text}")
                    return False
                return True
    except Exception as e:
        logger.error(f"Исключение при отправке Telegram сообщения в {chat_id}: {e}")
        return False


def format_duration(minutes: int) -> str:
    h = minutes // 60
    m = minutes % 60
    if h > 0 and m > 0:
        return f"{h} ч {m} мин"
    if h > 0:
        return f"{h} ч"
    return f"{m} мин"


async def notify_new_booking_created(
    appointment_id: int,
    client_tg_id: int,
    client_name: str,
    client_username: Optional[str],
    client_phone: Optional[str],
    app_date: date,
    start_time: time,
    end_time: time,
    total_procedure_minutes: int,
    total_price: float,
    service_names: List[str],
    comment: Optional[str],
    studio_name: str = "Студия маникюра",
    studio_address: str = "г. Москва, ул. Арбат, д. 10",
    master_tg_ids: Optional[List[int]] = None,
):
    """
    Отправляет мгновенные уведомления сразу после создания записи:
    1. Клиенту — электронный талон с деталями.
    2. Мастеру — алерт о новой записи с контактами.
    """
    date_str = app_date.strftime("%d.%m.%Y")
    start_str = start_time.strftime("%H:%M")
    end_str = end_time.strftime("%H:%M")
    duration_str = format_duration(total_procedure_minutes)
    services_bullets = "\n".join(f"• {s}" for s in service_names) if service_names else "• Маникюр"

    # 1. Сообщение клиенту
    client_text = (
        f"💅 <b>Запись успешно оформлена!</b>\n\n"
        f"📅 <b>{date_str} в {start_str}</b>\n"
        f"📍 {studio_address}\n"
        f"⏱ <b>Время процедуры:</b> ~{duration_str}\n"
        f"💰 <b>Стоимость:</b> {total_price:,.0f} ₽\n\n"
        f"<b>Выбранные услуги:</b>\n{services_bullets}\n\n"
        f"<i>За 2 дня до визита мы пришлем сообщение с кнопкой подтверждения. До встречи! ✨</i>"
    )

    await send_telegram_message_async(client_tg_id, client_text)

    # 2. Сообщение мастеру
    if master_tg_ids:
        uname_str = f"(@{client_username})" if client_username else ""
        phone_str = client_phone or "не указан"
        comment_block = f"\n💬 <b>Комментарий:</b> {comment}" if comment else ""

        master_text = (
            f"🔔 <b>Новая онлайн-запись!</b>\n\n"
            f"👤 <b>Клиент:</b> {client_name} {uname_str}\n"
            f"📞 <b>Телефон:</b> {phone_str}\n"
            f"📅 <b>{date_str}, {start_str} — {end_str}</b>\n"
            f"⏱ Чистая процедура: {duration_str}\n"
            f"💰 <b>Сумма:</b> {total_price:,.0f} ₽\n\n"
            f"<b>Услуги:</b>\n{services_bullets}"
            f"{comment_block}"
        )

        for master_id in master_tg_ids:
            await send_telegram_message_async(master_id, master_text)
