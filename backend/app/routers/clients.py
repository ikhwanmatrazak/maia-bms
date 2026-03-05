from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import List, Optional

from app.database import get_db
from app.models.client import Client, ClientStatus
from app.models.activity import Activity, ActivityType
from app.models.reminder import Reminder
from app.models.user import User, UserRole
from app.schemas.client import ClientCreate, ClientUpdate, ClientResponse, ClientListResponse
from app.schemas.activity import ActivityCreate, ActivityResponse
from app.schemas.reminder import ReminderCreate, ReminderResponse
from app.middleware.auth import get_current_user
from app.middleware.rbac import require_admin, require_admin_or_manager, OwnershipChecker
from datetime import datetime, timezone

router = APIRouter(prefix="/clients", tags=["clients"])


@router.get("", response_model=List[ClientListResponse])
async def list_clients(
    search: Optional[str] = Query(None),
    status: Optional[ClientStatus] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = select(Client)
    if search:
        query = query.where(
            Client.company_name.ilike(f"%{search}%") |
            Client.contact_person.ilike(f"%{search}%") |
            Client.email.ilike(f"%{search}%")
        )
    if status:
        query = query.where(Client.status == status)
    query = query.order_by(Client.company_name).offset(skip).limit(limit)
    result = await db.execute(query)
    return result.scalars().all()


@router.post("", response_model=ClientResponse, status_code=status.HTTP_201_CREATED)
async def create_client(
    body: ClientCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_manager()),
):
    client = Client(**body.model_dump(), created_by=current_user.id)
    db.add(client)
    await db.commit()
    await db.refresh(client)
    return client


@router.get("/{client_id}", response_model=ClientResponse)
async def get_client(
    client_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Client).where(Client.id == client_id))
    client = result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    return client


@router.put("/{client_id}", response_model=ClientResponse)
async def update_client(
    client_id: int,
    body: ClientUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_manager()),
):
    result = await db.execute(select(Client).where(Client.id == client_id))
    client = result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(client, key, value)
    await db.commit()
    await db.refresh(client)
    return client


@router.delete("/{client_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_client(
    client_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin()),
):
    result = await db.execute(select(Client).where(Client.id == client_id))
    client = result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    await db.delete(client)
    await db.commit()


@router.get("/{client_id}/activities", response_model=List[ActivityResponse])
async def list_activities(
    client_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Activity)
        .where(Activity.client_id == client_id)
        .order_by(Activity.occurred_at.desc())
    )
    return result.scalars().all()


@router.post("/{client_id}/activities", response_model=ActivityResponse, status_code=status.HTTP_201_CREATED)
async def create_activity(
    client_id: int,
    body: ActivityCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Client).where(Client.id == client_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Client not found")

    activity = Activity(
        client_id=client_id,
        user_id=current_user.id,
        type=body.type,
        description=body.description,
        occurred_at=body.occurred_at or datetime.now(timezone.utc),
    )
    db.add(activity)
    await db.commit()
    await db.refresh(activity)
    return activity


@router.get("/{client_id}/reminders", response_model=List[ReminderResponse])
async def list_client_reminders(
    client_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Reminder)
        .where(Reminder.client_id == client_id)
        .order_by(Reminder.due_date)
    )
    return result.scalars().all()


@router.post("/{client_id}/reminders", response_model=ReminderResponse, status_code=status.HTTP_201_CREATED)
async def create_client_reminder(
    client_id: int,
    body: ReminderCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Client).where(Client.id == client_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Client not found")

    reminder = Reminder(
        client_id=client_id,
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
