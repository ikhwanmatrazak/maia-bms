from pydantic import BaseModel
from typing import Optional
from datetime import datetime, date
from app.models.prospect import ProspectStage, ProspectSource


class ProspectCreate(BaseModel):
    company_name: str
    contact_person: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    stage: ProspectStage = ProspectStage.lead
    expected_value: Optional[float] = None
    currency: str = "MYR"
    source: Optional[ProspectSource] = None
    expected_close_date: Optional[date] = None
    probability: Optional[int] = None
    notes: Optional[str] = None
    assigned_to: Optional[int] = None


class ProspectUpdate(BaseModel):
    company_name: Optional[str] = None
    contact_person: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    stage: Optional[ProspectStage] = None
    expected_value: Optional[float] = None
    currency: Optional[str] = None
    source: Optional[ProspectSource] = None
    expected_close_date: Optional[date] = None
    probability: Optional[int] = None
    notes: Optional[str] = None
    lost_reason: Optional[str] = None
    assigned_to: Optional[int] = None


class ProspectResponse(BaseModel):
    id: int
    tenant_id: Optional[int]
    company_name: str
    contact_person: Optional[str]
    email: Optional[str]
    phone: Optional[str]
    address: Optional[str]
    stage: str
    expected_value: Optional[float]
    currency: str
    source: Optional[str]
    expected_close_date: Optional[date]
    probability: Optional[int]
    notes: Optional[str]
    lost_reason: Optional[str]
    assigned_to: Optional[int]
    created_by: Optional[int]
    is_converted: bool
    converted_client_id: Optional[int]
    converted_at: Optional[datetime]
    created_at: Optional[datetime]
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True
