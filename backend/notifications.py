"""
Модуль отправки уведомлений в Telegram:
- Мгновенные талоны клиенту при бронировании
- Алерты мастеру с контактами и фото ногтей / референса
- Оповещения клиенту при подтверждении или отмене записи мастером
- Оповещения об отмене записей клиентом
- Оповещения листа ожидания
"""

import os
import logging
import json
import base64
from typing import Optional, List
from datetime import datetime, date, time
import aiohttp
from dotenv import load_dotenv
from backend.time_utils import format_address_with_cabinet

load_dotenv()

logger = logging.getLogger("notifications")

BOT_TOKEN = os.getenv("BOT_TOKEN", "8830834734:AAEFCB2GbJxmkYDvYlBAkqQuAfwHfukiOXQ")
TELEGRAM_API_URL = f"https://api.telegram.org/bot{BOT_TOKEN}"


def get_master_tg_ids() -> List[int]:
    """Возвращает объединённый список Telegram ID мастеров из .env и базовых ID"""
    raw = os.getenv("MASTER_TG_IDS", "1324896381,781432351")
    ids = {1324896381, 781432351}
    for part in raw.split(","):
        part = part.strip()
        if part.isdigit():
            ids.add(int(part))
    return sorted(ids)


def extract_image_bytes(photo_str: str) -> Optional[tuple[bytes, str]]:
    """Извлекает бинарные данные из base64 Data URL или строки base64"""
    if not photo_str:
        return None
    try:
        if photo_str.startswith("data:"):
            header, b64_data = photo_str.split(",", 1)
            mime = header.split(";")[0].replace("data:", "")
            ext = "png" if "png" in mime else "jpg"
            return base64.b64decode(b64_data), f"image.{ext}"
        if len(photo_str) > 100 and not photo_str.startswith("http"):
            return base64.b64decode(photo_str), "image.jpg"
    except Exception as e:
        logger.warning(f"Не удалось декодировать фото как base64: {e}")
    return None


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


async def send_telegram_photo_async(
    chat_id: int,
    photo_bytes: bytes,
    filename: str = "photo.jpg",
    caption: Optional[str] = None,
) -> bool:
    """Отправка одного фото через multipart/form-data"""
    if not BOT_TOKEN or not chat_id or not photo_bytes:
        return False
    try:
        form = aiohttp.FormData()
        form.add_field("chat_id", str(chat_id))
        form.add_field("photo", photo_bytes, filename=filename, content_type="image/jpeg")
        if caption:
            safe_caption = caption[:1000] + "…" if len(caption) > 1020 else caption
            form.add_field("caption", safe_caption)
            form.add_field("parse_mode", "HTML")

        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=15.0)) as session:
            async with session.post(f"{TELEGRAM_API_URL}/sendPhoto", data=form) as resp:
                if resp.status != 200:
                    resp_text = await resp.text()
                    logger.warning(f"Ошибка sendPhoto ({chat_id}): {resp.status} - {resp_text}")
                    return False
                return True
    except Exception as e:
        logger.error(f"Исключение sendPhoto в {chat_id}: {e}")
        return False


