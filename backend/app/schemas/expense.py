from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from decimal import Decimal


class ExpenseCategoryCreate(BaseModel):
    name: str
    color: str = "#6366f1"


class ExpenseCategoryResponse(BaseModel):
    id: int
    name: str
    color: str
    is_active: bool

    model_config = {"from_attributes": True}


class ExpenseCreate(BaseModel):
    category_id: Optional[int] = None
    category: Optional[str] = None
    description: str
    amount: Decimal
    currency: str = "MYR"
    exchange_rate: Decimal = Decimal("1.0")
    expense_date: datetime
    vendor: Optional[str] = None
    notes: Optional[str] = None


class ExpenseUpdate(BaseModel):
    category_id: Optional[int] = None
    category: Optional[str] = None
    description: Optional[str] = None
    amount: Optional[Decimal] = None
    currency: Optional[str] = None
    exchange_rate: Optional[Decimal] = None
    expense_date: Optional[datetime] = None
    vendor: Optional[str] = None
    notes: Optional[str] = None


class ExpenseResponse(BaseModel):
    id: int
    category_id: Optional[int]
    category: Optional[str]
    description: str
    amount: Decimal
    currency: str
    exchange_rate: Decimal
    expense_date: datetime
    vendor: Optional[str]
    receipt_url: Optional[str]
    notes: Optional[str]
    created_by: Optional[int]
    created_at: datetime

    model_config = {"from_attributes": True}
