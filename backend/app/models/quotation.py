from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey, Numeric, Enum, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base
import enum


class QuotationStatus(str, enum.Enum):
    draft = "draft"
    sent = "sent"
    accepted = "accepted"
    rejected = "rejected"
    expired = "expired"


class Quotation(Base):
    __tablename__ = "quotations"

    id = Column(Integer, primary_key=True, index=True)
    quotation_number = Column(String(50), unique=True, nullable=False, index=True)
    client_id = Column(Integer, ForeignKey("clients.id", ondelete="RESTRICT"), nullable=False)
    status = Column(Enum(QuotationStatus), default=QuotationStatus.draft, nullable=False)
    currency = Column(String(3), nullable=False, default="MYR")
    exchange_rate = Column(Numeric(10, 6), default=1.0)
    issue_date = Column(DateTime(timezone=True), nullable=False)
    expiry_date = Column(DateTime(timezone=True), nullable=True)
    subtotal = Column(Numeric(15, 2), default=0.00)
    discount_amount = Column(Numeric(15, 2), default=0.00)
    tax_total = Column(Numeric(15, 2), default=0.00)
    total = Column(Numeric(15, 2), default=0.00)
    notes = Column(Text, nullable=True)
    terms_conditions = Column(Text, nullable=True)
    payment_terms = Column(Text, nullable=True)
    template_id = Column(Integer, ForeignKey("document_templates.id", ondelete="SET NULL"), nullable=True)
    created_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    sent_at = Column(DateTime(timezone=True), nullable=True)
    accepted_at = Column(DateTime(timezone=True), nullable=True)
    is_deleted = Column(Boolean, default=False, server_default="0")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    client = relationship("Client", back_populates="quotations")

    @property
    def client_name(self) -> str:
        return self.client.company_name if self.client else ""
    items = relationship("QuotationItem", back_populates="quotation", cascade="all, delete-orphan",
                         order_by="QuotationItem.sort_order")
    invoices = relationship("Invoice", back_populates="quotation")


class QuotationItem(Base):
    __tablename__ = "quotation_items"

    id = Column(Integer, primary_key=True, index=True)
    quotation_id = Column(Integer, ForeignKey("quotations.id", ondelete="CASCADE"), nullable=False)
    description = Column(Text, nullable=False)
    quantity = Column(Numeric(10, 2), nullable=False, default=1)
    unit_price = Column(Numeric(15, 2), nullable=False, default=0.00)
    tax_rate_id = Column(Integer, ForeignKey("tax_rates.id", ondelete="SET NULL"), nullable=True)
    tax_amount = Column(Numeric(15, 2), default=0.00)
    line_total = Column(Numeric(15, 2), default=0.00)
    sort_order = Column(Integer, default=0)

    # Relationships
    quotation = relationship("Quotation", back_populates="items")
    tax_rate = relationship("TaxRate")
