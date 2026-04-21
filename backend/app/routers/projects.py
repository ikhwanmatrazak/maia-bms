"""Project Management Router"""
import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional, List
from pathlib import Path
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from pydantic import BaseModel

from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.user import User
from app.config import get_settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/projects", tags=["projects"], redirect_slashes=False)

DEFAULT_STAGES = [
    {"name": "Planning",    "color": "#6366f1", "order_index": 0},
    {"name": "In Progress", "color": "#3b82f6", "order_index": 1},
    {"name": "Testing",     "color": "#f59e0b", "order_index": 2},
    {"name": "Review",      "color": "#8b5cf6", "order_index": 3},
    {"name": "Completed",   "color": "#10b981", "order_index": 4},
]

TASK_STATUSES = ["todo", "in_progress", "review", "done"]


# ─── Schemas ─────────────────────────────────────────────────────────────────

class StageOut(BaseModel):
    id: int
    name: str
    color: str
    order_index: int

class ProjectOut(BaseModel):
    id: int
    stage_id: Optional[int]
    stage_name: Optional[str]
    stage_color: Optional[str]
    name: str
    description: Optional[str]
    priority: str
    start_date: Optional[str]
    end_date: Optional[str]
    budget: Optional[float]
    created_by: int
    created_at: str
    member_count: int
    task_count: int
    done_count: int

class TaskOut(BaseModel):
    id: int
    project_id: int
    title: str
    description: Optional[str]
    assignee_id: Optional[int]
    assignee_name: Optional[str]
    status: str
    priority: str
    start_date: Optional[str]
    due_date: Optional[str]
    estimated_hours: Optional[float]
    logged_hours: float
    created_at: str

class MeetingOut(BaseModel):
    id: int
    project_id: Optional[int]
    title: str
    scheduled_at: str
    duration_min: int
    location: Optional[str]
    agenda: Optional[str]
    notes: Optional[str]
    attendee_ids: List[int]
    attendee_names: List[str]
    created_by: int

class UpdateOut(BaseModel):
    id: int
    project_id: int
    user_id: int
    user_name: str
    content: str
    file_url: Optional[str]
    created_at: str

class MilestoneOut(BaseModel):
    id: int
    project_id: int
    title: str
    due_date: Optional[str]
    is_reached: bool

class TimeLogOut(BaseModel):
    id: int
    task_id: int
    user_id: int
    user_name: str
    hours: float
    note: Optional[str]
    logged_date: str


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _require_manager(user: User):
    if user.role not in ("admin", "manager") and not user.is_super_admin:
        raise HTTPException(status_code=403, detail="Managers only")


async def _is_project_member(db: AsyncSession, project_id: int, user_id: int) -> bool:
    r = await db.execute(text(
        "SELECT 1 FROM project_members WHERE project_id=:pid AND user_id=:uid"
    ), {"pid": project_id, "uid": user_id})
    return r.fetchone() is not None


async def _get_smtp(db: AsyncSession, tenant_id: Optional[int]):
    """Fetch company SMTP settings for a tenant."""
    try:
        from app.services.email_service import decrypt_smtp_password
        q = "SELECT * FROM company_settings WHERE 1=1"
        params = {}
        if tenant_id:
            q += " AND tenant_id=:tid"
            params["tid"] = tenant_id
        q += " LIMIT 1"
        r = await db.execute(text(q), params)
        row = r.fetchone()
        if not row:
            return None, None
        smtp_pass = decrypt_smtp_password(row)
        return row, smtp_pass
    except Exception as e:
        logger.warning(f"SMTP fetch error: {e}")
        return None, None


