import os

from fastapi import Request
from fastapi.templating import Jinja2Templates
from passlib.context import CryptContext

templates = Jinja2Templates(directory="templates")
pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")

MEDIA_PATH = "media"
MEDIA_SUBDIRS = {
    "avatar": "avatars",
    "track": "tracks",
    "cover": "covers",
}


def ensure_media_dirs() -> None:
    os.makedirs(MEDIA_PATH, exist_ok=True)
    for sub in MEDIA_SUBDIRS.values():
        os.makedirs(os.path.join(MEDIA_PATH, sub), exist_ok=True)


def render_spa(request: Request):
    return templates.TemplateResponse("spa.html", {"request": request})
