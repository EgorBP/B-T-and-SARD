import re
import secrets

from fastapi import HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from database import engine
from models import Track, User

from .context import pwd_context


RECOVERY_QUESTIONS = [
    "Как звали вашего первого питомца?",
    "Как называлась улица, где вы выросли?",
    "Какое имя было у вашего любимого учителя?",
    "Как назывался ваш первый фильм/книга, который вам запомнился?",
    "Какой был ваш любимый город в детстве?",
]

DEFAULT_RECOVERY_QUESTION = RECOVERY_QUESTIONS[0]


class RegisterRequest(BaseModel):
    email: str
    name: str
    password: str
    recoveryQuestion: str | None = None
    recoveryAnswer: str | None = None


class LoginRequest(BaseModel):
    email: str
    password: str


class ResetPasswordRequest(BaseModel):
    email: str
    recoveryQuestion: str | None = None
    recoveryAnswer: str | None = None
    recoveryPhrase: str | None = None
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


def validate_recovery_question(question: str) -> str:
    normalized = question.strip()
    if normalized not in RECOVERY_QUESTIONS:
        raise HTTPException(status_code=422, detail="Некорректный секретный вопрос")
    return normalized


def validate_recovery_answer(answer: str) -> str:
    normalized = answer.strip()
    if len(normalized) < 2:
        raise HTTPException(status_code=422, detail="Ответ на секретный вопрос слишком короткий")
    return normalized


def normalize_recovery_answer(answer: str) -> str:
    return " ".join((answer or "").strip().lower().split())


def generate_recovery_phrase() -> str:
    words = [
        "atlas", "forest", "river", "shadow", "silver", "sunset", "winter", "autumn",
        "ember", "planet", "ocean", "breeze", "vector", "signal", "rocket", "matrix",
        "native", "pixel", "quantum", "aurora", "cloud", "falcon", "tiger", "comet",
    ]
    return " ".join(secrets.choice(words) for _ in range(6))


def do_register(
    db: Session,
    email: str,
    name: str,
    password: str,
    recovery_question: str | None = None,
    recovery_answer: str | None = None,
) -> User:
    email = validate_email(email)
    name = validate_name(name)
    password = validate_password(password)
    recovery_question = validate_recovery_question(recovery_question or DEFAULT_RECOVERY_QUESTION)
    recovery_answer = validate_recovery_answer(recovery_answer or generate_recovery_phrase())

    existing_user = db.query(User).filter(User.email == email).first()
    if existing_user:
        raise HTTPException(status_code=409, detail="Пользователь с таким email уже существует")

    user = User(
        email=email,
        name=name,
        password_hash=pwd_context.hash(password),
        recovery_phrase=recovery_answer,
        recovery_question=recovery_question,
        recovery_answer=recovery_answer,
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


def do_reset_password(
    db: Session,
    email: str,
    recovery_question: str | None = None,
    recovery_answer: str | None = None,
    new_password: str | None = None,
    recovery_phrase: str | None = None,
) -> User:
    email = validate_email(email)
    new_password = validate_password(new_password or "")

    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    stored_question = user.recovery_question or DEFAULT_RECOVERY_QUESTION
    stored_answer = user.recovery_answer or user.recovery_phrase

    provided_question = validate_recovery_question(recovery_question or stored_question)
    provided_answer = recovery_answer if recovery_answer is not None else recovery_phrase
    if provided_answer is None:
        raise HTTPException(status_code=422, detail="Некорректный ответ на секретный вопрос")
    provided_answer = validate_recovery_answer(provided_answer)

    if provided_question != stored_question:
        raise HTTPException(status_code=401, detail="Неверный секретный вопрос")

    if normalize_recovery_answer(stored_answer) != normalize_recovery_answer(provided_answer):
        raise HTTPException(status_code=401, detail="Неверный ответ на секретный вопрос")

    user.password_hash = pwd_context.hash(new_password)
    db.commit()
    db.refresh(user)
    return user
