from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

# Учебный режим: используем SQLite для простоты.
# При необходимости путь к файлу можно переопределить через SQLITE_DB_PATH.
SQLITE_DB_PATH = "./music.db"
DATABASE_URL = f"sqlite:///{SQLITE_DB_PATH}"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()
