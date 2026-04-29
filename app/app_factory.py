from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from starlette.middleware.sessions import SessionMiddleware
from starlette.exceptions import HTTPException as StarletteHTTPException

from sqlalchemy import inspect, text

from database import engine
from models import Base
from .auth import DEFAULT_RECOVERY_QUESTION

from .context import ensure_media_dirs
from .routes_api import router as api_router
from .routes_pages import router as pages_router


def create_app() -> FastAPI:
    # Initialize DB schema and ensure backward-compatible columns exist.
    Base.metadata.create_all(bind=engine)
    _ensure_user_recovery_columns()
    _ensure_track_metric_columns()
    ensure_media_dirs()

    app = FastAPI()
    app.add_middleware(SessionMiddleware, secret_key="secret")
    app.mount("/static", StaticFiles(directory="static"), name="static")

    @app.exception_handler(StarletteHTTPException)
    async def not_found_to_spa(request: Request, exc: StarletteHTTPException):
        if exc.status_code == 404 and not request.url.path.startswith("/api/"):
            from .context import render_spa

            return render_spa(request)
        return JSONResponse({"detail": exc.detail}, status_code=exc.status_code)

    app.include_router(api_router)
    app.include_router(pages_router)
    return app


def _ensure_user_recovery_columns() -> None:
    if engine.dialect.name != "sqlite":
        return

    with engine.begin() as conn:
        inspector = inspect(conn)
        columns = {col["name"] for col in inspector.get_columns("users")} if inspector.has_table("users") else set()
        if not columns:
            return

        if "recovery_question" not in columns:
            conn.execute(text("ALTER TABLE users ADD COLUMN recovery_question VARCHAR NOT NULL DEFAULT ''"))
        if "recovery_answer" not in columns:
            conn.execute(text("ALTER TABLE users ADD COLUMN recovery_answer VARCHAR NOT NULL DEFAULT ''"))

        conn.execute(
            text(
                """
                UPDATE users
                SET recovery_question = COALESCE(NULLIF(recovery_question, ''), :default_question),
                    recovery_answer = COALESCE(NULLIF(recovery_answer, ''), recovery_phrase)
                """
            ),
            {"default_question": DEFAULT_RECOVERY_QUESTION},
        )


def _ensure_track_metric_columns() -> None:
    if engine.dialect.name != "sqlite":
        return

    with engine.begin() as conn:
        inspector = inspect(conn)
        columns = {col["name"] for col in inspector.get_columns("tracks")} if inspector.has_table("tracks") else set()
        if not columns:
            return
        if "downloads_count" not in columns:
            conn.execute(text("ALTER TABLE tracks ADD COLUMN downloads_count INTEGER NOT NULL DEFAULT 0"))
        if "favorites_count" not in columns:
            conn.execute(text("ALTER TABLE tracks ADD COLUMN favorites_count INTEGER NOT NULL DEFAULT 0"))
