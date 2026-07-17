import asyncio
import logging
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import joinedload
from typing import List, Optional
from datetime import datetime, timezone, date, timedelta
import calendar as cal_module

from app.database import get_db
from app.models.reminder import Reminder, ReminderPriority, RecurrenceType, ActionType, ReminderNotification
from app.models.user import User
from app.schemas.reminder import ReminderCreate, ReminderUpdate, ReminderResponse, NotificationResponse
from app.middleware.auth import get_current_user

router = APIRouter(prefix="/reminders", tags=["reminders"])
logger = logging.getLogger(__name__)


def _compute_next_fire(recurrence_type: RecurrenceType, day_of_month: Optional[int],
                       day_of_week: Optional[int], due_date: datetime, from_date: date) -> Optional[date]:
    if recurrence_type == RecurrenceType.one_time:
        return due_date.date() if due_date else from_date

    elif recurrence_type == RecurrenceType.weekly:
        dow = day_of_week if day_of_week is not None else 0
        candidate = from_date + timedelta(days=1)
        for _ in range(8):
            if candidate.weekday() == dow:
                return candidate
            candidate += timedelta(days=1)
        return candidate

    elif recurrence_type == RecurrenceType.monthly:
        dom = day_of_month or 1
        y, m = from_date.year, from_date.month
        for _ in range(13):
            last_day = cal_module.monthrange(y, m)[1]
            d = min(dom, last_day)
            candidate = date(y, m, d)
            if candidate > from_date:
                return candidate
            m += 1
            if m > 12:
                m = 1
                y += 1
        return None

    elif recurrence_type == RecurrenceType.quarterly:
        dom = day_of_month or 1
        y, m = from_date.year, from_date.month
        for _ in range(5):
            last_day = cal_module.monthrange(y, m)[1]
            d = min(dom, last_day)
            candidate = date(y, m, d)
            if candidate > from_date:
                return candidate
            m += 3
            if m > 12:
                m -= 12
                y += 1
        return None

    elif recurrence_type == RecurrenceType.yearly:
        dom = day_of_month or (due_date.day if due_date else 1)
        ref_month = due_date.month if due_date else 1
        y = from_date.year
        for _ in range(3):
            last_day = cal_module.monthrange(y, ref_month)[1]
            d = min(dom, last_day)
            candidate = date(y, ref_month, d)
            if candidate > from_date:
                return candidate
            y += 1
        return None

    return None


def _advance_next_fire(recurrence_type: RecurrenceType, day_of_month: Optional[int],
                       day_of_week: Optional[int], due_date: datetime, current_fire: date) -> Optional[date]:
    if recurrence_type == RecurrenceType.one_time:
        return None

    elif recurrence_type == RecurrenceType.weekly:
        return current_fire + timedelta(days=7)

    elif recurrence_type == RecurrenceType.monthly:
        dom = day_of_month or 1
        m = current_fire.month + 1
        y = current_fire.year
        if m > 12:
            m = 1
            y += 1
        last_day = cal_module.monthrange(y, m)[1]
        return date(y, m, min(dom, last_day))

    elif recurrence_type == RecurrenceType.quarterly:
        dom = day_of_month or 1
        m = current_fire.month + 3
        y = current_fire.year
        if m > 12:
            m -= 12
            y += 1
        last_day = cal_module.monthrange(y, m)[1]
        return date(y, m, min(dom, last_day))

    elif recurrence_type == RecurrenceType.yearly:
        dom = day_of_month or (due_date.day if due_date else 1)
        ref_month = due_date.month if due_date else 1
        y = current_fire.year + 1
        last_day = cal_module.monthrange(y, ref_month)[1]
        return date(y, ref_month, min(dom, last_day))

    return None


# ─── CRUD ────────────────────────────────────────────────────────────────────

