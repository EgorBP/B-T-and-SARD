from fastapi import Request
from fastapi.templating import Jinja2Templates
from passlib.context import CryptContext

templates = Jinja2Templates(directory="templates")
pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")

MEDIA_PATH = "media"


def render_spa(request: Request):
    return templates.TemplateResponse("spa.html", {"request": request})

