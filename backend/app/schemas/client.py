from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime
from decimal import Decimal
from app.models.client import ClientStatus


class ClientCreate(BaseModel):
    company_name: str
    contact_person: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    country: Optional[str] = None
    currency: str = "MYR"
    notes: Optional[str] = None
    status: ClientStatus = ClientStatus.active
    industry: Optional[str] = None
    tags: Optional[str] = None
    region: Optional[str] = None
    company_size: Optional[str] = None


class ClientUpdate(BaseModel):
    company_name: Optional[str] = None
    contact_person: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    country: Optional[str] = None
    currency: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[ClientStatus] = None
    industry: Optional[str] = None
    tags: Optional[str] = None
    region: Optional[str] = None
    company_size: Optional[str] = None


class ClientResponse(BaseModel):
    id: int
    company_name: str
    contact_person: Optional[str]
    email: Optional[str]
    phone: Optional[str]
    address: Optional[str]
    city: Optional[str]
    country: Optional[str]
    currency: str
    notes: Optional[str]
    status: ClientStatus
    created_by: Optional[int]
    created_at: datetime
    updated_at: datetime
    industry: Optional[str] = None
    tags: Optional[str] = None
    region: Optional[str] = None
    company_size: Optional[str] = None

    model_config = {"from_attributes": True}


class ClientListResponse(BaseModel):
    id: int
    company_name: str
    contact_person: Optional[str]
    email: Optional[str]
    phone: Optional[str]
    currency: str
    status: ClientStatus
    created_at: datetime
    outstanding_balance: Decimal = Decimal("0.00")
    industry: Optional[str] = None
    tags: Optional[str] = None
    region: Optional[str] = None
    company_size: Optional[str] = None

    model_config = {"from_attributes": True}
