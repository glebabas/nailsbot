"""
Скрипт безопасной миграции базы данных:
Добавляет недостающие колонки для напоминаний (48ч, 24ч, 2ч), отзывов и реактивации.
Безопасен для повторного запуска (идемпотентный).
"""

import sqlite3
import os
import sys

DB_PATH = os.getenv("DATABASE_PATH", "nail_bot.db")

def migrate_database(db_path: str = DB_PATH):
    print(f"Миграция базы данных: {db_path}")
    if not os.path.exists(db_path):
        print(f"Файл базы {db_path} не найден. Пропуск.")
        return

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # 1. Проверяем колонки в appointments
    cursor.execute("PRAGMA table_info(appointments);")
    existing_appointment_columns = {row[1] for row in cursor.fetchall()}

    columns_to_add_appointments = [
        ("booking_notified_at", "DATETIME"),
        ("reminder_48h_sent_at", "DATETIME"),
        ("reminder_24h_sent_at", "DATETIME"),
        ("reminder_12h_sent_at", "DATETIME"),
        ("reminder_2h_sent_at", "DATETIME"),
        ("confirmed_at", "DATETIME"),
        ("cancelled_at", "DATETIME"),
        ("cancellation_reason", "VARCHAR(255)"),
        ("feedback_requested_at", "DATETIME"),
        ("feedback_rating", "INTEGER"),
        ("feedback_text", "TEXT"),
    ]

    for col_name, col_type in columns_to_add_appointments:
        if col_name not in existing_appointment_columns:
            print(f"  + Added appointments.{col_name} ({col_type})")
            cursor.execute(f"ALTER TABLE appointments ADD COLUMN {col_name} {col_type};")
        else:
            print(f"  - appointments.{col_name} already exists")

    # 2. Проверяем колонки в users
    cursor.execute("PRAGMA table_info(users);")
    existing_user_columns = {row[1] for row in cursor.fetchall()}

    if "reactivation_sent_at" not in existing_user_columns:
        print("  + Added users.reactivation_sent_at (DATETIME)")
        cursor.execute("ALTER TABLE users ADD COLUMN reactivation_sent_at DATETIME;")
    else:
        print("  - users.reactivation_sent_at already exists")

    conn.commit()
    conn.close()
    print("Database migration successfully completed!")

if __name__ == "__main__":
    path = sys.argv[1] if len(sys.argv) > 1 else DB_PATH
    migrate_database(path)
