from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class ContactCreate(BaseModel):
    name: str
    role: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    is_primary: bool = False


class ContactUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    is_primary: Optional[bool] = None


class ContactResponse(BaseModel):
    id: int
    client_id: int
    name: str
    role: Optional[str]
    email: Optional[str]
    phone: Optional[str]
    is_primary: bool
    created_at: datetime
    model_config = {"from_attributes": True}
