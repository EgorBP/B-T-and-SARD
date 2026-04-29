import os

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from sqlalchemy.orm import Session

from models import Track, User

from .auth import (
    do_login,
    do_register,
    do_reset_password,
    validate_email,
    validate_name,
    validate_password,
    validate_recovery_answer,
    validate_recovery_question,
)
from .context import MEDIA_PATH, pwd_context, render_spa, templates
from .deps import get_current_user, get_db
from .storage import save_uploaded_file

router = APIRouter()


@router.get("/")
def public_tracks(request: Request):
    return render_spa(request)


@router.get("/tracks")
def tracks_page(request: Request):
    return render_spa(request)


@router.get("/search")
def search_page(request: Request):
    return render_spa(request)


@router.get("/tracks/{track_id}/edit")
def track_edit_page(track_id: int, request: Request):
    return render_spa(request)


@router.get("/auth/register")
def register_page(request: Request, db: Session = Depends(get_db)):
    if get_current_user(request, db):
        return RedirectResponse("/profile", status_code=302)
    return render_spa(request)


@router.get("/auth/login")
def login_page(request: Request, db: Session = Depends(get_db)):
    if get_current_user(request, db):
        return RedirectResponse("/profile", status_code=302)
    return render_spa(request)


@router.get("/auth/forgot-password")
def forgot_password_page(request: Request):
    return render_spa(request)


@router.post("/auth/register")
def register_form(
    request: Request,
    email: str = Form(...),
    name: str = Form(...),
    password: str = Form(...),
    recovery_question: str = Form(None),
    recovery_answer: str = Form(None),
    db: Session = Depends(get_db),
):
    try:
        user = do_register(
            db=db,
            email=email,
            name=name,
            password=password,
            recovery_question=recovery_question,
            recovery_answer=recovery_answer,
        )
    except HTTPException as exc:
        return templates.TemplateResponse(
            "register.html",
            {
                "request": request,
                "error": str(exc.detail),
                "form_email": email,
                "form_name": name,
                "form_recovery_question": recovery_question,
                "form_recovery_answer": recovery_answer,
            },
            status_code=exc.status_code,
        )

    request.session["user_id"] = user.id
    return RedirectResponse("/profile", status_code=303)


@router.post("/auth/login")
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


@router.post("/auth/forgot-password")
def forgot_password_form(
    request: Request,
    email: str = Form(...),
    recovery_question: str = Form(None),
    recovery_answer: str = Form(None),
    recovery_phrase: str = Form(None),
    new_password: str = Form(...),
    db: Session = Depends(get_db),
):
    try:
        do_reset_password(
            db=db,
            email=email,
            recovery_question=recovery_question,
            recovery_answer=recovery_answer,
            recovery_phrase=recovery_phrase,
            new_password=new_password,
        )
    except HTTPException as exc:
        return templates.TemplateResponse(
            "forgot_password.html",
            {
                "request": request,
                "error": str(exc.detail),
                "form_email": email,
                "form_recovery_question": recovery_question,
                "form_recovery_answer": recovery_answer,
            },
            status_code=exc.status_code,
        )

    return RedirectResponse("/auth/login", status_code=303)


@router.get("/profile")
def profile(request: Request, db: Session = Depends(get_db)):
    return render_spa(request)


@router.get("/profile/settings")
def profile_settings_page(request: Request, db: Session = Depends(get_db)):
    return render_spa(request)


@router.post("/profile/settings")
def profile_settings_form(
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
    user = get_current_user(request, db)
    if not user:
        return RedirectResponse("/auth/login", status_code=303)

    try:
        normalized_email = validate_email(email)
        normalized_name = validate_name(name)
        normalized_question = validate_recovery_question(recovery_question or user.recovery_question or "")
        normalized_answer = validate_recovery_answer(recovery_answer or recovery_phrase or user.recovery_answer or user.recovery_phrase)
    except HTTPException as exc:
        return templates.TemplateResponse(
            "profile_settings.html",
            {
                "request": request,
                "user": user,
                "error": str(exc.detail),
                "form_recovery_question": recovery_question,
                "form_recovery_answer": recovery_answer,
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
                "form_recovery_question": recovery_question,
                "form_recovery_answer": recovery_answer,
            },
            status_code=409,
        )

    user.email = normalized_email
    user.name = normalized_name
    user.recovery_question = normalized_question
    user.recovery_answer = normalized_answer
    user.recovery_phrase = normalized_answer

    if password and password.strip():
        user.password_hash = pwd_context.hash(validate_password(password))

    if avatar and avatar.filename:
        user.avatar_filename = save_uploaded_file(avatar, "avatar")

    db.commit()
    db.refresh(user)
    return RedirectResponse("/profile", status_code=303)


@router.get("/tracks/upload")
def upload_page(request: Request, db: Session = Depends(get_db)):
    return render_spa(request)


@router.get("/media/{path:path}")
def media(path: str):
    # Allow nested paths like "avatars/..." or "tracks/...".
    safe = os.path.normpath(path).replace("\\", "/").lstrip("/")
    if safe in (".", "") or safe.startswith("..") or "/.." in safe:
        raise HTTPException(status_code=404, detail="Not found")

    base = os.path.abspath(MEDIA_PATH)
    full = os.path.abspath(os.path.join(base, *safe.split("/")))
    if os.path.commonpath([base, full]) != base or not os.path.isfile(full):
        raise HTTPException(status_code=404, detail="Not found")
    return FileResponse(full)


@router.post("/upload")
def upload_track(
    request: Request,
    title: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    user = get_current_user(request, db)
    if not user:
        return RedirectResponse("/auth/login", status_code=303)

    stored_filename = save_uploaded_file(file, "track")

    track = Track(
        title=title,
        filename=stored_filename,
        is_public=False,
        owner_id=user.id,
    )

    db.add(track)
    db.commit()

    return RedirectResponse("/profile", status_code=303)


@router.post("/toggle_privacy/{track_id}")
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


@router.get("/logout")
def logout(request: Request):
    request.session.clear()
    return RedirectResponse("/", status_code=303)


@router.get("/{full_path:path}")
def spa_fallback(full_path: str, request: Request):
    if full_path.startswith("api/"):
        raise HTTPException(status_code=404, detail="Not Found")
    return render_spa(request)
