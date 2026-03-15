from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.sql import func
from app.database import Base
import secrets


class EmailTracking(Base):
    __tablename__ = "email_tracking"
    id = Column(Integer, primary_key=True, index=True)
    token = Column(String(64), unique=True, nullable=False, index=True)
    doc_type = Column(String(50), nullable=False)  # "invoice", "quotation", "receipt"
    doc_id = Column(Integer, nullable=False)
    recipient_email = Column(String(255), nullable=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True)
    sent_at = Column(DateTime(timezone=True), server_default=func.now())
    opened_at = Column(DateTime(timezone=True), nullable=True)
    open_count = Column(Integer, default=0, nullable=False)
