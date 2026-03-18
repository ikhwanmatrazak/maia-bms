from sqlalchemy import Column, Integer, String, Text, DateTime, Numeric, Boolean, Enum, ForeignKey
from sqlalchemy.sql import func
from app.database import Base
import enum


class BillStatus(str, enum.Enum):
    pending = "pending"
    paid = "paid"
    overdue = "overdue"


class Bill(Base):
    __tablename__ = "bills"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True, index=True)
    created_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    # Vendor / Supplier info
    vendor_name = Column(String(255), nullable=True)
    vendor_address = Column(Text, nullable=True)
    vendor_email = Column(String(255), nullable=True)
    vendor_phone = Column(String(50), nullable=True)
    vendor_reg_no = Column(String(100), nullable=True)   # Company registration number

    # Banking details
    bank_name = Column(String(255), nullable=True)
    bank_account_no = Column(String(100), nullable=True)
    bank_account_name = Column(String(255), nullable=True)

    # Invoice details
    bill_number = Column(String(100), nullable=True)     # Their invoice number
    description = Column(Text, nullable=True)
    issue_date = Column(DateTime(timezone=True), nullable=True)
    due_date = Column(DateTime(timezone=True), nullable=True)

    # Amount
    amount = Column(Numeric(15, 2), nullable=True)
    currency = Column(String(10), default="MYR")

    # Status & payment tracking
    status = Column(Enum(BillStatus), default=BillStatus.pending, nullable=False)
    paid_at = Column(DateTime(timezone=True), nullable=True)
    payment_reference = Column(String(255), nullable=True)

    # Uploaded file
    file_url = Column(String(500), nullable=True)

    notes = Column(Text, nullable=True)
    is_deleted = Column(Boolean, default=False, server_default="0")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
