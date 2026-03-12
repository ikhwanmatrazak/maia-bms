from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from decimal import Decimal


class CreditNoteItemCreate(BaseModel):
    description: str
    quantity: Decimal = Decimal("1")
    unit_price: Decimal = Decimal("0")
    tax_rate_id: Optional[int] = None
    sort_order: int = 0


class CreditNoteItemResponse(BaseModel):
    id: int
    description: str
    quantity: Decimal
    unit_price: Decimal
    tax_rate_id: Optional[int] = None
    tax_amount: Decimal
    line_total: Decimal
    sort_order: int

    model_config = {"from_attributes": True}


class CreditNoteCreate(BaseModel):
    client_id: int
    invoice_id: Optional[int] = None
    currency: str = "MYR"
    issue_date: datetime
    reason: Optional[str] = None
    notes: Optional[str] = None
    items: List[CreditNoteItemCreate] = []


class CreditNoteUpdate(BaseModel):
    client_id: Optional[int] = None
    invoice_id: Optional[int] = None
    currency: Optional[str] = None
    issue_date: Optional[datetime] = None
    reason: Optional[str] = None
    notes: Optional[str] = None
    items: Optional[List[CreditNoteItemCreate]] = None
    status: Optional[str] = None


class CreditNoteResponse(BaseModel):
    id: int
    tenant_id: Optional[int] = None
    credit_note_number: str
    client_id: int
    client_name: str
    client_email: str
    invoice_id: Optional[int] = None
    status: str
    currency: str
    issue_date: datetime
    reason: Optional[str] = None
    subtotal: Decimal
    tax_total: Decimal
    total: Decimal
    amount_used: Decimal
    available_balance: Decimal
    notes: Optional[str] = None
    items: List[CreditNoteItemResponse] = []
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
