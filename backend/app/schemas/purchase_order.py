from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from decimal import Decimal
from app.models.purchase_order import PurchaseOrderStatus
from app.schemas.document import DocumentItemCreate, DocumentItemResponse


class PurchaseOrderCreate(BaseModel):
    vendor_name: str
    vendor_email: Optional[str] = None
    vendor_phone: Optional[str] = None
    vendor_address: Optional[str] = None
    currency: str = "MYR"
    exchange_rate: Decimal = Decimal("1.0")
    issue_date: datetime
    expected_delivery_date: Optional[datetime] = None
    discount_amount: Decimal = Decimal("0.00")
    notes: Optional[str] = None
    terms_conditions: Optional[str] = None
    items: List[DocumentItemCreate] = []


class PurchaseOrderUpdate(BaseModel):
    vendor_name: Optional[str] = None
    vendor_email: Optional[str] = None
    vendor_phone: Optional[str] = None
    vendor_address: Optional[str] = None
    status: Optional[PurchaseOrderStatus] = None
    currency: Optional[str] = None
    exchange_rate: Optional[Decimal] = None
    issue_date: Optional[datetime] = None
    expected_delivery_date: Optional[datetime] = None
    discount_amount: Optional[Decimal] = None
    notes: Optional[str] = None
    terms_conditions: Optional[str] = None
    items: Optional[List[DocumentItemCreate]] = None


class PurchaseOrderResponse(BaseModel):
    id: int
    po_number: str
    vendor_name: str
    vendor_email: Optional[str]
    vendor_phone: Optional[str]
    vendor_address: Optional[str]
    status: PurchaseOrderStatus
    currency: str
    exchange_rate: Decimal
    issue_date: datetime
    expected_delivery_date: Optional[datetime]
    subtotal: Decimal
    discount_amount: Decimal
    tax_total: Decimal
    total: Decimal
    notes: Optional[str]
    terms_conditions: Optional[str]
    created_by: Optional[int]
    sent_at: Optional[datetime]
    received_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime
    items: List[DocumentItemResponse] = []

    model_config = {"from_attributes": True}
