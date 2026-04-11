from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware

from database import engine
from models import Base

from .context import ensure_media_dirs
from .routes_api import router as api_router
from .routes_pages import router as pages_router


def create_app() -> FastAPI:
    # Initialize DB schema and ensure backward-compatible columns exist.
    Base.metadata.create_all(bind=engine)
    ensure_media_dirs()

    app = FastAPI()
    app.add_middleware(SessionMiddleware, secret_key="secret")
    app.mount("/static", StaticFiles(directory="static"), name="static")

    app.include_router(pages_router)
    app.include_router(api_router)
    return app
