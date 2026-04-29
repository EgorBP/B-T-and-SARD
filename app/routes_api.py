import os

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from models import Track, TrackFavorite, User

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
    validate_recovery_answer,
    validate_recovery_question,
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


def _favorite_track_ids(db: Session, user_id: int, track_ids: list[int]) -> set[int]:
    if not track_ids:
        return set()
    rows = (
        db.query(TrackFavorite.track_id)
        .filter(TrackFavorite.user_id == user_id, TrackFavorite.track_id.in_(track_ids))
        .all()
    )
    return {int(row[0]) for row in rows}


def _serialize_track(track: Track, *, favorite_ids: set[int] | None = None, favorited_at=None):
    payload = {
        "id": track.id,
        "title": track.title,
        "filename": track.filename,
        "coverFilename": track.cover_filename,
        "description": track.description,
        "is_public": bool(track.is_public),
        "createdAt": track.created_at,
        "owner_id": track.owner_id,
        "owner_name": track.owner.name if track.owner else None,
    }
    # Новый: статистика трека и доп. алиасы для удобства клиента
    downloads = getattr(track, "downloads_count", 0) or 0
    favorites = getattr(track, "favorites_count", 0) or 0
    payload["downloadsCount"] = downloads
    payload["downloads"] = downloads
    payload["favoritesCount"] = favorites
    payload["favorites"] = favorites
    if favorite_ids is not None:
        payload["is_favorite"] = track.id in favorite_ids
    if favorited_at is not None:
        payload["favoritedAt"] = favorited_at
    return payload


@router.post("/api/auth/register")
def register_api(payload: RegisterRequest, request: Request, db: Session = Depends(get_db)):
    user = do_register(
        db=db,
        email=payload.email,
        name=payload.name,
        password=payload.password,
        recovery_question=payload.recoveryQuestion,
        recovery_answer=payload.recoveryAnswer,
    )
    request.session["user_id"] = user.id
    return {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "createdAt": user.created_at,
        "recoveryQuestion": user.recovery_question,
        "recoveryAnswer": user.recovery_answer,
        "recoveryPhrase": user.recovery_answer,
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
        "recoveryQuestion": user.recovery_question,
        "recoveryAnswer": user.recovery_answer,
        "recoveryPhrase": user.recovery_answer,
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
        "recoveryQuestion": user.recovery_question,
        "recoveryAnswer": user.recovery_answer,
        "recoveryPhrase": user.recovery_answer,
        "avatarFilename": user.avatar_filename,
    }


@router.post("/api/auth/reset-password")
def reset_password_api(payload: ResetPasswordRequest, db: Session = Depends(get_db)):
    do_reset_password(
        db=db,
        email=payload.email,
        recovery_question=payload.recoveryQuestion,
        recovery_answer=payload.recoveryAnswer,
        new_password=payload.newPassword,
        recovery_phrase=payload.recoveryPhrase,
    )
    return {"ok": True}


@router.post("/api/auth/logout")
def logout_api(request: Request):
    request.session.clear()
    return {"ok": True}


TOP_TRACKS_LIMIT = 10


@router.get("/api/tracks/top")
def top_tracks_api(request: Request, db: Session = Depends(get_db)):
    tracks = (
        db.query(Track)
        .filter(Track.is_public == True, Track.downloads_count > 0)
        .order_by(Track.downloads_count.desc(), Track.id.desc())
        .limit(TOP_TRACKS_LIMIT)
        .all()
    )
    favorite_ids = set()
    if request.session.get("user_id"):
        favorite_ids = _favorite_track_ids(db, request.session["user_id"], [t.id for t in tracks])
    items = [_serialize_track(t, favorite_ids=favorite_ids) for t in tracks]
    return {"items": items}


@router.get("/api/tracks/public")
def public_tracks_api(
    request: Request,
    limit: int | None = None,
    offset: int = 0,
    minDownloads: int | None = None,
    maxDownloads: int | None = None,
    minFavorites: int | None = None,
    maxFavorites: int | None = None,
    db: Session = Depends(get_db),
):
    limit, offset = _validate_pagination(limit, offset)
    query = db.query(Track).filter(Track.is_public == True)
    if minDownloads is not None:
        query = query.filter(Track.downloads_count >= minDownloads)
    if maxDownloads is not None:
        query = query.filter(Track.downloads_count <= maxDownloads)
    if minFavorites is not None:
        query = query.filter(Track.favorites_count >= minFavorites)
    if maxFavorites is not None:
        query = query.filter(Track.favorites_count <= maxFavorites)
    total = query.with_entities(func.count(Track.id)).scalar() or 0

    tracks_query = query.order_by(Track.created_at.desc(), Track.id.desc())
    if limit is not None:
        tracks_query = tracks_query.offset(offset).limit(limit)

    tracks = tracks_query.all()
    favorite_ids = set()
    if request.session.get("user_id"):
        favorite_ids = _favorite_track_ids(db, request.session["user_id"], [t.id for t in tracks])
    items = [_serialize_track(t, favorite_ids=favorite_ids) for t in tracks]

    if limit is None:
        return {"items": items, "total": total, "offset": 0, "limit": total, "hasMore": False}

    return {"items": items, "total": total, "offset": offset, "limit": limit, "hasMore": offset + len(items) < total}