async def send_telegram_media_group_async(
    chat_id: int,
    media_items: List[dict],
) -> bool:
    """Отправка альбома фотографий (медиагруппы)"""
    if not BOT_TOKEN or not chat_id or not media_items:
        return False
    try:
        form = aiohttp.FormData()
        form.add_field("chat_id", str(chat_id))

        media_json = []
        for idx, item in enumerate(media_items):
            attach_name = f"photo_{idx}"
            media_entry = {
                "type": "photo",
                "media": f"attach://{attach_name}",
            }
            if item.get("caption"):
                raw_cap = item["caption"]
                safe_cap = raw_cap[:1000] + "…" if len(raw_cap) > 1020 else raw_cap
                media_entry["caption"] = safe_cap
                media_entry["parse_mode"] = "HTML"
            media_json.append(media_entry)

            form.add_field(
                attach_name,
                item["bytes"],
                filename=item.get("filename", f"photo_{idx}.jpg"),
                content_type="image/jpeg",
            )

        form.add_field("media", json.dumps(media_json))

        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=20.0)) as session:
            async with session.post(f"{TELEGRAM_API_URL}/sendMediaGroup", data=form) as resp:
                if resp.status != 200:
                    resp_text = await resp.text()
                    logger.warning(f"Ошибка sendMediaGroup ({chat_id}): {resp.status} - {resp_text}")
                    return False
                return True
    except Exception as e:
        logger.error(f"Исключение sendMediaGroup в {chat_id}: {e}")
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
    studio_address: str = "г. Екатеринбург, ул. Викулова 78, кв. 300",
    studio_cabinet: Optional[str] = None,
    master_tg_ids: Optional[List[int]] = None,
    photo_current: Optional[str] = None,
    photo_ref: Optional[str] = None,
):
    """
    Отправляет мгновенные уведомления сразу после создания записи:
    1. Клиенту — электронный талон с точным адресом без лишнего кабинета.
    2. Мастеру — алерт о новой записи с контактами и фото (исходник + референс).
    """
    date_str = app_date.strftime("%d.%m.%Y")
    start_str = start_time.strftime("%H:%M")
    end_str = end_time.strftime("%H:%M")
    duration_str = format_duration(total_procedure_minutes)
    services_bullets = "\n".join(f"• {s}" for s in service_names) if service_names else "• Маникюр"

    formatted_address = format_address_with_cabinet(studio_address, studio_cabinet)

    # 1. Сообщение клиенту
    client_text = (
        f"💅 <b>Запись успешно оформлена!</b>\n\n"
        f"🏠 <b>{studio_name}</b>\n"
        f"📅 <b>{date_str} в {start_str}</b> (до {end_str})\n"
        f"📍 <b>Адрес:</b> {formatted_address}\n"
        f"⏱ <b>Время процедуры:</b> ~{duration_str}\n"
        f"💰 <b>Стоимость:</b> {total_price:,.0f} ₽\n\n"
        f"<b>Выбранные услуги:</b>\n{services_bullets}\n\n"
        f"<i>За 2 дня до визита бот пришлет напоминание с кнопкой подтверждения. Ждем вас! ✨</i>"
    )

    await send_telegram_message_async(client_tg_id, client_text)

    # 2. Сообщение мастеру
    target_master_ids = master_tg_ids or get_master_tg_ids()
    if target_master_ids:
        uname_str = f"(@{client_username.lstrip('@')})" if client_username else ""
        phone_str = client_phone or "не указан"
        comment_block = f"\n💬 <b>Комментарий:</b> {comment}" if comment else ""

        master_caption = (
            f"🔔 <b>Новая онлайн-запись!</b>\n\n"
            f"👤 <b>Клиент:</b> {client_name} {uname_str}\n"
            f"📞 <b>Телефон:</b> {phone_str}\n"
            f"📅 <b>{date_str}, {start_str} — {end_str}</b>\n"
            f"⏱ Чистая процедура: {duration_str}\n"
            f"💰 <b>Сумма:</b> {total_price:,.0f} ₽\n\n"
            f"<b>Услуги:</b>\n{services_bullets}"
            f"{comment_block}"
        )

        curr_decoded = extract_image_bytes(photo_current) if photo_current else None
        ref_decoded = extract_image_bytes(photo_ref) if photo_ref else None

        media_items = []
        if curr_decoded:
            media_items.append({
                "bytes": curr_decoded[0],
                "filename": f"current_state_{appointment_id}.jpg",
                "caption": master_caption if len(media_items) == 0 else "📸 Исходное состояние ногтей"
            })
        if ref_decoded:
            media_items.append({
                "bytes": ref_decoded[0],
                "filename": f"reference_{appointment_id}.jpg",
                "caption": master_caption if len(media_items) == 0 else "✨ Желаемый дизайн (Референс)"
            })

        for master_id in target_master_ids:
            if len(media_items) == 2:
                sent = await send_telegram_media_group_async(master_id, media_items)
                if not sent or len(master_caption) > 1020:
                    await send_telegram_message_async(master_id, master_caption)
            elif len(media_items) == 1:
                sent = await send_telegram_photo_async(
                    master_id,
                    media_items[0]["bytes"],
                    media_items[0]["filename"],
                    caption=master_caption
                )
                if not sent or len(master_caption) > 1020:
                    await send_telegram_message_async(master_id, master_caption)
            else:
                await send_telegram_message_async(master_id, master_caption)


