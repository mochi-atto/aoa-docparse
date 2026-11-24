from sqlalchemy import Column, String, DateTime, Text
from app.database import Base
import datetime


class UserProfile(Base):
    __tablename__ = "user_profiles"

    sub = Column(String, primary_key=True)  # auth0 id
    display_name = Column(String, nullable=True)
    picture_data = Column(Text, nullable=True)  # Base64 data URL for profile photo
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)
