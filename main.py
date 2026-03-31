import os
import re
import shutil
import secrets
import uuid

from fastapi.staticfiles import StaticFiles
from fastapi import FastAPI, Request, Form, Depends, HTTPException, UploadFile, File
from fastapi.responses import RedirectResponse, FileResponse
from fastapi.templating import Jinja2Templates
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from starlette.middleware.sessions import SessionMiddleware
from sqlalchemy import text
from sqlalchemy.orm import Session
from passlib.context import CryptContext

from database import SessionLocal, engine
from models import Base, User, Track

Base.metadata.create_all(bind=engine)

app = FastAPI()
app.add_middleware(SessionMiddleware, secret_key="secret")

templates = Jinja2Templates(directory="templates")
pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")
MEDIA_PATH = "media"

app.mount("/static", StaticFiles(directory="static"), name="static")


class RegisterRequest(BaseModel):
    email: str
    name: str
    password: str


class LoginRequest(BaseModel):
    email: str
    password: str


class ResetPasswordRequest(BaseModel):
    email: str
    recoveryPhrase: str
    newPassword: str


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_current_user(request: Request, db: Session):
    user_id = request.session.get("user_id")
    if user_id:
        return db.get(User, user_id)
    return None


def render_spa(request: Request):
    return templates.TemplateResponse("spa.html", {"request": request})


