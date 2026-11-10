import pytest
from datetime import datetime, date, timedelta
from unittest.mock import AsyncMock, patch
from backend.time_utils import (
    CITY_TIMEZONES,
    get_local_naive_now,
    calculate_hours_to_appointment,
    format_address_with_cabinet,
)
from backend.database import SessionLocal, ensure_db_schema_migrated, engine, init_and_seed_db
from backend.models import GlobalConfig, Appointment, User, WaitlistEntry, Service
from fastapi.testclient import TestClient
from backend.main import app


@pytest.fixture(scope="module", autouse=True)
def setup_database():
    init_and_seed_db()
    yield


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
    future_hour = (ekb_now.hour + 2) % 24
    appt_time = f"{future_hour:02d}:{ekb_now.minute:02d}"
    if future_hour >= ekb_now.hour:
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
    ensure_db_schema_migrated(engine)

    db = SessionLocal()
    try:
        conf = db.query(GlobalConfig).first()
        assert conf is not None
        assert conf.city == "Екатеринбург"
        assert conf.timezone == "Asia/Yekaterinburg"
        assert conf.studio_address == "г. Екатеринбург, ул. Викулова 78, кв. 300"
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

    res = client.get("/api/config")
    assert res.status_code == 200
    original = res.json()
    assert "timezone" in original
    assert "city" in original
    assert "studio_cabinet" in original

    try:
        update_res = client.put("/api/config", json={
            "studio_name": "Тестовая Студия",
            "studio_address": "г. Екатеринбург, ул. Викулова 78, кв. 300",
            "city": "Екатеринбург",
            "timezone": "Asia/Yekaterinburg",
            "studio_cabinet": "101",
            "default_sterilization_buffer": 20,
        })
        assert update_res.status_code == 200
        updated = update_res.json()
        assert updated["studio_name"] == "Тестовая Студия"
        assert updated["studio_cabinet"] == "101"
        assert updated["default_sterilization_buffer"] == 20
    finally:
        # Restore original studio configuration so DB remains clean
        client.put("/api/config", json={
            "studio_name": original.get("studio_name") or "Студия маникюра",
            "studio_address": original.get("studio_address") or "г. Екатеринбург, ул. Викулова 78, кв. 300",
            "city": original.get("city") or "Екатеринбург",
            "timezone": original.get("timezone") or "Asia/Yekaterinburg",
            "studio_cabinet": original.get("studio_cabinet"),
            "default_sterilization_buffer": original.get("default_sterilization_buffer") or 20,
        })


def test_services_crud_and_include_inactive():
    client = TestClient(app)

    # Create temporary service
    create_res = client.post("/api/services", json={
        "category": "design",
        "name": "Тестовый дизайн временный",
        "description": "Для автотеста",
        "duration_minutes": 15,
        "price": 250,
        "sort_order": 99,
        "is_active": True,
    })
    assert create_res.status_code in (200, 201)
    created_srv = create_res.json()
    srv_id = created_srv["id"]

    try:
        # Toggle service to inactive
        upd_res = client.put(f"/api/services/{srv_id}", json={"is_active": False})
        assert upd_res.status_code == 200
        assert upd_res.json()["is_active"] is False

        # Public GET /api/services should hide inactive service
        pub_res = client.get("/api/services")
        assert pub_res.status_code == 200
        pub_design_ids = [s["id"] for s in pub_res.json()["design"]]
        assert srv_id not in pub_design_ids

        # Master GET /api/services?include_inactive=true should include inactive service
        master_res = client.get("/api/services?include_inactive=true")
        assert master_res.status_code == 200
        master_design_ids = [s["id"] for s in master_res.json()["design"]]
        assert srv_id in master_design_ids
    finally:
        # Hard delete temporary service
        del_res = client.delete(f"/api/services/{srv_id}?hard=true")
        assert del_res.status_code == 200


