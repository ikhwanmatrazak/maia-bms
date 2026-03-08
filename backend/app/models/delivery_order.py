from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey, Numeric, Enum, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base
import enum


class DeliveryOrderStatus(str, enum.Enum):
    draft = "draft"
    sent = "sent"
    delivered = "delivered"
    cancelled = "cancelled"


class DeliveryOrder(Base):
    __tablename__ = "delivery_orders"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True, index=True)
    do_number = Column(String(50), unique=True, nullable=False, index=True)
    client_id = Column(Integer, ForeignKey("clients.id", ondelete="RESTRICT"), nullable=False)
    status = Column(Enum(DeliveryOrderStatus), default=DeliveryOrderStatus.draft, nullable=False)
    issue_date = Column(DateTime(timezone=True), nullable=False)
    delivery_date = Column(DateTime(timezone=True), nullable=True)
    delivery_address = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)
    created_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    sent_at = Column(DateTime(timezone=True), nullable=True)
    delivered_at = Column(DateTime(timezone=True), nullable=True)
    is_deleted = Column(Boolean, default=False, server_default="0")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    client = relationship("Client", back_populates="delivery_orders")

    @property
    def client_name(self) -> str:
        return self.client.company_name if self.client else ""

    items = relationship("DeliveryOrderItem", back_populates="delivery_order",
                         cascade="all, delete-orphan", order_by="DeliveryOrderItem.sort_order")


class DeliveryOrderItem(Base):
    __tablename__ = "delivery_order_items"

    id = Column(Integer, primary_key=True, index=True)
    delivery_order_id = Column(Integer, ForeignKey("delivery_orders.id", ondelete="CASCADE"), nullable=False)
    description = Column(Text, nullable=False)
    quantity = Column(Numeric(10, 2), nullable=False, default=1)
    unit = Column(String(50), nullable=True, default="pcs")
    sort_order = Column(Integer, default=0)

    delivery_order = relationship("DeliveryOrder", back_populates="items")
