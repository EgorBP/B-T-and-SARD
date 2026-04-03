from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime, func
from sqlalchemy.orm import relationship
from database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    recovery_phrase = Column(String, nullable=False)
    avatar_filename = Column(String, nullable=True)
    name = Column(String, nullable=False)
    created_at = Column(DateTime(), server_default=func.now(), nullable=False)

    tracks = relationship("Track", back_populates="owner", cascade="all, delete-orphan")


class Track(Base):
    __tablename__ = "tracks"

    id = Column(Integer, primary_key=True)
    title = Column(String, nullable=False)
    filename = Column(String, nullable=False)
    cover_filename = Column(String, nullable=True)
    description = Column(String, nullable=False, default="")
    is_public = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(), server_default=func.now(), nullable=False)

    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    owner = relationship("User", back_populates="tracks")
