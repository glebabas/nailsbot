import pytest
from datetime import datetime
from backend.time_utils import (
    CITY_TIMEZONES,
    get_local_naive_now,
    calculate_hours_to_appointment,
    format_address_with_cabinet,
)
from backend.database import SessionLocal, ensure_db_schema_migrated, engine
from backend.models import GlobalConfig, Appointment, User, WaitlistEntry
from fastapi.testclient import TestClient
from backend.main import app

def test_city_timezones():
    # Ekaterinburg should be UTC+5
    ekb_item = next((c for c in CITY_TIMEZONES if c["timezone"] == "Asia/Yekaterinburg"), None)
    assert ekb_item is not None
    assert ekb_item["city"] == "Екатеринбург"
    assert ekb_item["utc_offset"] == "+05:00"

    # Moscow should be UTC+3
    msk_item = next((c for c in CITY_TIMEZONES if c["timezone"] == "Europe/Moscow"), None)
    assert msk_item is not None
    assert msk_item["utc_offset"] == "+03:00"

def test_local_naive_now_and_hours_calc():
    ekb_now = get_local_naive_now("Asia/Yekaterinburg")
    msk_now = get_local_naive_now("Europe/Moscow")

    # Time difference between Yekaterinburg (UTC+5) and Moscow (UTC+3) is exactly 2 hours
    diff_hours = (ekb_now - msk_now).total_seconds() / 3600.0
    assert round(diff_hours) == 2

    # Calculate hours to appointment using target timezone
    appt_date = ekb_now.strftime("%Y-%m-%d")
    # Say appointment is in 2 hours local time
    future_hour = (ekb_now.hour + 2) % 24
    appt_time = f"{future_hour:02d}:{ekb_now.minute:02d}"
    
    # In Yekaterinburg timezone, it's roughly 2.0 hours away
    hours_left = calculate_hours_to_appointment(appt_date, appt_time, "Asia/Yekaterinburg")
    assert 1.9 <= hours_left <= 2.1

def test_address_with_cabinet_formatting():
    addr = "г. Екатеринбург, ул. Викулова 78, кв. 300"
    
    # When cabinet is empty or None: no phantom cabinet or 204
    formatted = format_address_with_cabinet(addr, None)
    assert formatted == "г. Екатеринбург, ул. Викулова 78, кв. 300"
    assert "204" not in formatted
    assert "Кабинет" not in formatted

    formatted_blank = format_address_with_cabinet(addr, "")
    assert formatted_blank == "г. Екатеринбург, ул. Викулова 78, кв. 300"
    assert "204" not in formatted_blank

    # When cabinet is explicitly set
    formatted_cab = format_address_with_cabinet(addr, "300")
    assert "г. Екатеринбург, ул. Викулова 78, кв. 300" in formatted_cab
    assert "Кабинет / вход:</b> 300" in formatted_cab
    assert "204" not in formatted_cab

def test_db_migration_columns():
    # Ensure migration completes without error
    ensure_db_schema_migrated(engine)

    db = SessionLocal()
    try:
        conf = db.query(GlobalConfig).first()
        if not conf:
            conf = GlobalConfig(
                master_id=1,
                studio_name="Студия маникюра",
                studio_address="г. Екатеринбург, ул. Викулова 78, кв. 300",
                city="Екатеринбург",
                timezone="Asia/Yekaterinburg",
                studio_cabinet=None
            )
            db.add(conf)
            db.commit()
            db.refresh(conf)

        # Check fields exist and have correct values
        assert conf.city == "Екатеринбург"
        assert conf.timezone == "Asia/Yekaterinburg"
        assert conf.studio_address == "г. Екатеринбург, ул. Викулова 78, кв. 300"
        # Cabinet is None or not '204' unless explicitly configured
        assert conf.studio_cabinet is None or conf.studio_cabinet != "204"
    finally:
        db.close()

def test_api_cities_endpoint():
    client = TestClient(app)
    response = client.get("/api/config/cities")
    assert response.status_code == 200
    cities = response.json()
    assert len(cities) > 5
    ekb = next((c for c in cities if c["timezone"] == "Asia/Yekaterinburg"), None)
    assert ekb is not None
    assert ekb["city"] == "Екатеринбург"
    assert ekb["utc_offset"] == "+05:00"

def test_api_config_get_and_update():
    client = TestClient(app)
    
    # GET config
    res = client.get("/api/config")
    assert res.status_code == 200
    conf_data = res.json()
    assert "timezone" in conf_data
    assert "city" in conf_data
    assert "studio_cabinet" in conf_data

    # Update config with explicit timezone and custom cabinet
    update_res = client.put("/api/config", json={
        "studio_name": "Nail Studio EKB",
        "studio_address": "г. Екатеринбург, ул. Викулова 78, кв. 300",
        "city": "Екатеринбург",
        "timezone": "Asia/Yekaterinburg",
        "studio_cabinet": "300",
        "working_hours_start": "09:00",
        "working_hours_end": "21:00",
        "slot_step_minutes": 30
    })
    assert update_res.status_code == 200
    updated = update_res.json()
    assert updated["city"] == "Екатеринбург"
    assert updated["timezone"] == "Asia/Yekaterinburg"
    assert updated["studio_cabinet"] == "300"

def test_client_appointments_endpoint():
    client = TestClient(app)
    
    # Query for a dummy telegram id
    res = client.get("/api/client/appointments?tg_id=99999999")
    assert res.status_code == 200
    assert isinstance(res.json(), list)
