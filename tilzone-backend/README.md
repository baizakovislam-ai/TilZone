# TilZone — Полное руководство по запуску

## Архитектура проекта

```
tilzone/                          ← Фронтенд (HTML/CSS/JS SPA)
│   index.html                    ← Точка входа
│   script.js                     ← Весь JS: роутинг, API-клиент, компоненты
│   styles.css                    ← Стили
│   pages/                        ← HTML-фрагменты страниц
│       home.html, login.html ...

tilzone-backend/                  ← Бэкенд (FastAPI + PostgreSQL)
│   .env                          ← Конфиг (создать из .env.example)
│   .env.example                  ← Шаблон переменных окружения
│   requirements.txt
│   alembic.ini
│   alembic/
│       env.py
│       versions/
│           0001_initial_schema.py
│   app/
│       main.py                   ← Точка входа FastAPI
│       config.py                 ← Настройки из .env
│       database.py               ← Async SQLAlchemy engine
│       api/router.py             ← Агрегатор всех роутеров
│       models/                   ← ORM-модели
│       schemas/                  ← Pydantic-схемы
│       routers/                  ← HTTP-эндпоинты
│       services/                 ← Бизнес-логика
│       core/
│           security.py           ← JWT + bcrypt
│           dependencies.py       ← get_current_user
```

---

## Предварительные требования

| Инструмент | Версия |
|------------|--------|
| Python | 3.11+ |
| PostgreSQL | 14+ |
| Node.js (опционально) | для live-reload фронтенда |

---

## Шаг 1 — Настройка базы данных

```bash
# Создать базу данных
psql -U postgres -c "CREATE DATABASE tilzone;"
```

---

## Шаг 2 — Бэкенд

```bash
# Перейти в папку бэкенда
cd tilzone-backend

# Создать виртуальное окружение
python -m venv venv

# Активировать
# Linux/macOS:
source venv/bin/activate
# Windows:
venv\Scripts\activate

# Установить зависимости
pip install -r requirements.txt

# Скопировать конфиг
cp .env.example .env
```

Открыть `.env` и при необходимости изменить:
```env
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/tilzone
SECRET_KEY=your-random-secret-key-here
CORS_ORIGINS=http://localhost:5500,http://127.0.0.1:5500
```

```bash
# Применить миграции (создать таблицы)
alembic upgrade head

# Запустить сервер
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Бэкенд будет доступен на `http://localhost:8000`
Документация API: `http://localhost:8000/docs`

---

## Шаг 3 — Фронтенд

**Вариант A — через VS Code Live Server (рекомендуется):**
1. Установить расширение "Live Server" в VS Code
2. Открыть папку `tilzone/`
3. Нажать "Go Live" — откроется `http://127.0.0.1:5500`

**Вариант B — через Python:**
```bash
cd tilzone
python -m http.server 5500
# Открыть http://localhost:5500
```

**Вариант C — через Node.js:**
```bash
cd tilzone
npx serve . -p 5500
```

> ⚠️ Нельзя открывать `index.html` напрямую через `file://` — SPA-роутинг и fetch-запросы не работают без HTTP-сервера.

---

## Доступные эндпоинты API

| Метод | URL | Описание |
|-------|-----|----------|
| POST | /v1/auth/register | Регистрация |
| POST | /v1/auth/login | Вход (email/username + password) |
| POST | /v1/auth/verify-email | Подтверждение email |
| POST | /v1/auth/forgot-password | Запрос сброса пароля |
| POST | /v1/auth/reset-password | Сброс пароля |
| POST | /v1/auth/refresh | Обновление access-токена |
| GET | /v1/user/profile | Профиль текущего пользователя |
| PATCH | /v1/user/profile | Обновление профиля |
| GET | /v1/lessons | Список уроков |
| GET | /v1/lessons/{id} | Урок по ID |
| GET | /v1/lessons/{id}/tasks | Задания урока |
| POST | /v1/lessons/tasks/{id}/submit | Отправить ответ |
| GET | /v1/theory | Список теорий |
| POST | /v1/ai/chat | AI-чат |
| POST | /v1/pvp/matchmaking | Найти матч |
| POST | /v1/pvp/submit-answer | Отправить ответ в PvP |
| GET | /v1/leaderboard | Таблица лидеров (?by=xp или ?by=pvp) |

---

## Взаимодействие фронтенд ↔ бэкенд

1. Пользователь регистрируется → `POST /v1/auth/register` → получает `access_token` + `refresh_token`
2. Токены сохраняются в `localStorage`
3. Все последующие запросы содержат заголовок `Authorization: Bearer <access_token>`
4. При истечении токена (401) — автоматически вызывается `POST /v1/auth/refresh`
5. Если refresh тоже истёк — пользователь выходит из системы

---

## Конфигурация CORS

Если фронтенд работает не на `localhost:5500`, добавьте его origin в `.env`:

```env
CORS_ORIGINS=http://localhost:5500,http://127.0.0.1:5500,http://localhost:3000
```

---

## Частые ошибки

| Ошибка | Решение |
|--------|---------|
| `CORS error` | Добавьте origin фронтенда в `CORS_ORIGINS` в `.env` |
| `Connection refused` | Запустите бэкенд (`uvicorn ...`) |
| `relation "users" does not exist` | Выполните `alembic upgrade head` |
| `ModuleNotFoundError` | Активируйте venv и установите `pip install -r requirements.txt` |
| `Page not found (fetch)` | Используйте HTTP-сервер, не открывайте `file://` |