@router.get("/api/tracks/mine")
def my_tracks_api(
    request: Request,
    limit: int | None = None,
    offset: int = 0,
    minDownloads: int | None = None,
    maxDownloads: int | None = None,
    minFavorites: int | None = None,
    maxFavorites: int | None = None,
    db: Session = Depends(get_db),
):
    limit, offset = _validate_pagination(limit, offset)
    user = require_user(request, db)
    query = db.query(Track).filter(Track.owner_id == user.id)
    if minDownloads is not None:
        query = query.filter(Track.downloads_count >= minDownloads)
    if maxDownloads is not None:
        query = query.filter(Track.downloads_count <= maxDownloads)
    if minFavorites is not None:
        query = query.filter(Track.favorites_count >= minFavorites)
    if maxFavorites is not None:
        query = query.filter(Track.favorites_count <= maxFavorites)
    total = query.with_entities(func.count(Track.id)).scalar() or 0

    tracks_query = query.order_by(Track.created_at.desc(), Track.id.desc())
    if limit is not None:
        tracks_query = tracks_query.offset(offset).limit(limit)

    tracks = tracks_query.all()
    favorite_ids = _favorite_track_ids(db, user.id, [t.id for t in tracks])
    items = []
    for t in tracks:
        payload = _serialize_track(t, favorite_ids=favorite_ids)
        payload.pop("owner_id", None)
        payload.pop("owner_name", None)
        items.append(payload)

    if limit is None:
        return {"items": items, "total": total, "offset": 0, "limit": total, "hasMore": False}

    return {"items": items, "total": total, "offset": offset, "limit": limit, "hasMore": offset + len(items) < total}


@router.get("/api/profile/settings")
def profile_settings_get_api(request: Request, db: Session = Depends(get_db)):
    user = require_user(request, db)
    return {
        "email": user.email,
        "name": user.name,
        "recoveryQuestion": user.recovery_question,
        "recoveryAnswer": user.recovery_answer,
        "recoveryPhrase": user.recovery_answer,
        "avatarFilename": user.avatar_filename,
    }


@router.post("/api/profile/settings")
def profile_settings_post_api(
    request: Request,
    email: str = Form(...),
    name: str = Form(...),
    recovery_question: str = Form(None),
    recovery_answer: str = Form(None),
    recovery_phrase: str = Form(None),
    password: str = Form(None),
    avatar: UploadFile = File(None),
    db: Session = Depends(get_db),
):
    user = require_user(request, db)

    normalized_email = validate_email(email)
    normalized_name = validate_name(name)
    normalized_question = validate_recovery_question(recovery_question or user.recovery_question or "")
    normalized_answer = validate_recovery_answer(recovery_answer or recovery_phrase or user.recovery_answer or user.recovery_phrase)

    email_owner = db.query(User).filter(User.email == normalized_email, User.id != user.id).first()
    if email_owner:
        raise HTTPException(status_code=409, detail="Email занят")

    user.email = normalized_email
    user.name = normalized_name
    user.recovery_question = normalized_question
    user.recovery_answer = normalized_answer
    user.recovery_phrase = normalized_answer

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
    db.query(TrackFavorite).filter(TrackFavorite.track_id == track_id).delete(synchronize_session=False)
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


@router.post("/api/tracks/{track_id}/download")
def track_download_api(track_id: int, db: Session = Depends(get_db)):
    track = db.get(Track, track_id)
    if not track:
        raise HTTPException(status_code=404, detail="Трек не найден")
    if track.downloads_count is None:
        track.downloads_count = 0
    track.downloads_count += 1
    db.commit()
    return {"ok": True, "downloadsCount": track.downloads_count}


