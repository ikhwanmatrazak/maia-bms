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

    model_config = {"from_attributes": True}
