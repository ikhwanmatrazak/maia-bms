from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from app.models.reminder import ReminderPriority


class ReminderCreate(BaseModel):
    client_id: Optional[int] = None
    title: str
    description: Optional[str] = None
    due_date: datetime
    priority: ReminderPriority = ReminderPriority.medium


class ReminderUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    due_date: Optional[datetime] = None
    priority: Optional[ReminderPriority] = None
    is_completed: Optional[bool] = None


class ReminderResponse(BaseModel):
    id: int
    client_id: Optional[int]
    user_id: int
    title: str
    description: Optional[str]
    due_date: datetime
    is_completed: bool
    completed_at: Optional[datetime]
    priority: ReminderPriority
    created_at: datetime

    model_config = {"from_attributes": True}
