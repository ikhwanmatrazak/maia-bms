from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey, Numeric, Enum, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base
import enum


class PurchaseOrderStatus(str, enum.Enum):
    draft = "draft"
    sent = "sent"
    received = "received"
    cancelled = "cancelled"


class PurchaseOrder(Base):
    __tablename__ = "purchase_orders"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True, index=True)
    po_number = Column(String(50), unique=True, nullable=False, index=True)
    vendor_name = Column(String(255), nullable=False)
    vendor_email = Column(String(255), nullable=True)
    vendor_phone = Column(String(100), nullable=True)
    vendor_address = Column(Text, nullable=True)
    status = Column(Enum(PurchaseOrderStatus), default=PurchaseOrderStatus.draft, nullable=False)
    currency = Column(String(3), nullable=False, default="MYR")
    exchange_rate = Column(Numeric(10, 6), default=1.0)
    issue_date = Column(DateTime(timezone=True), nullable=False)
    expected_delivery_date = Column(DateTime(timezone=True), nullable=True)
    subtotal = Column(Numeric(15, 2), default=0.00)
    discount_amount = Column(Numeric(15, 2), default=0.00)
    tax_total = Column(Numeric(15, 2), default=0.00)
    total = Column(Numeric(15, 2), default=0.00)
    notes = Column(Text, nullable=True)
    terms_conditions = Column(Text, nullable=True)
    created_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    sent_at = Column(DateTime(timezone=True), nullable=True)
    received_at = Column(DateTime(timezone=True), nullable=True)
    is_deleted = Column(Boolean, default=False, server_default="0")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    items = relationship("PurchaseOrderItem", back_populates="purchase_order",
                         cascade="all, delete-orphan", order_by="PurchaseOrderItem.sort_order")


class PurchaseOrderItem(Base):
    __tablename__ = "purchase_order_items"

    id = Column(Integer, primary_key=True, index=True)
    purchase_order_id = Column(Integer, ForeignKey("purchase_orders.id", ondelete="CASCADE"), nullable=False)
    description = Column(Text, nullable=False)
    quantity = Column(Numeric(10, 2), nullable=False, default=1)
    unit_price = Column(Numeric(15, 2), nullable=False, default=0.00)
    tax_rate_id = Column(Integer, ForeignKey("tax_rates.id", ondelete="SET NULL"), nullable=True)
    tax_amount = Column(Numeric(15, 2), default=0.00)
    line_total = Column(Numeric(15, 2), default=0.00)
    sort_order = Column(Integer, default=0)

    purchase_order = relationship("PurchaseOrder", back_populates="items")
    tax_rate = relationship("TaxRate")
