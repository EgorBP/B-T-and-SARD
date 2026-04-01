from fastapi import HTTPException, Request
from sqlalchemy.orm import Session

from database import SessionLocal
from models import User


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


def require_user(request: Request, db: Session) -> User:
    user = get_current_user(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthenticated")
    return user

