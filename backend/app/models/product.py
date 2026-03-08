from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey, Numeric, Enum, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base
import enum


class BillingCycle(str, enum.Enum):
    one_time = "one_time"
    monthly = "monthly"
    quarterly = "quarterly"
    annually = "annually"


class SubscriptionStatus(str, enum.Enum):
    active = "active"
    paused = "paused"
    cancelled = "cancelled"


class Product(Base):
    __tablename__ = "products"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    unit_price = Column(Numeric(15, 2), nullable=False, server_default="0.00")
    currency = Column(String(3), nullable=False, default="MYR")
    unit_label = Column(String(50), nullable=True)
    billing_cycle = Column(Enum(BillingCycle), default=BillingCycle.one_time, nullable=False)
    category = Column(String(100), nullable=True)
    is_active = Column(Boolean, default=True, server_default="1")
    email_subject = Column(String(500), nullable=True)
    email_body = Column(Text, nullable=True)
    document_template_id = Column(Integer, ForeignKey("document_templates.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    subscriptions = relationship("ProductSubscription", back_populates="product", cascade="all, delete-orphan")
    pricing = relationship("ProductPricing", back_populates="product", cascade="all, delete-orphan",
                           order_by="ProductPricing.sort_order")

    @property
    def active_subscription_count(self) -> int:
        return sum(1 for s in self.subscriptions if s.status == SubscriptionStatus.active)


class ProductPricing(Base):
    __tablename__ = "product_pricing"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(255), nullable=False)          # e.g. "Onboarding Fee", "Monthly Subscription"
    description = Column(Text, nullable=True)
    amount = Column(Numeric(15, 2), nullable=False, server_default="0.00")
    billing_cycle = Column(Enum(BillingCycle), nullable=False, default=BillingCycle.one_time)
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    product = relationship("Product", back_populates="pricing")


class ProductSubscription(Base):
    __tablename__ = "product_subscriptions"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True)
    client_id = Column(Integer, ForeignKey("clients.id", ondelete="RESTRICT"), nullable=False, index=True)
    start_date = Column(DateTime(timezone=True), nullable=False)
    next_renewal_date = Column(DateTime(timezone=True), nullable=True)
    billing_cycle = Column(Enum(BillingCycle), nullable=False)
    amount = Column(Numeric(15, 2), nullable=False, server_default="0.00")
    status = Column(Enum(SubscriptionStatus), default=SubscriptionStatus.active, nullable=False)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    product = relationship("Product", back_populates="subscriptions")
    client = relationship("Client")

    @property
    def client_name(self) -> str:
        return self.client.company_name if self.client else ""

    @property
    def product_name(self) -> str:
        return self.product.name if self.product else ""
