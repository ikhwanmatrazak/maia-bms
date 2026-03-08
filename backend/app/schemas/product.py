from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from decimal import Decimal
from app.models.product import BillingCycle, SubscriptionStatus


class ProductCreate(BaseModel):
    name: str
    description: Optional[str] = None
    unit_price: Decimal = Decimal("0.00")
    currency: str = "MYR"
    unit_label: Optional[str] = None
    billing_cycle: BillingCycle = BillingCycle.one_time
    category: Optional[str] = None
    is_active: bool = True
    email_subject: Optional[str] = None
    email_body: Optional[str] = None
    document_template_id: Optional[int] = None


class ProductUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    unit_price: Optional[Decimal] = None
    currency: Optional[str] = None
    unit_label: Optional[str] = None
    billing_cycle: Optional[BillingCycle] = None
    category: Optional[str] = None
    is_active: Optional[bool] = None
    email_subject: Optional[str] = None
    email_body: Optional[str] = None
    document_template_id: Optional[int] = None


class PricingCreate(BaseModel):
    name: str
    description: Optional[str] = None
    amount: Decimal
    billing_cycle: BillingCycle = BillingCycle.one_time
    sort_order: int = 0


class PricingUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    amount: Optional[Decimal] = None
    billing_cycle: Optional[BillingCycle] = None
    sort_order: Optional[int] = None


class PricingResponse(BaseModel):
    id: int
    product_id: int
    name: str
    description: Optional[str]
    amount: Decimal
    billing_cycle: BillingCycle
    sort_order: int
    created_at: datetime

    model_config = {"from_attributes": True}


class ProductResponse(BaseModel):
    id: int
    name: str
    description: Optional[str]
    unit_price: Decimal
    currency: str
    unit_label: Optional[str]
    billing_cycle: BillingCycle
    category: Optional[str]
    is_active: bool
    email_subject: Optional[str]
    email_body: Optional[str]
    document_template_id: Optional[int]
    active_subscription_count: int = 0
    pricing: List[PricingResponse] = []
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class SubscriptionCreate(BaseModel):
    client_id: int
    start_date: datetime
    next_renewal_date: Optional[datetime] = None
    billing_cycle: BillingCycle
    amount: Decimal
    status: SubscriptionStatus = SubscriptionStatus.active
    notes: Optional[str] = None


class SubscriptionUpdate(BaseModel):
    start_date: Optional[datetime] = None
    next_renewal_date: Optional[datetime] = None
    billing_cycle: Optional[BillingCycle] = None
    amount: Optional[Decimal] = None
    status: Optional[SubscriptionStatus] = None
    notes: Optional[str] = None


class SubscriptionResponse(BaseModel):
    id: int
    product_id: int
    client_id: int
    client_name: str = ""
    product_name: str = ""
    start_date: datetime
    next_renewal_date: Optional[datetime]
    billing_cycle: BillingCycle
    amount: Decimal
    status: SubscriptionStatus
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