@router.get("", response_model=List[ReminderResponse])
async def list_reminders(
    filter: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    now = datetime.now(timezone.utc)
    query = (
        select(Reminder)
        .options(joinedload(Reminder.client))
        .where(Reminder.user_id == current_user.id)
    )

    if filter == "today":
        today = date.today()
        query = query.where(
            Reminder.next_fire_at == today,
            Reminder.is_active == True,
            Reminder.is_completed == False,
        )
    elif filter == "upcoming":
        today = date.today()
        query = query.where(
            Reminder.next_fire_at > today,
            Reminder.is_active == True,
            Reminder.is_completed == False,
        )
    elif filter == "overdue":
        today = date.today()
        query = query.where(
            Reminder.next_fire_at < today,
            Reminder.is_active == True,
            Reminder.is_completed == False,
        )
    elif filter == "completed":
        query = query.where(Reminder.is_completed == True)
    else:
        query = query.where(Reminder.is_active == True, Reminder.is_completed == False)

    query = query.order_by(Reminder.next_fire_at.asc().nulls_last())
    result = await db.execute(query)
    rows = result.scalars().all()

    out = []
    for r in rows:
        d = ReminderResponse.model_validate(r)
        d = d.model_copy(update={"client_name": r.client.company_name if r.client else None})
        out.append(d)
    return out


@router.post("", response_model=ReminderResponse, status_code=status.HTTP_201_CREATED)
async def create_reminder(
    body: ReminderCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    due = body.due_date or datetime.now(timezone.utc)
    today = date.today()
    next_fire = _compute_next_fire(body.recurrence_type, body.day_of_month, body.day_of_week, due, today - timedelta(days=1))

    reminder = Reminder(
        tenant_id=current_user.tenant_id,
        client_id=body.client_id,
        user_id=current_user.id,
        title=body.title,
        description=body.description,
        due_date=due,
        priority=body.priority,
        recurrence_type=body.recurrence_type,
        day_of_month=body.day_of_month,
        day_of_week=body.day_of_week,
        action_type=body.action_type,
        next_fire_at=next_fire,
        is_active=True,
    )
    db.add(reminder)
    await db.commit()
    await db.refresh(reminder)

    # Load client for response
    if reminder.client_id:
        await db.refresh(reminder, ["client"])

    d = ReminderResponse.model_validate(reminder)
    client_name = reminder.client.company_name if reminder.client else None
    return d.model_copy(update={"client_name": client_name})


@router.put("/{reminder_id}", response_model=ReminderResponse)
async def update_reminder(
    reminder_id: int,
    body: ReminderUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Reminder)
        .options(joinedload(Reminder.client))
        .where(Reminder.id == reminder_id, Reminder.user_id == current_user.id)
    )
    reminder = result.scalar_one_or_none()
    if not reminder:
        raise HTTPException(status_code=404, detail="Reminder not found")

    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(reminder, key, value)

    # Recompute next_fire_at if recurrence params changed
    today = date.today()
    reminder.next_fire_at = _compute_next_fire(
        reminder.recurrence_type, reminder.day_of_month,
        reminder.day_of_week, reminder.due_date, today - timedelta(days=1)
    )

    await db.commit()
    await db.refresh(reminder)
    if reminder.client_id:
        await db.refresh(reminder, ["client"])

    d = ReminderResponse.model_validate(reminder)
    client_name = reminder.client.company_name if reminder.client else None
    return d.model_copy(update={"client_name": client_name})


@router.delete("/{reminder_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_reminder(
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
    await db.delete(reminder)
    await db.commit()


@router.post("/{reminder_id}/complete", response_model=ReminderResponse)
async def complete_reminder(
    reminder_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Reminder)
        .options(joinedload(Reminder.client))
        .where(Reminder.id == reminder_id, Reminder.user_id == current_user.id)
    )
    reminder = result.scalar_one_or_none()
    if not reminder:
        raise HTTPException(status_code=404, detail="Reminder not found")
    reminder.is_completed = True
    reminder.completed_at = datetime.now(timezone.utc)
    reminder.is_active = False
    await db.commit()
    await db.refresh(reminder)

    d = ReminderResponse.model_validate(reminder)
    client_name = reminder.client.company_name if reminder.client else None
    return d.model_copy(update={"client_name": client_name})


# ─── Notifications ────────────────────────────────────────────────────────────

@router.get("/notifications", response_model=List[NotificationResponse])
async def list_notifications(
    unread_only: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = select(ReminderNotification).where(ReminderNotification.user_id == current_user.id)
    if unread_only:
        query = query.where(ReminderNotification.is_read == False)
    query = query.order_by(ReminderNotification.fired_at.desc()).limit(30)
    result = await db.execute(query)
    return result.scalars().all()


@router.post("/notifications/{notif_id}/read")
async def mark_notification_read(
    notif_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ReminderNotification).where(
            ReminderNotification.id == notif_id,
            ReminderNotification.user_id == current_user.id,
        )
    )
    notif = result.scalar_one_or_none()
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")
    notif.is_read = True
    await db.commit()
    return {"ok": True}


@router.post("/notifications/read-all")
async def mark_all_notifications_read(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ReminderNotification).where(
            ReminderNotification.user_id == current_user.id,
            ReminderNotification.is_read == False,
        )
    )
    for notif in result.scalars().all():
        notif.is_read = True
    await db.commit()
    return {"ok": True}


