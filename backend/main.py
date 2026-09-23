"""
Точка входа FastAPI приложения для Telegram Mini App мастера маникюра.
Запуск сервера: uvicorn backend.main:app --reload --port 8000
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.database import init_and_seed_db
from backend.api import router as api_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # При старте приложения создаем таблицы и наполняем демо-услугами на русском языке
    init_and_seed_db()
    print("✓ База данных инициализирована. Таблицы и услуги мастера загружены.")
    yield
    print("Приложение остановлено.")


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
import os
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

dist_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "dist")
if os.path.exists(dist_dir):
    assets_dir = os.path.join(dist_dir, "assets")
    if os.path.exists(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        file_path = os.path.join(dist_dir, full_path)
        if os.path.exists(file_path) and os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(os.path.join(dist_dir, "index.html"))
