from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from typing import List, Optional
import io

from pydantic import BaseModel

from app.database import get_db
from app.models.client import Client
from app.models.receipt import Receipt
from app.models.settings import CompanySettings
from app.models.activity import Activity, ActivityType
from app.models.user import User
from app.schemas.document import ReceiptResponse
from app.middleware.auth import get_current_user
from app.middleware.rbac import apply_tenant_filter, get_effective_tenant_id, OwnershipChecker


class EmailRequest(BaseModel):
    to_email: str

router = APIRouter(prefix="/receipts", tags=["receipts"])


@router.get("", response_model=List[ReceiptResponse])
async def list_receipts(
    client_id: Optional[int] = Query(None),
    search: Optional[str] = Query(None),
    month: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from datetime import datetime as _dt, timezone as _tz
    query = select(Receipt).options(selectinload(Receipt.client))
    query = apply_tenant_filter(query, Receipt, current_user)
    query = query.where(Receipt.is_deleted != True)
    if not OwnershipChecker.can_view_all(current_user):
        query = query.where(Receipt.created_by == current_user.id)
    if month:
        y, m_n = int(month.split("-")[0]), int(month.split("-")[1])
        start = _dt(y, m_n, 1, tzinfo=_tz.utc)
        end = _dt(y + 1, 1, 1, tzinfo=_tz.utc) if m_n == 12 else _dt(y, m_n + 1, 1, tzinfo=_tz.utc)
        query = query.where(Receipt.payment_date >= start, Receipt.payment_date < end)
    if client_id:
        query = query.where(Receipt.client_id == client_id)
    if search:
        client_ids_sq = select(Client.id).where(Client.company_name.ilike(f"%{search}%")).scalar_subquery()
        query = query.where(
            Receipt.receipt_number.ilike(f"%{search}%") |
            Receipt.client_id.in_(client_ids_sq)
        )
    query = query.order_by(Receipt.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/summary")
async def receipts_summary_route(
    month: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from decimal import Decimal as _Dec
    from datetime import datetime as _dt, timezone as _tz
    if month:
        y, m = int(month.split("-")[0]), int(month.split("-")[1])
    else:
        now = _dt.now(_tz.utc)
        y, m = now.year, now.month
    start = _dt(y, m, 1, tzinfo=_tz.utc)
    end = _dt(y + 1, 1, 1, tzinfo=_tz.utc) if m == 12 else _dt(y, m + 1, 1, tzinfo=_tz.utc)
    q = select(Receipt).where(Receipt.payment_date >= start, Receipt.payment_date < end)
    q = apply_tenant_filter(q, Receipt, current_user)
    if not OwnershipChecker.can_view_all(current_user):
        q = q.where(Receipt.created_by == current_user.id)
    result = await db.execute(q)
    rows = result.scalars().all()
    return {
        "count": len(rows),
        "total_amount": float(sum(_Dec(str(r.amount)) for r in rows)),
        "month": month or _dt.now(_tz.utc).strftime("%Y-%m"),
    }


@router.get("/{receipt_id}", response_model=ReceiptResponse)
async def get_receipt(
    receipt_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Receipt).where(Receipt.id == receipt_id))
    receipt = result.scalar_one_or_none()
    if not receipt:
        raise HTTPException(status_code=404, detail="Receipt not found")
    eff_tenant = get_effective_tenant_id(current_user)
    if eff_tenant is not None and receipt.tenant_id != eff_tenant:
        raise HTTPException(status_code=403, detail="Access denied")
    return receipt


@router.post("/{receipt_id}/send", response_model=ReceiptResponse)
async def send_receipt(
    receipt_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from datetime import datetime, timezone
    result = await db.execute(select(Receipt).where(Receipt.id == receipt_id))
    receipt = result.scalar_one_or_none()
    if not receipt:
        raise HTTPException(status_code=404, detail="Receipt not found")
    eff_tenant = get_effective_tenant_id(current_user)
    if eff_tenant is not None and receipt.tenant_id != eff_tenant:
        raise HTTPException(status_code=403, detail="Access denied")

    receipt.sent_at = datetime.now(timezone.utc)

    activity = Activity(
        client_id=receipt.client_id,
        user_id=current_user.id,
        type=ActivityType.email,
        description=f"Receipt {receipt.receipt_number} sent to client",
        occurred_at=datetime.now(timezone.utc),
    )
    db.add(activity)
    await db.commit()
    await db.refresh(receipt)
    return receipt


@router.post("/{receipt_id}/email", response_model=ReceiptResponse)
async def email_receipt(
    receipt_id: int,
    body: EmailRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from datetime import datetime, timezone
    from app.services.pdf_service import generate_pdf
    from app.services.email_service import send_email, decrypt_smtp_password, render_template
    from app.models.email_template import EmailTemplate

    result = await db.execute(
        select(Receipt).options(selectinload(Receipt.client)).where(Receipt.id == receipt_id)
    )
    receipt = result.scalar_one_or_none()
    if not receipt:
        raise HTTPException(status_code=404, detail="Receipt not found")
    eff_tenant = get_effective_tenant_id(current_user)
    if eff_tenant is not None and receipt.tenant_id != eff_tenant:
        raise HTTPException(status_code=403, detail="Access denied")

    settings_result = await db.execute(select(CompanySettings).where(CompanySettings.tenant_id == receipt.tenant_id).limit(1))
    company = settings_result.scalar_one_or_none()
    if company is None:
        _fb = await db.execute(select(CompanySettings).limit(1))
        company = _fb.scalar_one_or_none()
    if not company or not company.smtp_host:
        raise HTTPException(status_code=422, detail="SMTP not configured in Settings")
    smtp_password = decrypt_smtp_password(company)
    if not smtp_password:
        raise HTTPException(status_code=422, detail="SMTP password not saved in Settings")

    tmpl_result = await db.execute(select(EmailTemplate).where(EmailTemplate.doc_type == "receipt"))
    tmpl = tmpl_result.scalar_one_or_none()
    subject_tpl = tmpl.subject if tmpl else "Receipt {{receipt_number}} from {{company_name}}"
    body_tpl = tmpl.body if tmpl else "Dear {{client_name}},\n\nPlease find attached receipt {{receipt_number}}.\n\nBest regards,\n{{company_name}}"

    vars_map = {
        "{{company_name}}": company.name or "MAIA",
        "{{client_name}}": receipt.client.company_name if receipt.client else "",
        "{{receipt_number}}": receipt.receipt_number,
        "{{payment_date}}": receipt.payment_date.strftime("%d %b %Y") if receipt.payment_date else "",
        "{{currency}}": receipt.currency,
        "{{amount}}": str(receipt.amount),
    }
    subject = render_template(subject_tpl, vars_map)
    body_text = render_template(body_tpl, vars_map)
    html_body = f"<html><body><pre style='font-family:sans-serif;white-space:pre-wrap'>{body_text}</pre></body></html>"
    pdf_bytes = await generate_pdf("receipt", receipt, company)
    await send_email(company, smtp_password, body.to_email, subject, html_body, pdf_bytes=pdf_bytes, pdf_filename=f"{receipt.receipt_number}.pdf")

    receipt.sent_at = datetime.now(timezone.utc)
    activity = Activity(
        client_id=receipt.client_id,
        user_id=current_user.id,
        type=ActivityType.email,
        description=f"Receipt {receipt.receipt_number} emailed to {body.to_email}",
        occurred_at=datetime.now(timezone.utc),
    )
    db.add(activity)
    await db.commit()
    await db.refresh(receipt)
    return receipt


@router.delete("/{receipt_id}", status_code=204)
async def delete_receipt(
    receipt_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Receipt).where(Receipt.id == receipt_id))
    receipt = result.scalar_one_or_none()
    if not receipt:
        raise HTTPException(status_code=404, detail="Receipt not found")
    eff_tenant = get_effective_tenant_id(current_user)
    if eff_tenant is not None and receipt.tenant_id != eff_tenant:
        raise HTTPException(status_code=403, detail="Access denied")
    receipt.is_deleted = True
    await db.commit()


@router.get("/{receipt_id}/pdf")
async def get_receipt_pdf(
    receipt_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Receipt)
        .options(selectinload(Receipt.client), selectinload(Receipt.payments))
        .where(Receipt.id == receipt_id)
    )
    receipt = result.scalar_one_or_none()
    if not receipt:
        raise HTTPException(status_code=404, detail="Receipt not found")
    eff_tenant = get_effective_tenant_id(current_user)
    if eff_tenant is not None and receipt.tenant_id != eff_tenant:
        raise HTTPException(status_code=403, detail="Access denied")

    from app.services.pdf_service import generate_pdf
    settings_result = await db.execute(select(CompanySettings).where(CompanySettings.tenant_id == receipt.tenant_id).limit(1))
    company = settings_result.scalar_one_or_none()
    if company is None:
        _fb = await db.execute(select(CompanySettings).limit(1))
        company = _fb.scalar_one_or_none()
    pdf_bytes = await generate_pdf("receipt", receipt, company)
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{receipt.receipt_number}.pdf"'},
    )