@patch("backend.notifications.send_telegram_message_async", new_callable=AsyncMock)
def test_slots_and_booking_lifecycle(mock_send_msg):
    client = TestClient(app)

    # Pick a future Monday (working day even without explicit schedule row)
    today = get_local_naive_now("Asia/Yekaterinburg").date()
    days_ahead = (7 - today.weekday()) % 7
    if days_ahead < 2:
        days_ahead += 7
    target_monday = today + timedelta(days=days_ahead)
    target_date_str = target_monday.isoformat()

    # Fetch active services
    srvs = client.get("/api/services").json()
    base_srv = next((s for s in srvs["base"] if s["duration_minutes"] > 0), srvs["base"][-1])
    removal_srv = srvs["removal"][0]
    design_srv = srvs["design"][0]
    service_ids = [removal_srv["id"], base_srv["id"], design_srv["id"]]

    # 1. Calculate available slots
    slots_res = client.post("/api/slots", json={
        "master_id": 1,
        "target_date": target_date_str,
        "service_ids": service_ids,
    })
    assert slots_res.status_code == 200
    slots_data = slots_res.json()
    assert slots_data["is_day_off"] is False
    assert len(slots_data["available_slots"]) > 0
    chosen_slot = slots_data["available_slots"][0]["start_time"]

    # 2. Create appointment (verifies no NameError: schedule)
    test_tg_id = 999888777
    book_res = client.post("/api/appointments", json={
        "master_id": 1,
        "tg_id": test_tg_id,
        "client_name": "Тестовый Клиент",
        "client_phone": "+79990001122",
        "client_username": "test_client_bot",
        "date": target_date_str,
        "start_time": chosen_slot,
        "service_ids": service_ids,
        "comment": "Тестовая запись",
    })
    assert book_res.status_code in (200, 201)
    created_app = book_res.json()
    app_id = created_app["id"]
    assert created_app["status"] == "pending"

    try:
        # 3. Verify client appointments endpoint
        client_apps_res = client.get(f"/api/client/appointments?tg_id={test_tg_id}")
        assert client_apps_res.status_code == 200
        client_apps = client_apps_res.json()
        assert any(a["id"] == app_id for a in client_apps)

        # 4. Master confirms appointment
        patch_res = client.patch(f"/api/appointments/{app_id}/status?status_value=confirmed")
        assert patch_res.status_code == 200
        assert patch_res.json()["new_status"] == "confirmed"

        # 5. Client cancels appointment
        cancel_res = client.post(f"/api/appointments/{app_id}/client-cancel", json={
            "reason": "Тестовая отмена"
        })
        assert cancel_res.status_code == 200
        assert cancel_res.json()["status"] == "ok"
    finally:
        # Cleanup test appointment and test user
        db = SessionLocal()
        try:
            app_obj = db.query(Appointment).filter(Appointment.id == app_id).first()
            if app_obj:
                db.delete(app_obj)
            test_user = db.query(User).filter(User.tg_id == test_tg_id).first()
            if test_user:
                db.delete(test_user)
            db.commit()
        finally:
            db.close()


def test_waitlist_endpoints():
    client = TestClient(app)
    test_tg_id = 999888776
    target_date_str = (date.today() + timedelta(days=5)).isoformat()

    join_res = client.post("/api/waitlist", json={
        "tg_id": test_tg_id,
        "client_name": "Лист Ожидания Тест",
        "client_username": "waitlist_user",
        "date": target_date_str,
    })
    assert join_res.status_code in (200, 201)
    wl_id = join_res.json()["id"]

    try:
        list_res = client.get(f"/api/waitlist?target_date={target_date_str}")
        assert list_res.status_code == 200
        items = list_res.json()
        assert any(item["id"] == wl_id for item in items)
    finally:
        db = SessionLocal()
        try:
            wl_obj = db.query(WaitlistEntry).filter(WaitlistEntry.id == wl_id).first()
            if wl_obj:
                db.delete(wl_obj)
            test_user = db.query(User).filter(User.tg_id == test_tg_id).first()
            if test_user:
                db.delete(test_user)
            db.commit()
        finally:
            db.close()


def test_unknown_api_route_returns_404():
    client = TestClient(app)
    res = client.get("/api/nonexistent_endpoint_123")
    assert res.status_code == 404