@router.get("/api/favorites")
def favorites_api(request: Request, limit: int | None = None, offset: int = 0, db: Session = Depends(get_db)):
    limit, offset = _validate_pagination(limit, offset)
    user = require_user(request, db)

    query = (
        db.query(Track, TrackFavorite.created_at.label("favorited_at"))
        .join(TrackFavorite, TrackFavorite.track_id == Track.id)
        .filter(TrackFavorite.user_id == user.id)
        .filter(or_(Track.is_public == True, Track.owner_id == user.id))
    )
    total = query.with_entities(func.count(Track.id)).scalar() or 0

    rows_query = query.order_by(TrackFavorite.created_at.desc(), Track.id.desc())
    if limit is not None:
        rows_query = rows_query.offset(offset).limit(limit)

    rows = rows_query.all()
    items = []
    for track, favorited_at in rows:
        items.append(_serialize_track(track, favorite_ids={track.id}, favorited_at=favorited_at))

    if limit is None:
        return {"items": items, "total": total, "offset": 0, "limit": total, "hasMore": False}

    return {"items": items, "total": total, "offset": offset, "limit": limit, "hasMore": offset + len(items) < total}


@router.get("/api/search/public")
def search_public_tracks_api(
    request: Request,
    q: str,
    by: str = "title",
    minDownloads: int | None = None,
    maxDownloads: int | None = None,
    minFavorites: int | None = None,
    maxFavorites: int | None = None,
    db: Session = Depends(get_db),
):
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

    if minDownloads is not None:
        query = query.filter(Track.downloads_count >= minDownloads)
    if maxDownloads is not None:
        query = query.filter(Track.downloads_count <= maxDownloads)
    if minFavorites is not None:
        query = query.filter(Track.favorites_count >= minFavorites)
    if maxFavorites is not None:
        query = query.filter(Track.favorites_count <= maxFavorites)

    tracks = query.all()
    favorite_ids = set()
    if request.session.get("user_id"):
        favorite_ids = _favorite_track_ids(db, request.session["user_id"], [t.id for t in tracks])
    items = [_serialize_track(t, favorite_ids=favorite_ids) for t in tracks]
    return {"items": items}


@router.get("/api/search/mine")
def search_my_tracks_api(
    request: Request,
    q: str,
    minDownloads: int | None = None,
    maxDownloads: int | None = None,
    minFavorites: int | None = None,
    maxFavorites: int | None = None,
    db: Session = Depends(get_db),
):
    """
    Search among current user's tracks (title + description).
    """
    user = require_user(request, db)
    qn = _normalize_search_query(q)

    # Apply optional filters
    if minDownloads is not None:
        query = db.query(Track).filter(Track.owner_id == user.id, Track.downloads_count >= minDownloads)
    else:
        query = db.query(Track).filter(Track.owner_id == user.id)
    if maxDownloads is not None:
        query = query.filter(Track.downloads_count <= maxDownloads)
    if minFavorites is not None:
        query = query.filter(Track.favorites_count >= minFavorites)
    if maxFavorites is not None:
        query = query.filter(Track.favorites_count <= maxFavorites)

    tracks = (
        query
        .filter(or_(_like_any_case(Track.title, qn), _like_any_case(Track.description, qn)))
        .all()
    )

    favorite_ids = _favorite_track_ids(db, user.id, [t.id for t in tracks])
    items = [_serialize_track(t, favorite_ids=favorite_ids) for t in tracks]
    return {"items": items}


@router.post("/api/favorites/{track_id}")
def add_favorite_api(track_id: int, request: Request, db: Session = Depends(get_db)):
    user = require_user(request, db)
    track = db.get(Track, track_id)
    if not track:
        raise HTTPException(status_code=404, detail="Трек не найден")
    if not track.is_public and track.owner_id != user.id:
        raise HTTPException(status_code=403, detail="Недостаточно прав")
    existing = (
        db.query(TrackFavorite)
        .filter(TrackFavorite.user_id == user.id, TrackFavorite.track_id == track_id)
        .first()
    )
    if not existing:
        db.add(TrackFavorite(user_id=user.id, track_id=track_id))
        if track.favorites_count is None:
            track.favorites_count = 0
        track.favorites_count = track.favorites_count + 1
        db.commit()
    db.refresh(track)
    return {"ok": True, "is_favorite": True, "favoritesCount": track.favorites_count or 0}


@router.delete("/api/favorites/{track_id}")
def remove_favorite_api(track_id: int, request: Request, db: Session = Depends(get_db)):
    user = require_user(request, db)
    existing = (
        db.query(TrackFavorite)
        .filter(TrackFavorite.user_id == user.id, TrackFavorite.track_id == track_id)
        .first()
    )
    if existing:
        db.delete(existing)
        track = db.get(Track, track_id)
        if track and track.favorites_count:
            track.favorites_count = max(0, track.favorites_count - 1)
        db.commit()
    track = db.get(Track, track_id)
    fav_count = (track.favorites_count or 0) if track else 0
    return {"ok": True, "is_favorite": False, "favoritesCount": fav_count}
