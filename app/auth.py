import re
import secrets

from fastapi import HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from database import engine
from models import User

from .context import pwd_context


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

