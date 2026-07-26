from pydantic import BaseModel
from typing import Optional
from datetime import datetime, date
from app.models.reminder import ReminderPriority, RecurrenceType, ActionType


class ReminderCreate(BaseModel):
    client_id: Optional[int] = None
    title: str
    description: Optional[str] = None
    due_date: Optional[datetime] = None
    priority: ReminderPriority = ReminderPriority.medium
    recurrence_type: RecurrenceType = RecurrenceType.one_time
    day_of_month: Optional[int] = None
    day_of_week: Optional[int] = None
    action_type: ActionType = ActionType.reminder
    send_whatsapp: bool = False


class ReminderUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    due_date: Optional[datetime] = None
    priority: Optional[ReminderPriority] = None
    is_completed: Optional[bool] = None
    recurrence_type: Optional[RecurrenceType] = None
    day_of_month: Optional[int] = None
    day_of_week: Optional[int] = None
    action_type: Optional[ActionType] = None
    is_active: Optional[bool] = None
    client_id: Optional[int] = None
    send_whatsapp: Optional[bool] = None


class ReminderResponse(BaseModel):
    id: int
    client_id: Optional[int] = None
    client_name: Optional[str] = None
    user_id: int
    title: str
    description: Optional[str] = None
    due_date: datetime
    is_completed: bool
    completed_at: Optional[datetime] = None
    priority: ReminderPriority
    recurrence_type: RecurrenceType
    day_of_month: Optional[int] = None
    day_of_week: Optional[int] = None
    action_type: ActionType
    next_fire_at: Optional[date] = None
    is_active: bool
    send_whatsapp: bool = False
    created_at: datetime

    model_config = {"from_attributes": True}


class NotificationResponse(BaseModel):
    id: int
    reminder_id: Optional[int] = None
    title: str
    body: Optional[str] = None
    client_id: Optional[int] = None
    client_name: Optional[str] = None
    action_type: str
    is_read: bool
    fired_at: datetime

    model_config = {"from_attributes": True}
