from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from app.models.activity import ActivityType


class ActivityCreate(BaseModel):
    type: ActivityType
    description: str
    occurred_at: Optional[datetime] = None


class ActivityResponse(BaseModel):
    id: int
    client_id: int
    user_id: Optional[int]
    type: ActivityType
    description: str
    occurred_at: datetime
    created_at: datetime

    model_config = {"from_attributes": True}
