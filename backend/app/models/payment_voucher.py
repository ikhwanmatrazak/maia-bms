from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey, Numeric, Enum, Boolean
from sqlalchemy.sql import func
from app.database import Base
import enum


class PaymentMethod(str, enum.Enum):
    cash = "cash"
    cheque = "cheque"
    bank_transfer = "bank_transfer"


class PVStatus(str, enum.Enum):
    draft = "draft"
    approved = "approved"
    cancelled = "cancelled"


class PaymentVoucher(Base):
    __tablename__ = "payment_vouchers"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True, index=True)
    voucher_number = Column(String(50), unique=True, nullable=False, index=True)
    date = Column(DateTime(timezone=True), nullable=False)
    payee_name = Column(String(255), nullable=False)
    payee_address = Column(Text, nullable=True)
    amount = Column(Numeric(15, 2), nullable=False, default=0.00)
    amount_in_words = Column(String(500), nullable=True)
    description = Column(Text, nullable=False)
    payment_method = Column(Enum(PaymentMethod), nullable=False, default=PaymentMethod.bank_transfer)
    cheque_number = Column(String(100), nullable=True)
    bank_ref = Column(String(100), nullable=True)
    transaction_id = Column(Integer, nullable=True)  # optional link to bank_transactions.id
    status = Column(Enum(PVStatus), default=PVStatus.draft, nullable=False)
    prepared_by = Column(String(255), nullable=True)
    approved_by = Column(String(255), nullable=True)
    notes = Column(Text, nullable=True)
    created_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    is_deleted = Column(Boolean, default=False, server_default="0")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
