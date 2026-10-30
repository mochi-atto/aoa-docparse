from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, UniqueConstraint
from sqlalchemy.orm import relationship, validates
from app.database import Base
import datetime


class ParishMember(Base):
    __tablename__ = "parish_members"
    __table_args__ = (UniqueConstraint("parish_id", "email", name="uq_parish_member_email"),)

    id = Column(Integer, primary_key=True)
    parish_id = Column(Integer, ForeignKey("parishes.id", ondelete="CASCADE"), nullable=False)
    account_id = Column(Integer, ForeignKey("accounts.id", ondelete="CASCADE"), nullable=True)
    email = Column(String, nullable=False, index=True)
    role = Column(String, nullable=False, default="viewer")
    invitation_token = Column(String, unique=True, nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    parish = relationship("Parish", back_populates="members")
    account = relationship("Account", back_populates="memberships")

    @validates("role")
    def validate_role(self, key, value):
        if value not in {"admin", "editor", "viewer"}:
            raise ValueError("Role must be admin, editor, or viewer")
        return value
