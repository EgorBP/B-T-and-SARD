import os
import shutil
from fastapi.staticfiles import StaticFiles
from fastapi import FastAPI, Request, Form, Depends, HTTPException, UploadFile, File
from fastapi.responses import RedirectResponse, FileResponse
from fastapi.templating import Jinja2Templates
from fastapi.responses import JSONResponse
from starlette.middleware.sessions import SessionMiddleware
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


@app.get("/")
def public_tracks(request: Request, db: Session = Depends(get_db)):
    tracks = db.query(Track).filter(Track.is_public == True).all()
    user = get_current_user(request, db) 
    return templates.TemplateResponse("tracks.html", {"request": request, "tracks": tracks, "user": user})


@app.get("/register")
def register_page(request: Request):
    return templates.TemplateResponse("register.html", {"request": request})


@app.post("/register")
def register(request: Request,
             email: str = Form(...),
             name: str = Form(...),
             password: str = Form(...),
             db: Session = Depends(get_db)):

    user = db.query(User).filter(User.email == email).first()

    if user:
        if not pwd_context.verify(password, user.password_hash):
            raise HTTPException(status_code=400, detail="Неверный пароль")
        request.session["user_id"] = user.id
        return RedirectResponse("/profile", status_code=303)

    hashed = pwd_context.hash(password)
    user = User(email=email, name=name, password_hash=hashed)
    db.add(user)
    db.commit()
    db.refresh(user)

    request.session["user_id"] = user.id
    return RedirectResponse("/profile", status_code=303)


@app.get("/profile")
def profile(request: Request, db: Session = Depends(get_db)):
    user = get_current_user(request, db)
    if not user:
        return RedirectResponse("/register")

    tracks = db.query(Track).filter(Track.owner_id == user.id).all()

    return templates.TemplateResponse(
        "profile.html",
        {"request": request, "user": user, "tracks": tracks}
    )


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
        return RedirectResponse("/register", status_code=303)

    file_path = os.path.join(MEDIA_PATH, file.filename)

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    track = Track(
        title=title,
        filename=file.filename,
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
    request.session.clear()  # очищаем сессию
    return RedirectResponse("/", status_code=303)