async def _send_meeting_reminder(db: AsyncSession, meeting_id: int, hours_before: int):
    """Send reminder emails to all meeting attendees."""
    try:
        from app.services.email_service import send_email
        r = await db.execute(text("""
            SELECT m.*, p.tenant_id FROM project_meetings m
            LEFT JOIN projects p ON p.id = m.project_id
            WHERE m.id = :mid
        """), {"mid": meeting_id})
        meeting = r.fetchone()
        if not meeting:
            return

        # Get attendee emails
        ar = await db.execute(text("""
            SELECT u.email, u.name FROM project_meeting_attendees a
            JOIN users u ON u.id = a.user_id
            WHERE a.meeting_id = :mid
        """), {"mid": meeting_id})
        attendees = ar.fetchall()
        if not attendees:
            return

        company, smtp_pass = await _get_smtp(db, meeting.tenant_id)
        if not company or not smtp_pass:
            return

        when_str = meeting.scheduled_at.strftime("%A, %d %B %Y at %I:%M %p") if isinstance(meeting.scheduled_at, datetime) else str(meeting.scheduled_at)
        label = "1 hour" if hours_before == 1 else "24 hours"

        for att in attendees:
            html = f"""
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;">
              <div style="background:#1a1a2e;padding:24px;border-radius:12px 12px 0 0;">
                <h2 style="color:#fff;margin:0;">Ali Axis — Meeting Reminder</h2>
              </div>
              <div style="background:#f9fafb;padding:24px;border-radius:0 0 12px 12px;border:1px solid #e5e7eb;">
                <p style="color:#374151;">Hi <strong>{att.name}</strong>,</p>
                <p style="color:#374151;">This is a reminder that you have a meeting starting in <strong>{label}</strong>.</p>
                <div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:16px 0;">
                  <p style="margin:4px 0;color:#111;font-size:18px;font-weight:bold;">{meeting.title}</p>
                  <p style="margin:4px 0;color:#6b7280;">📅 {when_str}</p>
                  <p style="margin:4px 0;color:#6b7280;">⏱ {meeting.duration_min} minutes</p>
                  {f'<p style="margin:4px 0;color:#6b7280;">📍 {meeting.location}</p>' if meeting.location else ''}
                  {f'<p style="margin:8px 0;color:#374151;"><strong>Agenda:</strong><br>{meeting.agenda}</p>' if meeting.agenda else ''}
                </div>
                <p style="color:#9ca3af;font-size:12px;">Ali Axis Business Management System</p>
              </div>
            </div>"""
            await send_email(company, smtp_pass, att.email,
                             f"Reminder: {meeting.title} — in {label}", html)

        # Mark reminder sent
        col = "reminder_1h_sent" if hours_before == 1 else "reminder_24h_sent"
        await db.execute(text(f"UPDATE project_meetings SET {col}=1 WHERE id=:id"), {"id": meeting_id})
        await db.commit()
    except Exception as e:
        logger.warning(f"Meeting reminder error: {e}")


# ─── Background Reminder Loop ─────────────────────────────────────────────────

async def reminder_loop():
    """Run every 30 min, send reminders for upcoming meetings."""
    from app.database import AsyncSessionLocal
    while True:
        try:
            await asyncio.sleep(1800)  # 30 min
            async with AsyncSessionLocal() as db:
                now = datetime.now(timezone.utc)
                # 24h window: meetings between 23h and 25h from now
                r24 = await db.execute(text("""
                    SELECT id FROM project_meetings
                    WHERE reminder_24h_sent=0
                      AND scheduled_at BETWEEN :lo AND :hi
                """), {"lo": now + timedelta(hours=23), "hi": now + timedelta(hours=25)})
                for row in r24.fetchall():
                    await _send_meeting_reminder(db, row.id, 24)

                # 1h window: meetings between 45min and 75min from now
                r1 = await db.execute(text("""
                    SELECT id FROM project_meetings
                    WHERE reminder_1h_sent=0
                      AND scheduled_at BETWEEN :lo AND :hi
                """), {"lo": now + timedelta(minutes=45), "hi": now + timedelta(minutes=75)})
                for row in r1.fetchall():
                    await _send_meeting_reminder(db, row.id, 1)
        except Exception as e:
            logger.warning(f"Reminder loop error: {e}")


