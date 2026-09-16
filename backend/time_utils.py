import logging
from datetime import datetime, timezone, timedelta, time, date
from typing import Optional, List, Dict
import zoneinfo

logger = logging.getLogger("time_utils")

CITY_TIMEZONES: List[Dict[str, str]] = [
    {"city": "Екатеринбург", "timezone": "Asia/Yekaterinburg", "utc_offset": "+05:00", "label": "Екатеринбург (UTC+5)"},
    {"city": "Москва", "timezone": "Europe/Moscow", "utc_offset": "+03:00", "label": "Москва, Санкт-Петербург (UTC+3)"},
    {"city": "Калининград", "timezone": "Europe/Kaliningrad", "utc_offset": "+02:00", "label": "Калининград (UTC+2)"},
    {"city": "Самара", "timezone": "Europe/Samara", "utc_offset": "+04:00", "label": "Самара, Ижевск, Тольятти (UTC+4)"},
    {"city": "Омск", "timezone": "Asia/Omsk", "utc_offset": "+06:00", "label": "Омск (UTC+6)"},
    {"city": "Новосибирск", "timezone": "Asia/Novosibirsk", "utc_offset": "+07:00", "label": "Новосибирск, Красноярск, Барнаул (UTC+7)"},
    {"city": "Иркутск", "timezone": "Asia/Irkutsk", "utc_offset": "+08:00", "label": "Иркутск, Улан-Удэ (UTC+8)"},
    {"city": "Якутск", "timezone": "Asia/Yakutsk", "utc_offset": "+09:00", "label": "Якутск, Чита (UTC+9)"},
    {"city": "Владивосток", "timezone": "Asia/Vladivostok", "utc_offset": "+10:00", "label": "Владивосток, Хабаровск (UTC+10)"},
]

# Резервная карта смещений на случай проблем с системной tzdata
OFFSET_MAP = {
    "Asia/Yekaterinburg": timedelta(hours=5),
    "Europe/Moscow": timedelta(hours=3),
    "Europe/Kaliningrad": timedelta(hours=2),
    "Europe/Samara": timedelta(hours=4),
    "Asia/Omsk": timedelta(hours=6),
    "Asia/Novosibirsk": timedelta(hours=7),
    "Asia/Krasnoyarsk": timedelta(hours=7),
    "Asia/Irkutsk": timedelta(hours=8),
    "Asia/Yakutsk": timedelta(hours=9),
    "Asia/Vladivostok": timedelta(hours=10),
}


def get_tz_info(tz_name: Optional[str] = None):
    """Возвращает объект tzinfo для указанного имени зоны или Екатеринбург по умолчанию"""
    tz_key = tz_name or "Asia/Yekaterinburg"
    try:
        return zoneinfo.ZoneInfo(tz_key)
    except Exception as e:
        logger.warning(f"ZoneInfo({tz_key}) недоступна, используем резервное смещение: {e}")
        offset = OFFSET_MAP.get(tz_key, timedelta(hours=5))
        return timezone(offset)


def get_now_in_timezone(tz_name: Optional[str] = None) -> datetime:
    """Возвращает текущее время (aware datetime) в заданной таймзоне"""
    tz = get_tz_info(tz_name)
    return datetime.now(timezone.utc).astimezone(tz)


def get_local_naive_now(tz_name: Optional[str] = None) -> datetime:
    """
    Возвращает наивный datetime текущего момента в таймзоне студии.
    Идеально для прямого сравнения с naive datetime в БД (datetime.combine(app.date, app.start_time)).
    """
    now_aware = get_now_in_timezone(tz_name)
    return now_aware.replace(tzinfo=None)


def calculate_hours_to_appointment(
    app_date: date | str,
    app_time: time | str,
    tz_name: Optional[str] = None,
) -> float:
    """
    Вычисляет количество часов от текущего момента в таймзоне студии до начала приёма.
    Положительное число — приём в будущем.
    Отрицательное — приём уже начался или прошёл.
    """
    now_local = get_local_naive_now(tz_name)
    if isinstance(app_date, str):
        d_val = datetime.strptime(app_date, "%Y-%m-%d").date()
    else:
        d_val = app_date

    if isinstance(app_time, str):
        parts = app_time.split(":")
        t_val = time(int(parts[0]), int(parts[1]))
    else:
        t_val = app_time

    app_start = datetime.combine(d_val, t_val)
    return (app_start - now_local).total_seconds() / 3600.0


def format_address_with_cabinet(address: str, cabinet: Optional[str] = None) -> str:
    """
    Форматирует адрес студии.
    НИ В КОЕМ СЛУЧАЕ не добавляет вымышленный кабинет 204.
    Выводит блок кабинета только если он явно заполнен мастером.
    """
    cleaned_addr = (address or "").strip()
    cleaned_cab = (cabinet or "").strip() if cabinet else ""
    if cleaned_cab:
        return f"{cleaned_addr}\n🔔 <b>Кабинет / вход:</b> {cleaned_cab}"
    return cleaned_addr
