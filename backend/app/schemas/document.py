from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from decimal import Decimal
from app.models.quotation import QuotationStatus
from app.models.invoice import InvoiceStatus
from app.models.receipt import PaymentMethod


# --- Shared ---
class DocumentItemCreate(BaseModel):
    description: str
    quantity: Decimal
    unit_price: Decimal
    tax_rate_id: Optional[int] = None
    sort_order: int = 0


class DocumentItemResponse(BaseModel):
    id: int
    description: str
    quantity: Decimal
    unit_price: Decimal
    tax_rate_id: Optional[int]
    tax_amount: Decimal
    line_total: Decimal
    sort_order: int

    model_config = {"from_attributes": True}


# --- Quotation ---
class QuotationCreate(BaseModel):
    client_id: int
    currency: str = "MYR"
    exchange_rate: Decimal = Decimal("1.0")
    issue_date: datetime
    expiry_date: Optional[datetime] = None
    discount_amount: Decimal = Decimal("0.00")
    notes: Optional[str] = None
    terms_conditions: Optional[str] = None
    payment_terms: Optional[str] = None
    template_id: Optional[int] = None
    items: List[DocumentItemCreate] = []


class QuotationUpdate(BaseModel):
    client_id: Optional[int] = None
    status: Optional[QuotationStatus] = None
    currency: Optional[str] = None
    exchange_rate: Optional[Decimal] = None
    issue_date: Optional[datetime] = None
    expiry_date: Optional[datetime] = None
    discount_amount: Optional[Decimal] = None
    notes: Optional[str] = None
    terms_conditions: Optional[str] = None
    payment_terms: Optional[str] = None
    template_id: Optional[int] = None
    items: Optional[List[DocumentItemCreate]] = None


class QuotationResponse(BaseModel):
    id: int
    quotation_number: str
    client_id: int
    status: QuotationStatus
    currency: str
    exchange_rate: Decimal
    issue_date: datetime
    expiry_date: Optional[datetime]
    subtotal: Decimal
    discount_amount: Decimal
    tax_total: Decimal
    total: Decimal
    notes: Optional[str]
    terms_conditions: Optional[str]
    payment_terms: Optional[str]
    template_id: Optional[int]
    created_by: Optional[int]
    sent_at: Optional[datetime]
    accepted_at: Optional[datetime]
    client_name: str = ""
    created_at: datetime
    updated_at: datetime
    items: List[DocumentItemResponse] = []

    model_config = {"from_attributes": True}


# --- Invoice ---
class InvoiceCreate(BaseModel):
    client_id: int
    quotation_id: Optional[int] = None
    currency: str = "MYR"
    exchange_rate: Decimal = Decimal("1.0")
    issue_date: datetime
    due_date: Optional[datetime] = None
    discount_amount: Decimal = Decimal("0.00")
    notes: Optional[str] = None
    terms_conditions: Optional[str] = None
    payment_terms: Optional[str] = None
    template_id: Optional[int] = None
    items: List[DocumentItemCreate] = []


class InvoiceUpdate(BaseModel):
    client_id: Optional[int] = None
    status: Optional[InvoiceStatus] = None
    currency: Optional[str] = None
    exchange_rate: Optional[Decimal] = None
    issue_date: Optional[datetime] = None
    due_date: Optional[datetime] = None
    discount_amount: Optional[Decimal] = None
    notes: Optional[str] = None
    terms_conditions: Optional[str] = None
    payment_terms: Optional[str] = None
    template_id: Optional[int] = None
    items: Optional[List[DocumentItemCreate]] = None


class InvoiceResponse(BaseModel):
    id: int
    invoice_number: str
    quotation_id: Optional[int]
    client_id: int
    status: InvoiceStatus
    currency: str
    exchange_rate: Decimal
    issue_date: datetime
    due_date: Optional[datetime]
    subtotal: Decimal
    discount_amount: Decimal
    tax_total: Decimal
    total: Decimal
    amount_paid: Decimal
    balance_due: Decimal
    notes: Optional[str]
    terms_conditions: Optional[str]
    payment_terms: Optional[str]
    template_id: Optional[int]
    created_by: Optional[int]
    sent_at: Optional[datetime]
    paid_at: Optional[datetime]
    client_name: str = ""
    created_at: datetime
    updated_at: datetime
    items: List[DocumentItemResponse] = []

    model_config = {"from_attributes": True}


# --- Payment ---
class PaymentCreate(BaseModel):
    amount: Decimal
    currency: str = "MYR"
    payment_date: datetime
    payment_method: PaymentMethod
    reference_number: Optional[str] = None
    notes: Optional[str] = None
    generate_receipt: bool = True


class PaymentResponse(BaseModel):
    id: int
    invoice_id: int
    receipt_id: Optional[int]
    amount: Decimal
    currency: str
    payment_date: datetime
    payment_method: PaymentMethod
    reference_number: Optional[str]
    proof_file_url: Optional[str]
    notes: Optional[str]
    recorded_by: Optional[int]
    created_at: datetime

    model_config = {"from_attributes": True}


# --- Receipt ---
class ReceiptResponse(BaseModel):
    id: int
    receipt_number: str
    invoice_id: int
    client_id: int
    currency: str
    exchange_rate: Decimal
    amount: Decimal
    payment_method: PaymentMethod
    payment_date: datetime
    notes: Optional[str]
    template_id: Optional[int]
    created_by: Optional[int]
    sent_at: Optional[datetime]
    client_name: str = ""
    created_at: datetime

    model_config = {"from_attributes": True}
