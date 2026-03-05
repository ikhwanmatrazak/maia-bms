from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
from datetime import datetime, timezone

from app.database import get_db
from app.models.reminder import Reminder, ReminderPriority
from app.models.user import User
from app.schemas.reminder import ReminderCreate, ReminderUpdate, ReminderResponse
from app.middleware.auth import get_current_user

router = APIRouter(prefix="/reminders", tags=["reminders"])


@router.get("", response_model=List[ReminderResponse])
async def list_reminders(
    filter: Optional[str] = Query(None, description="today|upcoming|overdue|completed"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    now = datetime.now(timezone.utc)
    query = select(Reminder).where(Reminder.user_id == current_user.id)

    if filter == "today":
        from datetime import date
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        today_end = now.replace(hour=23, minute=59, second=59)
        query = query.where(
            Reminder.due_date >= today_start,
            Reminder.due_date <= today_end,
            Reminder.is_completed == False,
        )
    elif filter == "upcoming":
        query = query.where(Reminder.due_date > now, Reminder.is_completed == False)
    elif filter == "overdue":
        query = query.where(Reminder.due_date < now, Reminder.is_completed == False)
    elif filter == "completed":
        query = query.where(Reminder.is_completed == True)
    else:
        query = query.where(Reminder.is_completed == False)

    query = query.order_by(Reminder.due_date)
    result = await db.execute(query)
    return result.scalars().all()


@router.post("", response_model=ReminderResponse, status_code=status.HTTP_201_CREATED)
async def create_reminder(
    body: ReminderCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    reminder = Reminder(
        client_id=body.client_id,
        user_id=current_user.id,
        title=body.title,
        description=body.description,
        due_date=body.due_date,
        priority=body.priority,
    )
    db.add(reminder)
    await db.commit()
    await db.refresh(reminder)
    return reminder


@router.put("/{reminder_id}", response_model=ReminderResponse)
async def update_reminder(
    reminder_id: int,
    body: ReminderUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Reminder).where(Reminder.id == reminder_id, Reminder.user_id == current_user.id)
    )
    reminder = result.scalar_one_or_none()
    if not reminder:
        raise HTTPException(status_code=404, detail="Reminder not found")
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(reminder, key, value)
    await db.commit()
    await db.refresh(reminder)
    return reminder


@router.post("/{reminder_id}/complete", response_model=ReminderResponse)
async def complete_reminder(
    reminder_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Reminder).where(Reminder.id == reminder_id, Reminder.user_id == current_user.id)
    )
    reminder = result.scalar_one_or_none()
    if not reminder:
        raise HTTPException(status_code=404, detail="Reminder not found")
    reminder.is_completed = True
    reminder.completed_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(reminder)
    return reminder
