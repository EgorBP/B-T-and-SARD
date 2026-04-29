from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware

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
    ensure_media_dirs()

    app = FastAPI()
    app.add_middleware(SessionMiddleware, secret_key="secret")
    app.mount("/static", StaticFiles(directory="static"), name="static")

    app.include_router(pages_router)
    app.include_router(api_router)
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