def require_user(request: Request, db: Session) -> User:
    user = get_current_user(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthenticated")
    return user


def validate_email(email: str) -> str:
    normalized = email.strip().lower()
    if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", normalized):
        raise HTTPException(status_code=422, detail="Некорректный email")
    return normalized


def validate_password(password: str) -> str:
    if len(password) < 6:
        raise HTTPException(status_code=422, detail="Пароль должен быть не короче 6 символов")
    return password


def validate_name(name: str) -> str:
    normalized = name.strip()
    if len(normalized) < 2:
        raise HTTPException(status_code=422, detail="Имя должно содержать минимум 2 символа")
    return normalized


def validate_recovery_phrase(phrase: str) -> str:
    normalized = " ".join(phrase.strip().lower().split())
    if len(normalized) < 10:
        raise HTTPException(status_code=422, detail="Некорректная секретная фраза")
    return normalized


def generate_recovery_phrase() -> str:
    words = [
        "atlas", "forest", "river", "shadow", "silver", "sunset", "winter", "autumn",
        "ember", "planet", "ocean", "breeze", "vector", "signal", "rocket", "matrix",
        "native", "pixel", "quantum", "aurora", "cloud", "falcon", "tiger", "comet",
    ]
    return " ".join(secrets.choice(words) for _ in range(6))


def ensure_user_columns() -> None:
    with engine.begin() as connection:
        result = connection.execute(text("PRAGMA table_info(users)"))
        existing_columns = {row[1] for row in result}
        if "recovery_phrase" not in existing_columns:
            connection.execute(
                text("ALTER TABLE users ADD COLUMN recovery_phrase VARCHAR DEFAULT '' NOT NULL")
            )
        if "avatar_filename" not in existing_columns:
            connection.execute(
                text("ALTER TABLE users ADD COLUMN avatar_filename VARCHAR")
            )


ensure_user_columns()


def do_register(db: Session, email: str, name: str, password: str) -> User:
    email = validate_email(email)
    name = validate_name(name)
    password = validate_password(password)

    existing_user = db.query(User).filter(User.email == email).first()
    if existing_user:
        raise HTTPException(status_code=409, detail="Пользователь с таким email уже существует")

    user = User(
        email=email,
        name=name,
        password_hash=pwd_context.hash(password),
        recovery_phrase=generate_recovery_phrase(),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def do_login(db: Session, email: str, password: str) -> User:
    email = validate_email(email)
    password = validate_password(password)

    user = db.query(User).filter(User.email == email).first()
    if not user or not pwd_context.verify(password, user.password_hash):
        raise HTTPException(status_code=401, detail="Неверный email или пароль")
    return user


def do_reset_password(db: Session, email: str, recovery_phrase: str, new_password: str) -> User:
    email = validate_email(email)
    recovery_phrase = validate_recovery_phrase(recovery_phrase)
    new_password = validate_password(new_password)

    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    if user.recovery_phrase != recovery_phrase:
        raise HTTPException(status_code=401, detail="Неверная секретная фраза")

    user.password_hash = pwd_context.hash(new_password)
    db.commit()
    db.refresh(user)
    return user


def save_uploaded_file(file: UploadFile, prefix: str) -> str:
    ext = os.path.splitext(file.filename or "")[1].lower()
    safe_ext = ext if ext in {".jpg", ".jpeg", ".png", ".webp", ".gif", ".mp3", ".wav", ".ogg"} else ""
    filename = f"{prefix}-{uuid.uuid4().hex}{safe_ext}"
    file_path = os.path.join(MEDIA_PATH, filename)
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    return filename


@app.get("/")
def public_tracks(request: Request):
    return render_spa(request)


@app.get("/auth/register")
def register_page(request: Request):
    return render_spa(request)


@app.get("/auth/login")
def login_page(request: Request):
    return render_spa(request)


@app.get("/auth/forgot-password")
def forgot_password_page(request: Request):
    return render_spa(request)


@app.post("/auth/register")
def register_form(
    request: Request,
    email: str = Form(...),
    name: str = Form(...),
    password: str = Form(...),
    db: Session = Depends(get_db),
):
    try:
        user = do_register(db=db, email=email, name=name, password=password)
    except HTTPException as exc:
        return templates.TemplateResponse(
            "register.html",
            {
                "request": request,
                "error": str(exc.detail),
                "form_email": email,
                "form_name": name,
            },
            status_code=exc.status_code,
        )

    request.session["user_id"] = user.id
    return RedirectResponse("/profile", status_code=303)


@app.post("/auth/login")
def login_form(
    request: Request,
    email: str = Form(...),
    password: str = Form(...),
    db: Session = Depends(get_db),
):
    try:
        user = do_login(db=db, email=email, password=password)
    except HTTPException as exc:
        return templates.TemplateResponse(
            "login.html",
            {
                "request": request,
                "error": str(exc.detail),
                "form_email": email,
            },
            status_code=exc.status_code,
        )

    request.session["user_id"] = user.id
    return RedirectResponse("/profile", status_code=303)


@app.post("/auth/forgot-password")
def forgot_password_form(
    request: Request,
    email: str = Form(...),
    recovery_phrase: str = Form(...),
    new_password: str = Form(...),
    db: Session = Depends(get_db),
):
    try:
        do_reset_password(db=db, email=email, recovery_phrase=recovery_phrase, new_password=new_password)
    except HTTPException as exc:
        return templates.TemplateResponse(
            "forgot_password.html",
            {
                "request": request,
                "error": str(exc.detail),
                "form_email": email,
                "form_recovery_phrase": recovery_phrase,
            },
            status_code=exc.status_code,
        )

    return RedirectResponse("/auth/login", status_code=303)


@app.post("/api/auth/register")
def register_api(payload: RegisterRequest, request: Request, db: Session = Depends(get_db)):
    user = do_register(db=db, email=payload.email, name=payload.name, password=payload.password)
    request.session["user_id"] = user.id
    return {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "createdAt": user.created_at,
        "recoveryPhrase": user.recovery_phrase,
    }


@app.post("/api/auth/login")
def login_api(payload: LoginRequest, request: Request, db: Session = Depends(get_db)):
    user = do_login(db=db, email=payload.email, password=payload.password)
    request.session["user_id"] = user.id
    return {"id": user.id, "email": user.email, "name": user.name, "createdAt": user.created_at}


@app.get("/api/auth/me")
def me_api(request: Request, db: Session = Depends(get_db)):
    user = get_current_user(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="Не авторизован")
    return {"id": user.id, "email": user.email, "name": user.name, "createdAt": user.created_at}


@app.post("/api/auth/reset-password")
def reset_password_api(payload: ResetPasswordRequest, db: Session = Depends(get_db)):
    do_reset_password(
        db=db,
        email=payload.email,
        recovery_phrase=payload.recoveryPhrase,
        new_password=payload.newPassword,
    )
    return {"ok": True}


@app.post("/api/auth/logout")
def logout_api(request: Request):
    request.session.clear()
    return {"ok": True}


@app.get("/api/tracks/public")
def public_tracks_api(db: Session = Depends(get_db)):
    tracks = db.query(Track).filter(Track.is_public == True).all()
    items = []
    for t in tracks:
        items.append(
            {
                "id": t.id,
                "title": t.title,
                "filename": t.filename,
                "is_public": bool(t.is_public),
                "owner_id": t.owner_id,
                "owner_name": t.owner.name if t.owner else None,
            }
        )
    return {"items": items}


@app.get("/api/tracks/mine")
def my_tracks_api(request: Request, db: Session = Depends(get_db)):
    user = require_user(request, db)
    tracks = db.query(Track).filter(Track.owner_id == user.id).all()
    items = [{"id": t.id, "title": t.title, "filename": t.filename, "is_public": bool(t.is_public)} for t in tracks]
    return {"items": items}


@app.get("/api/profile/settings")
def profile_settings_get_api(request: Request, db: Session = Depends(get_db)):
    user = require_user(request, db)
    return {
        "email": user.email,
        "name": user.name,
        "recoveryPhrase": user.recovery_phrase,
        "avatarFilename": user.avatar_filename,
    }


@app.post("/api/profile/settings")
def profile_settings_post_api(
    request: Request,
    email: str = Form(...),
    name: str = Form(...),
    recovery_phrase: str = Form(...),
    password: str = Form(None),
    avatar: UploadFile = File(None),
    db: Session = Depends(get_db),
):
    user = require_user(request, db)

    normalized_email = validate_email(email)
    normalized_name = validate_name(name)
    normalized_phrase = validate_recovery_phrase(recovery_phrase)

    email_owner = db.query(User).filter(User.email == normalized_email, User.id != user.id).first()
    if email_owner:
        raise HTTPException(status_code=409, detail="Email занят")

    user.email = normalized_email
    user.name = normalized_name
    user.recovery_phrase = normalized_phrase

    if password and password.strip():
        user.password_hash = pwd_context.hash(validate_password(password))

    if avatar and avatar.filename:
        user.avatar_filename = save_uploaded_file(avatar, "avatar")

    db.commit()
    db.refresh(user)
    return {"ok": True, "user": {"id": user.id, "name": user.name, "email": user.email, "avatarFilename": user.avatar_filename}}


@app.post("/api/tracks/upload")
def upload_track_api(
    request: Request,
    title: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    user = require_user(request, db)
    title = title.strip()
    if not title:
        raise HTTPException(status_code=422, detail="Название трека обязательно")

    stored_filename = save_uploaded_file(file, "track")
    track = Track(title=title, filename=stored_filename, is_public=False, owner_id=user.id)
    db.add(track)
    db.commit()
    db.refresh(track)
    return {"ok": True, "track": {"id": track.id, "title": track.title, "filename": track.filename, "is_public": bool(track.is_public)}}


@app.get("/profile")
def profile(request: Request, db: Session = Depends(get_db)):
    return render_spa(request)


@app.get("/profile/settings")
def profile_settings_page(request: Request, db: Session = Depends(get_db)):
    return render_spa(request)


@app.post("/profile/settings")
def profile_settings_form(
    request: Request,
    email: str = Form(...),
    name: str = Form(...),
    recovery_phrase: str = Form(...),
    password: str = Form(None),
    avatar: UploadFile = File(None),
    db: Session = Depends(get_db),
):
    user = get_current_user(request, db)
    if not user:
        return RedirectResponse("/auth/login", status_code=303)

    try:
        normalized_email = validate_email(email)
        normalized_name = validate_name(name)
        normalized_phrase = validate_recovery_phrase(recovery_phrase)
    except HTTPException as exc:
        return templates.TemplateResponse(
            "profile_settings.html",
            {
                "request": request,
                "user": user,
                "error": str(exc.detail),
            },
            status_code=exc.status_code,
        )

    email_owner = db.query(User).filter(User.email == normalized_email, User.id != user.id).first()
    if email_owner:
        return templates.TemplateResponse(
            "profile_settings.html",
            {
                "request": request,
                "user": user,
                "error": "Пользователь с таким email уже существует",
            },
            status_code=409,
        )

    user.email = normalized_email
    user.name = normalized_name
    user.recovery_phrase = normalized_phrase

    if password and password.strip():
        user.password_hash = pwd_context.hash(validate_password(password))

    if avatar and avatar.filename:
        user.avatar_filename = save_uploaded_file(avatar, "avatar")

    db.commit()
    db.refresh(user)
    return RedirectResponse("/profile", status_code=303)


@app.get("/tracks/upload")
def upload_page(request: Request, db: Session = Depends(get_db)):
    return render_spa(request)


@app.get("/media/{filename}")
def media(filename: str):
    return FileResponse(os.path.join(MEDIA_PATH, filename))


@app.post("/upload")
def upload_track(
    request: Request,
    title: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    user = get_current_user(request, db)
    if not user:
        return RedirectResponse("/auth/login", status_code=303)

    stored_filename = save_uploaded_file(file, "track")

    track = Track(
        title=title,
        filename=stored_filename,
        is_public=False,
        owner_id=user.id
    )

    db.add(track)
    db.commit()

    return RedirectResponse("/profile", status_code=303)


@app.post("/toggle_privacy/{track_id}")
def toggle_privacy(track_id: int, request: Request, db: Session = Depends(get_db)):
    user = get_current_user(request, db)
    if not user:
        return JSONResponse({"error": "unauthenticated"}, status_code=401)

    track = db.get(Track, track_id)
    if not track or track.owner_id != user.id:
        return JSONResponse({"error": "forbidden"}, status_code=403)

    track.is_public = not track.is_public
    db.commit()

    return JSONResponse({"id": track.id, "is_public": track.is_public})


@app.get("/logout")
def logout(request: Request):
    request.session.clear()
    return RedirectResponse("/", status_code=303)
