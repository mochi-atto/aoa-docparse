from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.orm import relationship
from app.database import Base
import datetime


class Account(Base):
    __tablename__ = "accounts"

    id = Column(Integer, primary_key=True)
    auth0_sub = Column(String, unique=True, nullable=False, index=True)
    email = Column(String, unique=True, nullable=False, index=True)
    role = Column(String, nullable=False, default="admin")
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    memberships = relationship("ParishMember", back_populates="account", cascade="all, delete-orphan")
    owned_parishes = relationship("Parish", back_populates="owner")
