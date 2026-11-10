"""
Точка входа FastAPI приложения для Telegram Mini App мастера маникюра.
Запуск сервера: uvicorn backend.main:app --reload --port 8000
"""

import os
import sys
from contextlib import asynccontextmanager
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

load_dotenv()

# Безопасная настройка UTF-8 вывода для консоли Windows (предотвращает UnicodeEncodeError в cp1251)
try:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

from backend.database import init_and_seed_db
from backend.api import router as api_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # При старте приложения создаем таблицы и наполняем базовыми услугами на русском языке
    init_and_seed_db()
    print("[OK] База данных инициализирована. Таблицы и услуги мастера загружены.")
    yield
    print("[INFO] Приложение остановлено.")


app = FastAPI(
    title="Telegram Mini App Nail Master API",
    description="API сервер онлайн-записи и динамического конструктора маникюра",
    version="1.0.0",
    lifespan=lifespan,
)

# Разрешаем CORS для Telegram Web App (TWA открывается внутри webview клиента Telegram)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Префикс /api задаём один раз при подключении роутера (не в самом APIRouter — иначе пути удваиваются)
app.include_router(api_router, prefix="/api")


@app.get("/health", tags=["Health"])
@app.get("/api/health", tags=["Health"])
def health_check():
    return {"status": "ok", "service": "Nail Master Mini App API"}


# Раздача статики собранного фронтенда (dist)
dist_dir = os.path.abspath(os.path.join(os.path.dirname(os.path.dirname(__file__)), "dist"))
if os.path.exists(dist_dir):
    assets_dir = os.path.join(dist_dir, "assets")
    if os.path.exists(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        # Не перехватываем несуществующие API-маршруты
        if full_path.startswith("api/") or full_path == "api":
            raise HTTPException(status_code=404, detail="API endpoint not found")

        file_path = os.path.abspath(os.path.join(dist_dir, full_path))
        if file_path.startswith(dist_dir) and os.path.exists(file_path) and os.path.isfile(file_path):
            return FileResponse(file_path)

        index_path = os.path.join(dist_dir, "index.html")
        if os.path.exists(index_path):
            return FileResponse(index_path)
        raise HTTPException(status_code=404, detail="Frontend build not found")
