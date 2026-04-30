# SpotX

Веб-приложение для публикации и прослушивания аудиотреков.

**Продакшен:** [b-t-and-sard.onrender.com](https://b-t-and-sard.onrender.com/)

---

## О проекте

SpotX — динамическое SPA для загрузки, хранения и прослушивания аудиотреков.
Пользователи регистрируются, загружают файлы и управляют их приватностью:
публичные треки доступны всем, приватные — только владельцу.

### Целевая аудитория

* Люди, которые хотят хранить и слушать свои аудиотреки
* Музыканты и авторы, желающие делиться записями
* Слушатели, ищущие новые треки

### Ключевой функционал

* Регистрация и авторизация (сессии)
* Загрузка аудиотреков с обложками
* Встроенный аудиоплеер
* Поиск треков (по названию, автору)
* Избранное
* Управление приватностью треков
* Личный кабинет с настройками профиля

---

## Стек

| Слой       | Технологии                                     |
|------------|------------------------------------------------|
| Backend    | Python 3.13+, FastAPI, SQLAlchemy, SQLite      |
| Frontend   | Vanilla JS (SPA), CSS                          |
| Auth       | Сессии (Starlette SessionMiddleware)           |
| Пароли     | passlib (pbkdf2_sha256)                        |
| Деплой     | Render                                         |

---

## Локальный запуск

### 1. Клонировать репозиторий

```bash
git clone <url-репозитория>
cd SARD
```

### 2. Установить зависимости

Проект использует [uv](https://docs.astral.sh/uv/) — быстрый менеджер пакетов для Python.

```bash
# установить uv (если ещё нет)
pip install uv

# создать venv и установить зависимости
uv sync
```

Либо классическим способом:

```bash
python -m venv .venv
.venv\Scripts\activate      # Windows
# source .venv/bin/activate # Linux / macOS
pip install fastapi uvicorn sqlalchemy jinja2 passlib[bcrypt] python-multipart itsdangerous
```

### 3. Запустить

```bash
uvicorn main:app --reload
```

Приложение будет доступно на [http://localhost:8000](http://localhost:8000).

База данных `music.db` и папка `media/` создаются автоматически при первом запуске.
Переменные окружения не требуются — всё работает из коробки.

---

## Структура проекта

```
├── main.py              # Точка входа
├── database.py          # Подключение к SQLite
├── models.py            # SQLAlchemy-модели (User, Track, TrackFavorite)
├── app/
│   ├── app_factory.py   # Создание FastAPI-приложения
│   ├── auth.py          # Логика регистрации, логина, сброса пароля
│   ├── context.py       # Шаблоны, пути к медиа
│   ├── deps.py          # Зависимости (get_db, get_current_user)
│   ├── routes_api.py    # REST API
│   ├── routes_pages.py  # Отдача SPA и медиафайлов
│   └── storage.py       # Сохранение загруженных файлов
├── templates/
│   └── spa.html         # Единственный HTML-шаблон (SPA-shell)
├── static/              # JS, CSS, логотип
└── media/               # Загруженные треки, обложки, аватары
```
