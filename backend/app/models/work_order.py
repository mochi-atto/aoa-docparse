from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Date, UniqueConstraint
from sqlalchemy.orm import relationship
from app.database import Base
import datetime

class WorkOrder(Base):
    __tablename__ = "work_orders"
    __table_args__ = (UniqueConstraint("parish_id", "display_number"),)

    id = Column(Integer, primary_key=True, index=True)
    parish_id = Column(Integer, ForeignKey("parishes.id"), nullable=False)

    display_number = Column(String, nullable=False)

    building_id = Column(Integer, ForeignKey("buildings.id", ondelete="SET NULL"), nullable=True)
    todo_id = Column(Integer, ForeignKey("todos.id", ondelete="SET NULL"), nullable=True)  # backlog item this addresses

    title = Column(String, nullable=False)
    description = Column(String, nullable=True)
    priority = Column(String, nullable=False, default="medium")  # low, medium, high, urgent
    due_date = Column(Date, nullable=True)

    status = Column(String, nullable=False, default="unassigned")  # unassigned, assigned, in_progress, ready_for_review, closed, on_hold
    status_before_hold = Column(String, nullable=True)  # stored when put on hold, so you can continue

    requester_sub = Column(String, nullable=False) # auth0 id
    requester_name = Column(String, nullable=True)
    technician_sub = Column(String, nullable=True) # auth0 id
    technician_name = Column(String, nullable=True)

    completion_notes = Column(String, nullable=True)

    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)
    started_at = Column(DateTime, nullable=True)
    closed_at = Column(DateTime, nullable=True)

    parish = relationship("Parish", back_populates="work_orders")
    building = relationship("Building")