# ─── Background loop ──────────────────────────────────────────────────────────

async def _fire_due_reminders():
    from app.database import AsyncSessionLocal
    from app.models.settings import CompanySettings
    from app.services.email_service import decrypt_smtp_password, send_email

    today = date.today()
    try:
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(Reminder)
                .options(joinedload(Reminder.client), joinedload(Reminder.user))
                .where(
                    Reminder.is_active == True,
                    Reminder.is_completed == False,
                    Reminder.next_fire_at <= today,
                )
            )
            due = result.scalars().all()
            if not due:
                return

            for reminder in due:
                client_name = reminder.client.company_name if reminder.client else None

                # Create in-app notification
                notif = ReminderNotification(
                    reminder_id=reminder.id,
                    tenant_id=reminder.tenant_id,
                    user_id=reminder.user_id,
                    title=reminder.title,
                    body=reminder.description,
                    client_id=reminder.client_id,
                    client_name=client_name,
                    action_type=reminder.action_type or "reminder",
                )
                db.add(notif)

                # Send email
                try:
                    settings_result = await db.execute(
                        select(CompanySettings).where(CompanySettings.tenant_id == reminder.tenant_id).limit(1)
                    )
                    company = settings_result.scalar_one_or_none()
                    smtp_password = decrypt_smtp_password(company) if company else None

                    if company and smtp_password and reminder.user and reminder.user.email:
                        action_hint = ""
                        if reminder.action_type == ActionType.create_invoice and client_name:
                            action_hint = f"<p>Action required: Create invoice for <strong>{client_name}</strong>.</p>"

                        html = f"""
<div style="font-family:sans-serif;max-width:500px">
  <h2 style="color:#006FEE">Reminder: {reminder.title}</h2>
  {f'<p>Client: <strong>{client_name}</strong></p>' if client_name else ''}
  {f'<p>{reminder.description}</p>' if reminder.description else ''}
  {action_hint}
  <p style="color:#888;font-size:12px">This is an automated reminder from MAIA BMS.</p>
</div>
"""
                        await send_email(
                            company, smtp_password,
                            reminder.user.email,
                            f"Reminder: {reminder.title}",
                            html,
                        )
                        notif.email_sent = True
                except Exception as email_err:
                    logger.warning(f"Reminder email failed for id={reminder.id}: {email_err}")

                # Advance or complete
                if reminder.recurrence_type == RecurrenceType.one_time:
                    reminder.is_completed = True
                    reminder.completed_at = datetime.now(timezone.utc)
                    reminder.is_active = False
                else:
                    reminder.next_fire_at = _advance_next_fire(
                        reminder.recurrence_type, reminder.day_of_month,
                        reminder.day_of_week, reminder.due_date, today
                    )

            await db.commit()
            logger.info(f"Reminder loop fired {len(due)} reminder(s) for {today}")
    except Exception as e:
        logger.warning(f"Reminder daily loop error: {e}")


async def reminder_daily_loop():
    # Run immediately on startup to catch any missed reminders
    await asyncio.sleep(30)
    await _fire_due_reminders()
    while True:
        # Then check every 6 hours
        await asyncio.sleep(6 * 3600)
        await _fire_due_reminders()
