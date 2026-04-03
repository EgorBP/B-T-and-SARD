import os

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from sqlalchemy.orm import Session

from models import Track, User

from .auth import (
    LoginRequest,
    RegisterRequest,
    ResetPasswordRequest,
    do_login,
    do_register,
    do_reset_password,
    validate_email,
    validate_name,
    validate_password,
    validate_recovery_phrase,
)
from .context import MEDIA_PATH, pwd_context
from .deps import get_current_user, get_db, require_user
from .storage import save_uploaded_file

router = APIRouter()


@router.post("/api/auth/register")
def register_api(payload: RegisterRequest, request: Request, db: Session = Depends(get_db)):
    user = do_register(db=db, email=payload.email, name=payload.name, password=payload.password)
    request.session["user_id"] = user.id
    return {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "createdAt": user.created_at,
        "recoveryPhrase": user.recovery_phrase,
        "avatarFilename": user.avatar_filename,
    }


@router.post("/api/auth/login")
def login_api(payload: LoginRequest, request: Request, db: Session = Depends(get_db)):
    user = do_login(db=db, email=payload.email, password=payload.password)
    request.session["user_id"] = user.id
    return {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "createdAt": user.created_at,
        "avatarFilename": user.avatar_filename,
    }


@router.get("/api/auth/me")
def me_api(request: Request, db: Session = Depends(get_db)):
    user = get_current_user(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="Не авторизован")
    return {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "createdAt": user.created_at,
        "avatarFilename": user.avatar_filename,
    }


@router.post("/api/auth/reset-password")
def reset_password_api(payload: ResetPasswordRequest, db: Session = Depends(get_db)):
    do_reset_password(
        db=db,
        email=payload.email,
        recovery_phrase=payload.recoveryPhrase,
        new_password=payload.newPassword,
    )
    return {"ok": True}


@router.post("/api/auth/logout")
def logout_api(request: Request):
    request.session.clear()
    return {"ok": True}


@router.get("/api/tracks/public")
def public_tracks_api(db: Session = Depends(get_db)):
    tracks = db.query(Track).filter(Track.is_public == True).all()
    items = []
    for t in tracks:
        items.append(
            {
                "id": t.id,
                "title": t.title,
                "filename": t.filename,
                "coverFilename": t.cover_filename,
                "description": t.description,
                "is_public": bool(t.is_public),
                "createdAt": t.created_at,
                "owner_id": t.owner_id,
                "owner_name": t.owner.name if t.owner else None,
            }
        )
    return {"items": items}


@router.get("/api/tracks/mine")
def my_tracks_api(request: Request, db: Session = Depends(get_db)):
    user = require_user(request, db)
    tracks = db.query(Track).filter(Track.owner_id == user.id).all()
    items = [
        {
            "id": t.id,
            "title": t.title,
            "filename": t.filename,
            "coverFilename": t.cover_filename,
            "description": t.description,
            "is_public": bool(t.is_public),
            "createdAt": t.created_at,
        }
        for t in tracks
    ]
    return {"items": items}


@router.get("/api/profile/settings")
def profile_settings_get_api(request: Request, db: Session = Depends(get_db)):
    user = require_user(request, db)
    return {
        "email": user.email,
        "name": user.name,
        "recoveryPhrase": user.recovery_phrase,
        "avatarFilename": user.avatar_filename,
    }


@router.post("/api/profile/settings")
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
    return {
        "ok": True,
        "user": {"id": user.id, "name": user.name, "email": user.email, "avatarFilename": user.avatar_filename},
    }


@router.post("/api/tracks/upload")
def upload_track_api(
    request: Request,
    title: str = Form(...),
    description: str = Form(""),
    file: UploadFile = File(...),
    cover: UploadFile = File(None),
    db: Session = Depends(get_db),
):
    user = require_user(request, db)
    title = title.strip()
    if not title:
        raise HTTPException(status_code=422, detail="Название трека обязательно")

    description = (description or "").strip()
    if len(description) > 2000:
        raise HTTPException(status_code=422, detail="Описание слишком длинное (макс 2000 символов)")

    stored_filename = save_uploaded_file(file, "track")
    cover_filename = None
    if cover and cover.filename:
        cover_filename = save_uploaded_file(cover, "cover")

    track = Track(title=title, filename=stored_filename, is_public=False, owner_id=user.id)
    track.description = description
    track.cover_filename = cover_filename
    db.add(track)
    db.commit()
    db.refresh(track)
    return {
        "ok": True,
        "track": {
            "id": track.id,
            "title": track.title,
            "filename": track.filename,
            "coverFilename": track.cover_filename,
            "description": track.description,
            "is_public": bool(track.is_public),
            "createdAt": track.created_at,
        },
    }


@router.patch("/api/tracks/{track_id}")
def update_track_api(
    track_id: int,
    request: Request,
    description: str = Form(None),
    cover: UploadFile = File(None),
    db: Session = Depends(get_db),
):
    user = require_user(request, db)
    track = db.get(Track, track_id)
    if not track:
        raise HTTPException(status_code=404, detail="Трек не найден")
    if track.owner_id != user.id:
        raise HTTPException(status_code=403, detail="Недостаточно прав")

    if description is not None:
        desc = (description or "").strip()
        if len(desc) > 2000:
            raise HTTPException(status_code=422, detail="Описание слишком длинное (макс 2000 символов)")
        track.description = desc

    if cover and cover.filename:
        track.cover_filename = save_uploaded_file(cover, "cover")

    db.commit()
    db.refresh(track)
    return {
        "ok": True,
        "track": {
            "id": track.id,
            "title": track.title,
            "filename": track.filename,
            "coverFilename": track.cover_filename,
            "description": track.description,
            "is_public": bool(track.is_public),
            "createdAt": track.created_at,
        },
    }


@router.delete("/api/tracks/{track_id}")
def delete_track_api(track_id: int, request: Request, db: Session = Depends(get_db)):
    user = require_user(request, db)
    track = db.get(Track, track_id)
    if not track:
        raise HTTPException(status_code=404, detail="Трек не найден")
    if track.owner_id != user.id:
        raise HTTPException(status_code=403, detail="Недостаточно прав")

    filename = track.filename or ""
    cover_filename = track.cover_filename or ""
    db.delete(track)
    db.commit()

    # Best-effort file cleanup.
    safe_name = os.path.basename(filename)
    if safe_name and safe_name == filename:
        try:
            os.remove(os.path.join(MEDIA_PATH, safe_name))
        except OSError:
            pass

    safe_cover = os.path.basename(cover_filename)
    if safe_cover and safe_cover == cover_filename:
        try:
            os.remove(os.path.join(MEDIA_PATH, safe_cover))
        except OSError:
            pass

    return {"ok": True}