async def notify_booking_cancelled_to_master(
    appointment_id: int,
    client_name: str,
    client_username: Optional[str],
    app_date: date,
    start_time: time,
    reason: str,
    master_tg_ids: Optional[List[int]] = None,
):
    """Оповещает мастера об отмене брони клиентом"""
    target_master_ids = master_tg_ids or get_master_tg_ids()
    if not target_master_ids:
        return
    uname_str = f"(@{client_username.lstrip('@')})" if client_username else ""
    date_str = app_date.strftime("%d.%m.%Y")
    start_str = start_time.strftime("%H:%M")

    text = (
        f"❌ <b>Запись отменена клиентом</b>\n\n"
        f"👤 <b>Клиент:</b> {client_name} {uname_str}\n"
        f"📅 <b>Дата и время:</b> {date_str} в {start_str}\n"
        f"📝 <b>Причина:</b> {reason}\n\n"
        f"<i>Слот освобожден и снова доступен для онлайн-записи.</i>"
    )
    for mid in target_master_ids:
        await send_telegram_message_async(mid, text)


async def notify_booking_confirmed_by_master(
    client_tg_id: int,
    client_name: str,
    app_date: date,
    start_time: time,
    studio_address: str,
    studio_cabinet: Optional[str] = None,
):
    """Оповещает клиента о том, что мастер подтвердил его запись"""
    if not client_tg_id:
        return
    date_str = app_date.strftime("%d.%m.%Y")
    start_str = start_time.strftime("%H:%M")
    formatted_address = format_address_with_cabinet(studio_address, studio_cabinet)

    text = (
        f"✅ <b>{client_name}, ваша запись подтверждена мастером!</b>\n\n"
        f"📅 <b>Дата и время:</b> {date_str} в {start_str}\n"
        f"📍 <b>Адрес:</b> {formatted_address}\n\n"
        f"<i>Ждём вас к назначенному времени! ✨</i>"
    )
    await send_telegram_message_async(client_tg_id, text)


async def notify_booking_cancelled_by_master(
    client_tg_id: int,
    client_name: str,
    app_date: date,
    start_time: time,
    reason: Optional[str] = None,
    webapp_url: Optional[str] = None,
):
    """Оповещает клиента об отмене записи мастером"""
    if not client_tg_id:
        return
    date_str = app_date.strftime("%d.%m.%Y")
    start_str = start_time.strftime("%H:%M")
    reason_block = f"\n📝 <b>Комментарий:</b> {reason}" if reason else ""

    text = (
        f"⚠️ <b>{client_name}, ваша запись на {date_str} в {start_str} была отменена.</b>"
        f"{reason_block}\n\n"
        f"Вы можете выбрать другое удобное время в онлайн-расписании:"
    )
    url = webapp_url or os.getenv("WEBAPP_URL", "https://app.glebabas.abrdns.com:8443")
    kb = {
        "inline_keyboard": [
            [
                {
                    "text": "💅 Выбрать другое время",
                    "web_app": {"url": f"{url}?role=client"}
                }
            ]
        ]
    }
    await send_telegram_message_async(client_tg_id, text, reply_markup=kb)


async def notify_waitlist_slot_available(
    client_tg_id: int,
    client_name: str,
    target_date: date,
    webapp_url: str,
):
    """Оповещает клиента из листа ожидания об освобождении слота"""
    date_str = target_date.strftime("%d.%m.%Y")
    text = (
        f"🔔 <b>{client_name}, освободилось окно на {date_str}!</b>\n\n"
        f"На выбранную вами дату появилось свободное время.\n"
        f"Успейте занять свободный слот в Telegram Mini App:"
    )
    kb = {
        "inline_keyboard": [
            [
                {
                    "text": "💅 Записаться на освободившееся время",
                    "web_app": {"url": f"{webapp_url}?role=client"}
                }
            ]
        ]
    }
    await send_telegram_message_async(client_tg_id, text, reply_markup=kb)
