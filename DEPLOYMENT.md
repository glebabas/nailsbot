# Telegram Mini App — Онлайн-запись мастера маникюра

Комплексное решение для студии маникюра:
1. **Frontend (React 19 + Vite + Tailwind CSS)**: Telegram Mini App интерфейс (конструктор услуг, выбор слотов с буфером стерилизации, загрузка фото/референсов, кабинет мастера с настройкой графика).
2. **Backend API (Python FastAPI + SQLite/PostgreSQL + SQLAlchemy)**: Расчет окон доступности, сохранение графиков смен и записей.
3. **Telegram Bot (Python aiogram 3.x)**: Меню для клиентов и мастеров, WebAppInfo кнопки с защищенным роутингом.

---

## 1. Запуск проекта на локальном компьютере

### Требования:
- **Node.js** версии 18 или новее (`node -v`)
- **Python** версии 3.10 или новее (`python3 --version` или `python --version`)
- **Git**

---

### Шаг 1: Скачивание проекта
Выгрузите проект из Google AI Studio (кнопка *Export to GitHub* или *Download ZIP*) и перейдите в папку проекта в терминале:
```bash
cd nail-studio-twa
```

---

### Шаг 2: Установка зависимостей

#### 1) Frontend:
```bash
npm install
```

#### 2) Backend & Telegram Bot:
Рекомендуется создать виртуальное окружение Python:
```bash
# Linux / macOS:
python3 -m venv venv
source venv/bin/activate

# Windows (PowerShell):
python -m venv venv
venv\Scripts\Activate.ps1
```

Установите Python-зависимости:
```bash
pip install -r requirements.txt
```

---

### Шаг 3: Настройка переменных окружения

Создайте файл `.env` в корне проекта (на основе `.env.example`):
```env
BOT_TOKEN=ваш_токен_от_BotFather
WEBAPP_URL=https://ваш-домен-или-ngrok
MASTER_USERNAME=katya_nails_master
MASTER_TG_IDS=549120491
```

---

### Шаг 4: Запуск компонентов

Вам понадобятся 3 терминала (или процессы в фоне):

#### Терминал 1: Frontend (React / Vite)
```bash
npm run dev
```
Фронтенд запустится по адресу: `http://localhost:3000`
- Для клиента: `http://localhost:3000/?role=client`
- Для мастера: `http://localhost:3000/?role=master`

#### Терминал 2: Backend API (FastAPI)
```bash
uvicorn backend.main:app --reload --port 8000
```
API и авто-документация Swagger будут доступны по адресу: `http://localhost:8000/docs`

#### Терминал 3: Telegram Bot (aiogram 3)
```bash
python -m backend.bot
```

---

## 2. Подключение к Telegram Bot (для тестирования на телефоне)

Telegram Mini App требует HTTPS протокол. Для локального тестирования используйте утилиту **ngrok**:

1. Запустите туннель к порту фронтенда (3000):
   ```bash
   ngrok http 3000
   ```
2. Скопируйте полученный HTTPS адрес (например: `https://abc1-23.ngrok-free.app`).
3. В Telegram откройте `@BotFather`:
   - Напишите `/mybots` → выберите вашего бота.
   - Перейдите в **Bot Settings** → **Menu Button** → **Configure menu button**.
   - Отправьте HTTPS URL от ngrok: `https://abc1-23.ngrok-free.app?role=client`.
4. В файле `.env` укажите этот же адрес в переменную `WEBAPP_URL`:
   ```env
   WEBAPP_URL=https://abc1-23.ngrok-free.app
   ```
5. Перезапустите бота в Терминале 3. Теперь при нажатии кнопки в Telegram откроется ваше локальное приложение!

---

## 3. Развертывание (Деплой) на рабочий сервер (Production)

Для постоянной работы 24/7 подойдет любой виртуальный сервер (Ubuntu VPS / VDS):

1. **Сборка Frontend:**
   ```bash
   npm run build
   ```
   Собранные статические файлы попадут в папку `dist/`. Их можно раздавать через Nginx или Caddy с бесплатным SSL-сертификатом Let's Encrypt.

2. **Запуск Backend и Bot через systemd или Docker:**
   - FastAPI запускается через Gunicorn/Uvicorn:
     ```bash
     uvicorn backend.main:app --host 0.0.0.0 --port 8000 --workers 2
     ```
   - Bot запускается как фоновый сервис:
     ```bash
     python -m backend.bot
     ```
   - Настройте автозапуск через `systemd` (сервисы `nail-api.service` и `nail-bot.service`) или `docker-compose`.
