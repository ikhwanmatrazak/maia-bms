from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from app.models.delivery_order import DeliveryOrderStatus


class DeliveryItemCreate(BaseModel):
    description: str
    quantity: float = 1.0
    unit: Optional[str] = "pcs"
    sort_order: int = 0


class DeliveryItemResponse(BaseModel):
    id: int
    description: str
    quantity: float
    unit: Optional[str]
    sort_order: int

    model_config = {"from_attributes": True}


class DeliveryOrderCreate(BaseModel):
    client_id: int
    issue_date: datetime
    delivery_date: Optional[datetime] = None
    delivery_address: Optional[str] = None
    notes: Optional[str] = None
    items: List[DeliveryItemCreate] = []


class DeliveryOrderUpdate(BaseModel):
    client_id: Optional[int] = None
    status: Optional[DeliveryOrderStatus] = None
    issue_date: Optional[datetime] = None
    delivery_date: Optional[datetime] = None
    delivery_address: Optional[str] = None
    notes: Optional[str] = None
    items: Optional[List[DeliveryItemCreate]] = None


class DeliveryOrderResponse(BaseModel):
    id: int
    do_number: str
    client_id: int
    client_name: str = ""
    status: DeliveryOrderStatus
    issue_date: datetime
    delivery_date: Optional[datetime]
    delivery_address: Optional[str]
    notes: Optional[str]
    created_by: Optional[int]
    sent_at: Optional[datetime]
    delivered_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime
    items: List[DeliveryItemResponse] = []

    model_config = {"from_attributes": True}
