from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text
from typing import Optional, List
from pydantic import BaseModel
from datetime import datetime

from app.database import get_db
from app.models.user import User
from app.middleware.auth import get_current_user
from app.middleware.rbac import require_admin, apply_tenant_filter

router = APIRouter(prefix="/bug-reports", tags=["bug-reports"])


class BugReportCreate(BaseModel):
    title: str
    description: str
    steps: Optional[str] = None
    page_url: Optional[str] = None
    severity: str = "medium"


class BugReportUpdate(BaseModel):
    status: Optional[str] = None
    admin_notes: Optional[str] = None
    severity: Optional[str] = None


class BugReportResponse(BaseModel):
    id: int
    title: str
    description: str
    steps: Optional[str] = None
    page_url: Optional[str] = None
    severity: str
    status: str
    admin_notes: Optional[str] = None
    reported_by_name: str
    reported_by_email: str
    tenant_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime


@router.post("", response_model=BugReportResponse, status_code=201)
async def create_bug_report(
    body: BugReportCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(text(
        """INSERT INTO bug_reports
           (tenant_id, title, description, steps, page_url, severity, status,
            reported_by_id, reported_by_name, reported_by_email)
           VALUES (:tid, :title, :desc, :steps, :url, :sev, 'open',
                   :uid, :uname, :uemail)"""
    ), {
        "tid": current_user.tenant_id,
        "title": body.title,
        "desc": body.description,
        "steps": body.steps,
        "url": body.page_url,
        "sev": body.severity,
        "uid": current_user.id,
        "uname": current_user.name,
        "uemail": current_user.email,
    })
    await db.commit()
    bug_id = result.lastrowid
    return await _get_bug(db, bug_id)


@router.get("", response_model=List[BugReportResponse])
async def list_bug_reports(
    status: Optional[str] = None,
    severity: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_admin(current_user)
    where = ["1=1"]
    params: dict = {}
    if not current_user.is_super_admin and current_user.tenant_id is not None:
        where.append("tenant_id = :tid")
        params["tid"] = current_user.tenant_id
    if status:
        where.append("status = :status")
        params["status"] = status
    if severity:
        where.append("severity = :severity")
        params["severity"] = severity
    sql = f"SELECT * FROM bug_reports WHERE {' AND '.join(where)} ORDER BY created_at DESC"
    result = await db.execute(text(sql), params)
    rows = result.mappings().all()
    return [_row_to_response(r) for r in rows]


@router.put("/{bug_id}", response_model=BugReportResponse)
async def update_bug_report(
    bug_id: int,
    body: BugReportUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_admin(current_user)
    sets = []
    params: dict = {"bug_id": bug_id}
    if body.status is not None:
        sets.append("status = :status")
        params["status"] = body.status
    if body.admin_notes is not None:
        sets.append("admin_notes = :admin_notes")
        params["admin_notes"] = body.admin_notes
    if body.severity is not None:
        sets.append("severity = :severity")
        params["severity"] = body.severity
    if not sets:
        return await _get_bug(db, bug_id)
    await db.execute(text(f"UPDATE bug_reports SET {', '.join(sets)} WHERE id = :bug_id"), params)
    await db.commit()
    return await _get_bug(db, bug_id)


@router.delete("/{bug_id}", status_code=204)
async def delete_bug_report(
    bug_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_admin(current_user)
    await db.execute(text("DELETE FROM bug_reports WHERE id = :id"), {"id": bug_id})
    await db.commit()


async def _get_bug(db: AsyncSession, bug_id: int) -> BugReportResponse:
    result = await db.execute(text("SELECT * FROM bug_reports WHERE id = :id"), {"id": bug_id})
    row = result.mappings().one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Bug report not found")
    return _row_to_response(row)


def _row_to_response(r) -> BugReportResponse:
    return BugReportResponse(
        id=r["id"],
        title=r["title"],
        description=r["description"],
        steps=r["steps"],
        page_url=r["page_url"],
        severity=r["severity"],
        status=r["status"],
        admin_notes=r["admin_notes"],
        reported_by_name=r["reported_by_name"],
        reported_by_email=r["reported_by_email"],
        tenant_id=r["tenant_id"],
        created_at=r["created_at"],
        updated_at=r["updated_at"],
    )
