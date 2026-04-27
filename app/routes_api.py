import os

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from sqlalchemy import func, or_
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
from .storage import save_uploaded_file, validate_uploaded_file

router = APIRouter()


def _validate_pagination(limit: int | None, offset: int) -> tuple[int | None, int]:
    if offset < 0:
        raise HTTPException(status_code=422, detail="offset не может быть отрицательным")
    if limit is None:
        return None, offset
    if limit < 1:
        raise HTTPException(status_code=422, detail="limit должен быть больше 0")
    if limit > 100:
        raise HTTPException(status_code=422, detail="limit слишком большой (макс 100)")
    return limit, offset


def _normalize_search_query(q: str) -> str:
    q = (q or "").strip()
    if not q:
        raise HTTPException(status_code=422, detail="Пустой запрос")
    if len(q) > 200:
        raise HTTPException(status_code=422, detail="Слишком длинный запрос (макс 200 символов)")
    return q


def _like_any_case(col, q: str):
    """
    SQLite's LOWER()/NOCASE are ASCII-focused; for Cyrillic names this often breaks case-insensitive matching.
    Use several Python-side case variants and match against the raw column instead.
    """
    raw = (q or "").strip()
    variants = {raw, raw.lower(), raw.upper(), raw.title(), raw.capitalize()}
    variants = [v for v in variants if v]
    return or_(*[col.like(f"%{v}%") for v in variants])


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
def public_tracks_api(limit: int | None = None, offset: int = 0, db: Session = Depends(get_db)):
    limit, offset = _validate_pagination(limit, offset)
    query = db.query(Track).filter(Track.is_public == True)
    total = query.with_entities(func.count(Track.id)).scalar() or 0

    tracks_query = query.order_by(Track.created_at.desc(), Track.id.desc())
    if limit is not None:
        tracks_query = tracks_query.offset(offset).limit(limit)

    tracks = tracks_query.all()
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

    if limit is None:
        return {"items": items, "total": total, "offset": 0, "limit": total, "hasMore": False}

    return {"items": items, "total": total, "offset": offset, "limit": limit, "hasMore": offset + len(items) < total}


@router.get("/api/tracks/mine")
def my_tracks_api(request: Request, limit: int | None = None, offset: int = 0, db: Session = Depends(get_db)):
    limit, offset = _validate_pagination(limit, offset)
    user = require_user(request, db)
    query = db.query(Track).filter(Track.owner_id == user.id)
    total = query.with_entities(func.count(Track.id)).scalar() or 0

    tracks_query = query.order_by(Track.created_at.desc(), Track.id.desc())
    if limit is not None:
        tracks_query = tracks_query.offset(offset).limit(limit)

    tracks = tracks_query.all()
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

    if limit is None:
        return {"items": items, "total": total, "offset": 0, "limit": total, "hasMore": False}

    return {"items": items, "total": total, "offset": offset, "limit": limit, "hasMore": offset + len(items) < total}


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
        validate_uploaded_file(avatar, "avatar")
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

    validate_uploaded_file(file, "track")
    stored_filename = save_uploaded_file(file, "track")
    cover_filename = None
    if cover and cover.filename:
        validate_uploaded_file(cover, "cover")
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
    title: str | None = Form(None),
    description: str = Form(None),
    is_public: str | None = Form(None),
    cover: UploadFile = File(None),
    db: Session = Depends(get_db),
):
    user = require_user(request, db)
    track = db.get(Track, track_id)
    if not track:
        raise HTTPException(status_code=404, detail="Трек не найден")
    if track.owner_id != user.id:
        raise HTTPException(status_code=403, detail="Недостаточно прав")

    if title is not None:
        new_title = (title or "").strip()
        if not new_title:
            raise HTTPException(status_code=422, detail="Название трека обязательно")
        if len(new_title) > 200:
            raise HTTPException(status_code=422, detail="Название слишком длинное (макс 200 символов)")
        track.title = new_title

    if description is not None:
        desc = (description or "").strip()
        if len(desc) > 2000:
            raise HTTPException(status_code=422, detail="Описание слишком длинное (макс 2000 символов)")
        track.description = desc

    if is_public is not None:
        v = (is_public or "").strip().lower()
        if v in ("1", "true", "yes", "on"):
            track.is_public = True
        elif v in ("0", "false", "no", "off"):
            track.is_public = False
        else:
            raise HTTPException(status_code=422, detail="Некорректное значение приватности")

    if cover and cover.filename:
        validate_uploaded_file(cover, "cover")
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
    def try_remove(rel_path: str) -> None:
        if not rel_path:
            return
        safe = os.path.normpath(rel_path).replace("\\", "/").lstrip("/")
        if safe in (".", "") or safe.startswith("..") or "/.." in safe:
            return
        base = os.path.abspath(MEDIA_PATH)
        full = os.path.abspath(os.path.join(base, *safe.split("/")))
        if os.path.commonpath([base, full]) != base:
            return
        try:
            os.remove(full)
        except OSError:
            pass

    try_remove(filename)
    try_remove(cover_filename)

    return {"ok": True}


@router.get("/api/search/public")
def search_public_tracks_api(q: str, by: str = "title", db: Session = Depends(get_db)):
    """
    Search among public tracks.
    by: "title" | "author"
    """
    query = db.query(Track).filter(Track.is_public == True)
    if by == "title":
        qn = _normalize_search_query(q)
        query = query.filter(_like_any_case(Track.title, qn))
    elif by == "author":
        qn = _normalize_search_query(q)
        query = query.join(User, Track.owner_id == User.id).filter(_like_any_case(User.name, qn))
    else:
        raise HTTPException(status_code=422, detail="Некорректный параметр by")

    tracks = query.all()
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


@router.get("/api/search/mine")
def search_my_tracks_api(request: Request, q: str, db: Session = Depends(get_db)):
    """
    Search among current user's tracks (title + description).
    """
    user = require_user(request, db)
    qn = _normalize_search_query(q)

    tracks = (
        db.query(Track)
        .filter(Track.owner_id == user.id)
        .filter(or_(_like_any_case(Track.title, qn), _like_any_case(Track.description, qn)))
        .all()
    )

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