# ─── Stages ──────────────────────────────────────────────────────────────────

@router.get("/stages", response_model=List[StageOut])
async def list_stages(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    r = await db.execute(text(
        "SELECT id, name, color, order_index FROM project_stages WHERE tenant_id=:tid ORDER BY order_index"
    ), {"tid": current_user.tenant_id})
    return [StageOut(id=row.id, name=row.name, color=row.color, order_index=row.order_index) for row in r.fetchall()]


@router.post("/stages")
async def create_stage(name: str, color: str = "#6366f1",
                       db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    _require_manager(current_user)
    r = await db.execute(text("SELECT COALESCE(MAX(order_index)+1,0) as nxt FROM project_stages WHERE tenant_id=:tid"), {"tid": current_user.tenant_id})
    nxt = r.fetchone().nxt or 0
    await db.execute(text("INSERT INTO project_stages (tenant_id,name,color,order_index) VALUES (:tid,:name,:color,:oi)"),
                     {"tid": current_user.tenant_id, "name": name, "color": color, "oi": nxt})
    await db.commit()
    return {"message": "Stage created"}


@router.put("/stages/{stage_id}")
async def update_stage(stage_id: int, name: Optional[str] = None, color: Optional[str] = None,
                       db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    _require_manager(current_user)
    if name:
        await db.execute(text("UPDATE project_stages SET name=:n WHERE id=:id AND tenant_id=:tid"), {"n": name, "id": stage_id, "tid": current_user.tenant_id})
    if color:
        await db.execute(text("UPDATE project_stages SET color=:c WHERE id=:id AND tenant_id=:tid"), {"c": color, "id": stage_id, "tid": current_user.tenant_id})
    await db.commit()
    return {"message": "Updated"}


@router.delete("/stages/{stage_id}")
async def delete_stage(stage_id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    _require_manager(current_user)
    await db.execute(text("DELETE FROM project_stages WHERE id=:id AND tenant_id=:tid"), {"id": stage_id, "tid": current_user.tenant_id})
    await db.commit()
    return {"message": "Deleted"}


# ─── Projects ─────────────────────────────────────────────────────────────────

def _proj_row(row) -> ProjectOut:
    return ProjectOut(
        id=row.id, stage_id=row.stage_id, stage_name=row.stage_name, stage_color=row.stage_color,
        name=row.name, description=row.description, priority=row.priority,
        start_date=str(row.start_date) if row.start_date else None,
        end_date=str(row.end_date) if row.end_date else None,
        budget=float(row.budget) if row.budget else None,
        created_by=row.created_by, created_at=str(row.created_at),
        member_count=row.member_count or 0,
        task_count=row.task_count or 0,
        done_count=row.done_count or 0,
    )


PROJECT_SELECT = """
    SELECT p.*,
           s.name AS stage_name, s.color AS stage_color,
           (SELECT COUNT(*) FROM project_members m WHERE m.project_id=p.id) AS member_count,
           (SELECT COUNT(*) FROM project_tasks t WHERE t.project_id=p.id) AS task_count,
           (SELECT COUNT(*) FROM project_tasks t WHERE t.project_id=p.id AND t.status='done') AS done_count
    FROM projects p
    LEFT JOIN project_stages s ON s.id=p.stage_id
"""


@router.get("/dashboard")
async def project_dashboard(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    tid = current_user.tenant_id
    uid = current_user.id
    is_manager = current_user.role in ("admin","manager") or current_user.is_super_admin

    # Projects summary
    proj_filter = "WHERE p.tenant_id=:tid" if is_manager else """
        WHERE p.tenant_id=:tid AND p.id IN (SELECT project_id FROM project_members WHERE user_id=:uid)"""
    params = {"tid": tid, "uid": uid}

    pr = await db.execute(text(f"SELECT COUNT(*) AS c, SUM(CASE WHEN s.name='Completed' THEN 1 ELSE 0 END) AS done FROM projects p LEFT JOIN project_stages s ON s.id=p.stage_id {proj_filter}"), params)
    proj_row = pr.fetchone()

    # My tasks due this week
    due_hi = datetime.now() + timedelta(days=7)
    tr = await db.execute(text("""
        SELECT t.id, t.title, t.status, t.priority, t.due_date, p.name AS project_name
        FROM project_tasks t JOIN projects p ON p.id=t.project_id
        WHERE t.assignee_id=:uid AND t.status != 'done' AND t.due_date <= :due
        ORDER BY t.due_date LIMIT 10
    """), {"uid": uid, "due": due_hi})
    my_tasks = [{"id": r.id, "title": r.title, "status": r.status, "priority": r.priority,
                 "due_date": str(r.due_date) if r.due_date else None, "project_name": r.project_name}
                for r in tr.fetchall()]

    # Upcoming meetings (next 7 days)
    mr = await db.execute(text("""
        SELECT m.id, m.title, m.scheduled_at, m.duration_min, m.location, p.name AS project_name
        FROM project_meetings m LEFT JOIN projects p ON p.id=m.project_id
        WHERE (m.project_id IN (SELECT project_id FROM project_members WHERE user_id=:uid)
               OR m.created_by=:uid OR :is_mgr=1)
          AND m.scheduled_at >= NOW() AND m.scheduled_at <= :hi
        ORDER BY m.scheduled_at LIMIT 5
    """), {"uid": uid, "hi": due_hi, "is_mgr": 1 if is_manager else 0})
    meetings = [{"id": r.id, "title": r.title, "scheduled_at": str(r.scheduled_at),
                 "duration_min": r.duration_min, "location": r.location, "project_name": r.project_name}
                for r in mr.fetchall()]

    # CRM stats (manager only)
    crm = {}
    if is_manager:
        cr = await db.execute(text("SELECT status, COUNT(*) AS c FROM prospects WHERE tenant_id=:tid GROUP BY status"), {"tid": tid})
        crm = {r.status: r.c for r in cr.fetchall()}

    # Sales stats (manager only)
    sales = {}
    if is_manager:
        sr = await db.execute(text("""
            SELECT
              (SELECT COUNT(*) FROM quotations WHERE tenant_id=:tid AND status='draft') AS quotes_draft,
              (SELECT COUNT(*) FROM invoices WHERE tenant_id=:tid AND status='sent') AS invoices_sent,
              (SELECT COALESCE(SUM(total_amount),0) FROM invoices WHERE tenant_id=:tid AND status='sent') AS outstanding
        """), {"tid": tid})
        sr_row = sr.fetchone()
        sales = {"quotes_draft": sr_row.quotes_draft, "invoices_sent": sr_row.invoices_sent, "outstanding": float(sr_row.outstanding)}

    return {
        "projects_total": proj_row.c or 0,
        "projects_completed": proj_row.done or 0,
        "my_tasks": my_tasks,
        "upcoming_meetings": meetings,
        "crm": crm,
        "sales": sales,
    }


@router.get("", response_model=List[ProjectOut])
async def list_projects(
    stage_id: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    is_manager = current_user.role in ("admin","manager") or current_user.is_super_admin
    where = "WHERE p.tenant_id=:tid"
    params: dict = {"tid": current_user.tenant_id}
    if not is_manager:
        where += " AND p.id IN (SELECT project_id FROM project_members WHERE user_id=:uid)"
        params["uid"] = current_user.id
    if stage_id:
        where += " AND p.stage_id=:sid"
        params["sid"] = stage_id
    r = await db.execute(text(f"{PROJECT_SELECT} {where} ORDER BY p.created_at DESC"), params)
    return [_proj_row(row) for row in r.fetchall()]


@router.post("")
async def create_project(
    name: str = Form(...),
    description: str = Form(""),
    stage_id: Optional[int] = Form(None),
    priority: str = Form("medium"),
    start_date: Optional[str] = Form(None),
    end_date: Optional[str] = Form(None),
    budget: Optional[float] = Form(None),
    member_ids: str = Form(""),  # comma-separated
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_manager(current_user)
    r = await db.execute(text("""
        INSERT INTO projects (tenant_id, stage_id, name, description, priority, start_date, end_date, budget, created_by)
        VALUES (:tid,:sid,:name,:desc,:pri,:sd,:ed,:bud,:cb)
    """), {"tid": current_user.tenant_id, "sid": stage_id or None, "name": name, "desc": description,
           "pri": priority, "sd": start_date or None, "ed": end_date or None,
           "bud": budget, "cb": current_user.id})
    await db.commit()
    pid = r.lastrowid
    # Add creator as manager
    await db.execute(text("INSERT INTO project_members (project_id,user_id,role) VALUES (:pid,:uid,'manager')"),
                     {"pid": pid, "uid": current_user.id})
    # Add other members
    if member_ids:
        for mid in member_ids.split(","):
            mid = mid.strip()
            if mid and mid != str(current_user.id):
                await db.execute(text("INSERT INTO project_members (project_id,user_id,role) VALUES (:pid,:uid,'member')"),
                                 {"pid": pid, "uid": int(mid)})
    await db.commit()
    return {"id": pid, "message": "Project created"}


@router.get("/{project_id}", response_model=ProjectOut)
async def get_project(project_id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    r = await db.execute(text(f"{PROJECT_SELECT} WHERE p.id=:pid AND p.tenant_id=:tid"), {"pid": project_id, "tid": current_user.tenant_id})
    row = r.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Project not found")
    return _proj_row(row)


@router.put("/{project_id}")
async def update_project(
    project_id: int, name: Optional[str] = Form(None), description: Optional[str] = Form(None),
    stage_id: Optional[int] = Form(None), priority: Optional[str] = Form(None),
    start_date: Optional[str] = Form(None), end_date: Optional[str] = Form(None),
    budget: Optional[float] = Form(None),
    db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user),
):
    _require_manager(current_user)
    fields = []
    params: dict = {"pid": project_id, "tid": current_user.tenant_id}
    for k, v in [("name", name), ("description", description), ("stage_id", stage_id),
                  ("priority", priority), ("start_date", start_date or None),
                  ("end_date", end_date or None), ("budget", budget)]:
        if v is not None:
            fields.append(f"{k}=:{k}")
            params[k] = v
    if not fields:
        return {"message": "Nothing to update"}
    await db.execute(text(f"UPDATE projects SET {', '.join(fields)} WHERE id=:pid AND tenant_id=:tid"), params)
    await db.commit()
    return {"message": "Updated"}


@router.delete("/{project_id}")
async def delete_project(project_id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    _require_manager(current_user)
    await db.execute(text("DELETE FROM projects WHERE id=:id AND tenant_id=:tid"), {"id": project_id, "tid": current_user.tenant_id})
    await db.commit()
    return {"message": "Deleted"}


# ─── Members ──────────────────────────────────────────────────────────────────

@router.get("/{project_id}/members")
async def list_members(project_id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    r = await db.execute(text("""
        SELECT u.id, u.name, u.email, u.role AS user_role, m.role AS project_role
        FROM project_members m JOIN users u ON u.id=m.user_id
        WHERE m.project_id=:pid
    """), {"pid": project_id})
    return [{"id": row.id, "name": row.name, "email": row.email, "user_role": row.user_role, "project_role": row.project_role}
            for row in r.fetchall()]


@router.post("/{project_id}/members")
async def add_member(project_id: int, user_id: int, role: str = "member",
                     db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    _require_manager(current_user)
    await db.execute(text("""
        INSERT INTO project_members (project_id,user_id,role) VALUES (:pid,:uid,:role)
        ON DUPLICATE KEY UPDATE role=:role
    """), {"pid": project_id, "uid": user_id, "role": role})
    await db.commit()
    return {"message": "Member added"}


@router.delete("/{project_id}/members/{user_id}")
async def remove_member(project_id: int, user_id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    _require_manager(current_user)
    await db.execute(text("DELETE FROM project_members WHERE project_id=:pid AND user_id=:uid"), {"pid": project_id, "uid": user_id})
    await db.commit()
    return {"message": "Removed"}


# ─── Tasks ────────────────────────────────────────────────────────────────────

def _task_row(row) -> TaskOut:
    return TaskOut(
        id=row.id, project_id=row.project_id, title=row.title, description=row.description,
        assignee_id=row.assignee_id, assignee_name=row.assignee_name,
        status=row.status, priority=row.priority,
        start_date=str(row.start_date) if row.start_date else None,
        due_date=str(row.due_date) if row.due_date else None,
        estimated_hours=float(row.estimated_hours) if row.estimated_hours else None,
        logged_hours=float(row.logged_hours) if row.logged_hours else 0,
        created_at=str(row.created_at),
    )


@router.get("/{project_id}/tasks", response_model=List[TaskOut])
async def list_tasks(project_id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    r = await db.execute(text("""
        SELECT t.*, u.name AS assignee_name,
               COALESCE((SELECT SUM(hours) FROM project_time_logs l WHERE l.task_id=t.id),0) AS logged_hours
        FROM project_tasks t LEFT JOIN users u ON u.id=t.assignee_id
        WHERE t.project_id=:pid ORDER BY t.status, t.due_date
    """), {"pid": project_id})
    return [_task_row(row) for row in r.fetchall()]


@router.post("/{project_id}/tasks")
async def create_task(
    project_id: int,
    title: str = Form(...), description: str = Form(""),
    assignee_id: Optional[int] = Form(None), status: str = Form("todo"),
    priority: str = Form("medium"), start_date: Optional[str] = Form(None),
    due_date: Optional[str] = Form(None), estimated_hours: Optional[float] = Form(None),
    db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user),
):
    r = await db.execute(text("""
        INSERT INTO project_tasks (project_id,title,description,assignee_id,status,priority,start_date,due_date,estimated_hours)
        VALUES (:pid,:title,:desc,:aid,:status,:pri,:sd,:dd,:eh)
    """), {"pid": project_id, "title": title, "desc": description, "aid": assignee_id or None,
           "status": status, "pri": priority, "sd": start_date or None, "dd": due_date or None, "eh": estimated_hours})
    await db.commit()
    return {"id": r.lastrowid, "message": "Task created"}


@router.put("/tasks/{task_id}")
async def update_task(
    task_id: int, title: Optional[str] = Form(None), description: Optional[str] = Form(None),
    assignee_id: Optional[int] = Form(None), status: Optional[str] = Form(None),
    priority: Optional[str] = Form(None), start_date: Optional[str] = Form(None),
    due_date: Optional[str] = Form(None), estimated_hours: Optional[float] = Form(None),
    db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user),
):
    fields = []
    params: dict = {"tid": task_id}
    for k, v in [("title", title), ("description", description), ("assignee_id", assignee_id),
                  ("status", status), ("priority", priority),
                  ("start_date", start_date or None), ("due_date", due_date or None),
                  ("estimated_hours", estimated_hours)]:
        if v is not None:
            fields.append(f"{k}=:{k}")
            params[k] = v
    if fields:
        await db.execute(text(f"UPDATE project_tasks SET {', '.join(fields)} WHERE id=:tid"), params)
        await db.commit()
    return {"message": "Updated"}


@router.delete("/tasks/{task_id}")
async def delete_task(task_id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    await db.execute(text("DELETE FROM project_tasks WHERE id=:id"), {"id": task_id})
    await db.commit()
    return {"message": "Deleted"}


# ─── Time Logs ────────────────────────────────────────────────────────────────

@router.post("/tasks/{task_id}/time-logs")
async def log_time(task_id: int, hours: float = Form(...), note: str = Form(""),
                   logged_date: str = Form(...),
                   db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    await db.execute(text("""
        INSERT INTO project_time_logs (task_id,user_id,hours,note,logged_date)
        VALUES (:tid,:uid,:h,:note,:date)
    """), {"tid": task_id, "uid": current_user.id, "h": hours, "note": note, "date": logged_date})
    await db.commit()
    return {"message": "Time logged"}


@router.get("/tasks/{task_id}/time-logs", response_model=List[TimeLogOut])
async def list_time_logs(task_id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    r = await db.execute(text("""
        SELECT l.*, u.name AS user_name FROM project_time_logs l
        JOIN users u ON u.id=l.user_id WHERE l.task_id=:tid ORDER BY l.logged_date DESC
    """), {"tid": task_id})
    return [TimeLogOut(id=row.id, task_id=row.task_id, user_id=row.user_id, user_name=row.user_name,
                       hours=float(row.hours), note=row.note, logged_date=str(row.logged_date))
            for row in r.fetchall()]


# ─── Milestones ───────────────────────────────────────────────────────────────

@router.get("/{project_id}/milestones", response_model=List[MilestoneOut])
async def list_milestones(project_id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    r = await db.execute(text("SELECT * FROM project_milestones WHERE project_id=:pid ORDER BY due_date"), {"pid": project_id})
    return [MilestoneOut(id=row.id, project_id=row.project_id, title=row.title,
                         due_date=str(row.due_date) if row.due_date else None, is_reached=bool(row.is_reached))
            for row in r.fetchall()]


@router.post("/{project_id}/milestones")
async def create_milestone(project_id: int, title: str = Form(...), due_date: Optional[str] = Form(None),
                            db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    _require_manager(current_user)
    await db.execute(text("INSERT INTO project_milestones (project_id,title,due_date) VALUES (:pid,:title,:dd)"),
                     {"pid": project_id, "title": title, "dd": due_date or None})
    await db.commit()
    return {"message": "Milestone created"}


@router.put("/milestones/{milestone_id}")
async def update_milestone(milestone_id: int, title: Optional[str] = Form(None),
                            due_date: Optional[str] = Form(None), is_reached: Optional[bool] = Form(None),
                            db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    fields, params = [], {"mid": milestone_id}
    for k, v in [("title", title), ("due_date", due_date), ("is_reached", is_reached)]:
        if v is not None:
            fields.append(f"{k}=:{k}")
            params[k] = v
    if fields:
        await db.execute(text(f"UPDATE project_milestones SET {', '.join(fields)} WHERE id=:mid"), params)
        await db.commit()
    return {"message": "Updated"}


@router.delete("/milestones/{milestone_id}")
async def delete_milestone(milestone_id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    _require_manager(current_user)
    await db.execute(text("DELETE FROM project_milestones WHERE id=:id"), {"id": milestone_id})
    await db.commit()
    return {"message": "Deleted"}


# ─── Updates ──────────────────────────────────────────────────────────────────

@router.get("/{project_id}/updates", response_model=List[UpdateOut])
async def list_updates(project_id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    r = await db.execute(text("""
        SELECT u2.*, u.name AS user_name FROM project_updates u2
        JOIN users u ON u.id=u2.user_id WHERE u2.project_id=:pid ORDER BY u2.created_at DESC
    """), {"pid": project_id})
    return [UpdateOut(id=row.id, project_id=row.project_id, user_id=row.user_id, user_name=row.user_name,
                      content=row.content, file_url=row.file_url, created_at=str(row.created_at))
            for row in r.fetchall()]


@router.post("/{project_id}/updates")
async def post_update(project_id: int, content: str = Form(...),
                       file: Optional[UploadFile] = File(None),
                       db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    file_url = None
    if file and file.filename:
        path = Path("uploads/project_updates")
        path.mkdir(parents=True, exist_ok=True)
        ext = Path(file.filename).suffix
        fname = f"{uuid.uuid4().hex}{ext}"
        (path / fname).write_bytes(await file.read())
        file_url = f"project_updates/{fname}"
    await db.execute(text("INSERT INTO project_updates (project_id,user_id,content,file_url) VALUES (:pid,:uid,:c,:f)"),
                     {"pid": project_id, "uid": current_user.id, "c": content, "f": file_url})
    await db.commit()
    return {"message": "Update posted"}


# ─── Meetings ─────────────────────────────────────────────────────────────────

@router.get("/{project_id}/meetings", response_model=List[MeetingOut])
async def list_meetings(project_id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    return await _fetch_meetings(db, project_id=project_id)


@router.get("/meetings/upcoming")
async def upcoming_meetings(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    return await _fetch_meetings(db, upcoming_only=True, user_id=current_user.id)


async def _fetch_meetings(db, project_id=None, upcoming_only=False, user_id=None):
    where = "WHERE 1=1"
    params: dict = {}
    if project_id:
        where += " AND m.project_id=:pid"
        params["pid"] = project_id
    if upcoming_only:
        where += " AND m.scheduled_at >= NOW()"
    r = await db.execute(text(f"SELECT m.* FROM project_meetings m {where} ORDER BY m.scheduled_at"), params)
    meetings = r.fetchall()
    out = []
    for m in meetings:
        ar = await db.execute(text("""
            SELECT a.user_id, u.name FROM project_meeting_attendees a
            JOIN users u ON u.id=a.user_id WHERE a.meeting_id=:mid
        """), {"mid": m.id})
        atts = ar.fetchall()
        out.append(MeetingOut(
            id=m.id, project_id=m.project_id, title=m.title,
            scheduled_at=str(m.scheduled_at), duration_min=m.duration_min,
            location=m.location, agenda=m.agenda, notes=m.notes,
            attendee_ids=[a.user_id for a in atts],
            attendee_names=[a.name for a in atts],
            created_by=m.created_by,
        ))
    return out


@router.post("/{project_id}/meetings")
async def schedule_meeting(
    project_id: int,
    title: str = Form(...), scheduled_at: str = Form(...),
    duration_min: int = Form(60), location: str = Form(""),
    agenda: str = Form(""), attendee_ids: str = Form(""),
    db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user),
):
    _require_manager(current_user)
    r = await db.execute(text("""
        INSERT INTO project_meetings (project_id,title,scheduled_at,duration_min,location,agenda,created_by)
        VALUES (:pid,:title,:sat,:dur,:loc,:ag,:cb)
    """), {"pid": project_id, "title": title, "sat": scheduled_at, "dur": duration_min,
           "loc": location or None, "ag": agenda or None, "cb": current_user.id})
    await db.commit()
    mid = r.lastrowid
    ids = [i.strip() for i in attendee_ids.split(",") if i.strip()]
    for uid in ids:
        try:
            await db.execute(text("INSERT IGNORE INTO project_meeting_attendees (meeting_id,user_id) VALUES (:mid,:uid)"),
                             {"mid": mid, "uid": int(uid)})
        except Exception:
            pass
    await db.commit()
    return {"id": mid, "message": "Meeting scheduled"}


@router.put("/meetings/{meeting_id}")
async def update_meeting(meeting_id: int, notes: str = Form(""),
                          db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    await db.execute(text("UPDATE project_meetings SET notes=:notes WHERE id=:id"), {"notes": notes, "id": meeting_id})
    await db.commit()
    return {"message": "Updated"}


@router.delete("/meetings/{meeting_id}")
async def delete_meeting(meeting_id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    _require_manager(current_user)
    await db.execute(text("DELETE FROM project_meetings WHERE id=:id"), {"id": meeting_id})
    await db.commit()
    return {"message": "Deleted"}
