from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from app.database import Base
import datetime

class WorkOrderNote(Base):
    __tablename__ = "work_order_notes"

    id = Column(Integer, primary_key=True, index=True)
    work_order_id = Column(
        Integer,
        ForeignKey("work_orders.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    author_sub = Column(String, nullable=False)  # auth0 id
    author_name = Column(String, nullable=True)

    body = Column(String, nullable=False)
    status_at_time = Column(String, nullable=True)  # order's status when the note was written

    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)