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

# Подключаем роуты: как с префиксом /api, так и без него (на случай, если Nginx делает rewrite или proxy_pass со слэшем)
app.include_router(api_router)

# Создаем копию роутера без префикса /api для совместимости с любыми конфигурациями reverse-proxy
from fastapi import APIRouter
root_compat_router = APIRouter(tags=["Compatibility"])
for route in api_router.routes:
    # Если путь начинается с /api, добавляем альтернативный маршрут без /api
    if route.path.startswith("/api/"):
        alt_path = route.path[len("/api"):]
        root_compat_router.routes.append(route)

app.include_router(root_compat_router, prefix="")


@app.get("/health", tags=["Health"])
@app.get("/api/health", tags=["Health"])
def health_check():
    return {"status": "ok", "service": "Nail Master Mini App API"}
