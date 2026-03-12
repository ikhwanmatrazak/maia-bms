from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey, Numeric, Enum, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base
import enum


class CreditNoteStatus(str, enum.Enum):
    draft = "draft"
    issued = "issued"
    applied = "applied"
    cancelled = "cancelled"


class CreditNote(Base):
    __tablename__ = "credit_notes"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True, index=True)
    credit_note_number = Column(String(50), unique=True, nullable=False, index=True)
    client_id = Column(Integer, ForeignKey("clients.id", ondelete="RESTRICT"), nullable=False)
    invoice_id = Column(Integer, ForeignKey("invoices.id", ondelete="SET NULL"), nullable=True)
    status = Column(Enum(CreditNoteStatus), default=CreditNoteStatus.draft, nullable=False)
    currency = Column(String(3), nullable=False, default="MYR")
    issue_date = Column(DateTime(timezone=True), nullable=False)
    reason = Column(Text, nullable=True)
    subtotal = Column(Numeric(15, 2), default=0.00)
    tax_total = Column(Numeric(15, 2), default=0.00)
    total = Column(Numeric(15, 2), default=0.00)
    amount_used = Column(Numeric(15, 2), default=0.00)
    available_balance = Column(Numeric(15, 2), default=0.00)
    notes = Column(Text, nullable=True)
    created_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    is_deleted = Column(Boolean, default=False, server_default="0")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    client = relationship("Client")
    invoice = relationship("Invoice")
    items = relationship("CreditNoteItem", back_populates="credit_note", cascade="all, delete-orphan",
                         order_by="CreditNoteItem.sort_order")

    @property
    def client_name(self) -> str:
        return self.client.company_name if self.client else ""

    @property
    def client_email(self) -> str:
        return self.client.email if self.client else ""


class CreditNoteItem(Base):
    __tablename__ = "credit_note_items"

    id = Column(Integer, primary_key=True, index=True)
    credit_note_id = Column(Integer, ForeignKey("credit_notes.id", ondelete="CASCADE"), nullable=False)
    description = Column(Text, nullable=False)
    quantity = Column(Numeric(10, 2), nullable=False, default=1)
    unit_price = Column(Numeric(15, 2), nullable=False, default=0.00)
    tax_rate_id = Column(Integer, ForeignKey("tax_rates.id", ondelete="SET NULL"), nullable=True)
    tax_amount = Column(Numeric(15, 2), default=0.00)
    line_total = Column(Numeric(15, 2), default=0.00)
    sort_order = Column(Integer, default=0)

    credit_note = relationship("CreditNote", back_populates="items")
    tax_rate = relationship("TaxRate")
