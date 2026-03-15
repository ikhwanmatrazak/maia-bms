from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime
from app.models.settings import TemplateType


class CompanySettingsUpdate(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None
    default_currency: Optional[str] = None
    default_payment_terms: Optional[int] = None
    invoice_prefix: Optional[str] = None
    quotation_prefix: Optional[str] = None
    receipt_prefix: Optional[str] = None
    po_prefix: Optional[str] = None
    do_prefix: Optional[str] = None
    smtp_host: Optional[str] = None
    smtp_port: Optional[int] = None
    smtp_user: Optional[str] = None
    smtp_password: Optional[str] = None  # Will be encrypted before storing
    smtp_from_email: Optional[str] = None
    smtp_from_name: Optional[str] = None
    company_registration_no: Optional[str] = None
    sst_no: Optional[str] = None
    tin_no: Optional[str] = None
    payment_terms_text: Optional[str] = None
    payment_info: Optional[str] = None
    bank_name: Optional[str] = None
    bank_account_no: Optional[str] = None
    bank_account_name: Optional[str] = None
    primary_color: Optional[str] = None
    accent_color: Optional[str] = None


class CompanySettingsResponse(BaseModel):
    id: int
    name: str
    logo_url: Optional[str]
    address: Optional[str]
    phone: Optional[str]
    email: Optional[str]
    website: Optional[str]
    default_currency: str
    default_payment_terms: int
    invoice_prefix: str
    quotation_prefix: str
    receipt_prefix: str
    po_prefix: str = "PO"
    do_prefix: str = "DO"
    smtp_host: Optional[str]
    smtp_port: Optional[int]
    smtp_user: Optional[str]
    smtp_from_email: Optional[str]
    smtp_from_name: Optional[str]
    company_registration_no: Optional[str]
    sst_no: Optional[str]
    tin_no: Optional[str]
    payment_terms_text: Optional[str]
    payment_info: Optional[str]
    bank_name: Optional[str]
    bank_account_no: Optional[str]
    bank_account_name: Optional[str]
    signature_image_url: Optional[str]
    primary_color: str
    accent_color: str
    updated_at: datetime

    model_config = {"from_attributes": True}


class TaxRateCreate(BaseModel):
    name: str
    rate: float
    is_default: bool = False


class TaxRateUpdate(BaseModel):
    name: Optional[str] = None
    rate: Optional[float] = None
    is_default: Optional[bool] = None
    is_active: Optional[bool] = None


class TaxRateResponse(BaseModel):
    id: int
    name: str
    rate: float
    is_default: bool
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class SMTPTestRequest(BaseModel):
    to_email: str


class EmailTemplateUpsert(BaseModel):
    subject: str
    body: str
    is_active: bool = True


class EmailTemplateResponse(BaseModel):
    id: int
    doc_type: str
    subject: str
    body: str
    is_active: bool
    updated_at: datetime

    model_config = {"from_attributes": True}
