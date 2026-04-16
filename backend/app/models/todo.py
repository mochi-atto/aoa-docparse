from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from app.database import Base
import datetime


class Todo(Base):
    __tablename__ = "todos"

    id = Column(Integer, primary_key=True, index=True)
    parish_id = Column(Integer, ForeignKey("parishes.id"), nullable=False)

    text = Column(String, nullable=False)
    building = Column(String, nullable=False)
    priority = Column(String, nullable=False, default="green")  # red, yellow, green, blue
    prev_priority = Column(String, nullable=True)  # stored when addressed, for undo
    done = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    parish = relationship("Parish", back_populates="todos")