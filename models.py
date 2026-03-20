from sqlalchemy import Column, Integer, String, Boolean, ForeignKey
from sqlalchemy.orm import relationship
from database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    username = Column(String, unique=True)
    password_hash = Column(String)

    tracks = relationship("Track", back_populates="owner")


class Track(Base):
    __tablename__ = "tracks"

    id = Column(Integer, primary_key=True)
    title = Column(String)
    filename = Column(String)
    is_public = Column(Boolean, default=True)

    owner_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    owner = relationship("User", back_populates="tracks")
