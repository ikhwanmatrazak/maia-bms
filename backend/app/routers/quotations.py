from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from typing import List, Optional
from decimal import Decimal
from pydantic import BaseModel
import io

from app.database import get_db
from app.models.client import Client
from app.models.quotation import Quotation, QuotationItem, QuotationStatus
from app.models.invoice import Invoice, InvoiceItem, InvoiceStatus
from app.models.settings import TaxRate, CompanySettings, EmailTemplate
from app.models.activity import Activity, ActivityType
from app.models.reminder import Reminder, ReminderPriority
from app.models.user import User
from app.schemas.document import QuotationCreate, QuotationUpdate, QuotationResponse
from app.middleware.auth import get_current_user
from app.middleware.rbac import require_admin_or_manager, OwnershipChecker, apply_tenant_filter, get_effective_tenant_id
from app.utils.tax import calculate_line_total, calculate_document_totals
from app.services.email_service import decrypt_smtp_password, render_template, send_email
from datetime import datetime, timezone


class EmailRequest(BaseModel):
    to_email: str


async def _email_quotation(quotation, to_email: str, db):
    from app.services.pdf_service import generate_pdf
    from app.routers.tracking import create_tracking
    settings_result = await db.execute(select(CompanySettings).where(CompanySettings.tenant_id == quotation.tenant_id).limit(1))
    company = settings_result.scalar_one_or_none()
    if company is None:
        _fb = await db.execute(select(CompanySettings).limit(1))
        company = _fb.scalar_one_or_none()
    if not company or not company.smtp_host:
        raise ValueError("SMTP not configured in Settings")
    smtp_password = decrypt_smtp_password(company)
    if not smtp_password:
        raise ValueError("SMTP password not saved in Settings")

    tmpl_result = await db.execute(select(EmailTemplate).where(EmailTemplate.doc_type == "quotation"))
    tmpl = tmpl_result.scalar_one_or_none()
    subject_tpl = tmpl.subject if tmpl else "Quotation {{quotation_number}} from {{company_name}}"
    body_tpl = tmpl.body if tmpl else "Dear {{client_name}},\n\nPlease find attached quotation {{quotation_number}}.\n\nBest regards,\n{{company_name}}"

    vars_map = {
        "{{company_name}}": company.name or "MAIA",
        "{{client_name}}": quotation.client.company_name if quotation.client else "",
        "{{quotation_number}}": quotation.quotation_number,
        "{{issue_date}}": quotation.issue_date.strftime("%d %b %Y") if quotation.issue_date else "",
        "{{expiry_date}}": quotation.expiry_date.strftime("%d %b %Y") if quotation.expiry_date else "",
        "{{currency}}": quotation.currency,
        "{{total}}": str(quotation.total),
    }
    subject = render_template(subject_tpl, vars_map)
    body_text = render_template(body_tpl, vars_map)

    # Create email tracking pixel
    try:
        token = await create_tracking(db, "quotation", quotation.id, to_email, quotation.tenant_id)
        import os as _os
        pixel_url = f"{_os.environ.get('BACKEND_URL', 'http://localhost:8000').rstrip('/')}/api/v1/track/{token}.gif"
        tracking_pixel = f'<img src="{pixel_url}" width="1" height="1" style="display:none" alt="">'
    except Exception:
        tracking_pixel = ""

    html_body = f"<html><body><pre style='font-family:sans-serif;white-space:pre-wrap'>{body_text}</pre>{tracking_pixel}</body></html>"
    pdf_bytes = await generate_pdf("quotation", quotation, company, "professional")
    await send_email(company, smtp_password, to_email, subject, html_body, pdf_bytes=pdf_bytes, pdf_filename=f"{quotation.quotation_number}.pdf")

router = APIRouter(prefix="/quotations", tags=["quotations"])


async def _generate_quotation_number(db: AsyncSession, tenant_id=None) -> str:
    result = await db.execute(select(CompanySettings).where(CompanySettings.tenant_id == tenant_id).limit(1))
    settings = result.scalar_one_or_none()
    if settings is None:
        result = await db.execute(select(CompanySettings).limit(1))
        settings = result.scalar_one_or_none()
    prefix = (settings.quotation_prefix if settings else None) or "QT"
    year = datetime.now().year
    count_result = await db.execute(select(func.count(Quotation.id)))
    count = (count_result.scalar() or 0) + 1
    return f"{prefix}-{year}-{count:04d}"


async def _build_items(db: AsyncSession, items_data, doc_id: int, model_cls, id_field: str):
    items = []
    for i, item_data in enumerate(items_data):
        tax_rate_val = None
        if item_data.tax_rate_id:
            tr = await db.execute(select(TaxRate).where(TaxRate.id == item_data.tax_rate_id))
            tr_obj = tr.scalar_one_or_none()
            if tr_obj:
                tax_rate_val = Decimal(str(tr_obj.rate))

        calcs = calculate_line_total(item_data.quantity, item_data.unit_price, tax_rate_val)
        item = model_cls(
            **{id_field: doc_id},
            description=item_data.description,
            quantity=item_data.quantity,
            unit_price=item_data.unit_price,
            tax_rate_id=item_data.tax_rate_id,
            tax_amount=calcs["tax_amount"],
            line_total=calcs["line_total"],
            sort_order=item_data.sort_order if item_data.sort_order else i,
        )
        items.append(item)
    return items


@router.get("", response_model=List[QuotationResponse])
async def list_quotations(
    status: Optional[QuotationStatus] = Query(None),
    client_id: Optional[int] = Query(None),
    search: Optional[str] = Query(None),
    month: Optional[str] = Query(None),
    user_id: Optional[int] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = select(Quotation).options(selectinload(Quotation.items), selectinload(Quotation.client))
    query = apply_tenant_filter(query, Quotation, current_user)
    query = query.where(Quotation.is_deleted != True)
    if not OwnershipChecker.can_view_all(current_user):
        query = query.where(Quotation.created_by == current_user.id)
    elif user_id:
        query = query.where(Quotation.created_by == user_id)
    if month:
        start, end = _month_range_q(month)
        query = query.where(Quotation.issue_date >= start, Quotation.issue_date < end)
    if status:
        query = query.where(Quotation.status == status)
    if client_id:
        query = query.where(Quotation.client_id == client_id)
    if search:
        client_ids_sq = select(Client.id).where(Client.company_name.ilike(f"%{search}%")).scalar_subquery()
        query = query.where(
            Quotation.quotation_number.ilike(f"%{search}%") |
            Quotation.client_id.in_(client_ids_sq)
        )
    query = query.order_by(Quotation.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(query)
    return result.scalars().all()


@router.post("", response_model=QuotationResponse, status_code=status.HTTP_201_CREATED)
async def create_quotation(
    body: QuotationCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    number = await _generate_quotation_number(db, current_user.tenant_id)
    quotation = Quotation(
        quotation_number=number,
        client_id=body.client_id,
        currency=body.currency,
        exchange_rate=body.exchange_rate,
        issue_date=body.issue_date,
        expiry_date=body.expiry_date,
        discount_amount=body.discount_amount,
        subject=body.subject,
        notes=body.notes,
        terms_conditions=body.terms_conditions,
        payment_terms=body.payment_terms,
        template_id=body.template_id,
        created_by=current_user.id,
        tenant_id=current_user.tenant_id,
    )
    db.add(quotation)
    await db.flush()

    items_data = []
    for i, item_data in enumerate(body.items):
        tax_rate_val = None
        if item_data.tax_rate_id:
            tr = await db.execute(select(TaxRate).where(TaxRate.id == item_data.tax_rate_id))
            tr_obj = tr.scalar_one_or_none()
            if tr_obj:
                tax_rate_val = Decimal(str(tr_obj.rate))
        calcs = calculate_line_total(item_data.quantity, item_data.unit_price, tax_rate_val)
        items_data.append({
            "subtotal": calcs["subtotal"],
            "tax_amount": calcs["tax_amount"],
        })
        item = QuotationItem(
            quotation_id=quotation.id,
            description=item_data.description,
            quantity=item_data.quantity,
            unit_price=item_data.unit_price,
            tax_rate_id=item_data.tax_rate_id,
            tax_amount=calcs["tax_amount"],
            line_total=calcs["line_total"],
            sort_order=i,
        )
        db.add(item)

    totals = calculate_document_totals(items_data, body.discount_amount)
    quotation.subtotal = totals["subtotal"]
    quotation.tax_total = totals["tax_total"]
    quotation.total = totals["total"]

    await db.commit()
    result = await db.execute(
        select(Quotation).options(selectinload(Quotation.items), selectinload(Quotation.client)).where(Quotation.id == quotation.id)
    )
    return result.scalar_one()


def _month_range_q(month):
    from datetime import timezone as tz
    if month:
        y, m = int(month.split("-")[0]), int(month.split("-")[1])
    else:
        now = datetime.now(timezone.utc)
        y, m = now.year, now.month
    start = datetime(y, m, 1, tzinfo=tz.utc)
    end = datetime(y + 1, 1, 1, tzinfo=tz.utc) if m == 12 else datetime(y, m + 1, 1, tzinfo=tz.utc)
    return start, end


@router.get("/summary")
async def quotations_summary_route(
    month: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    start, end = _month_range_q(month)
    q = select(Quotation).where(Quotation.issue_date >= start, Quotation.issue_date < end)
    q = apply_tenant_filter(q, Quotation, current_user)
    result = await db.execute(q)
    rows = result.scalars().all()
    by_status = {}
    for r in rows:
        k = r.status.value
        by_status[k] = by_status.get(k, 0) + 1
    return {
        "count": len(rows),
        "total_value": float(sum(Decimal(str(r.total)) for r in rows)),
        "by_status": by_status,
        "month": month or datetime.now(timezone.utc).strftime("%Y-%m"),
    }


@router.get("/{quotation_id}", response_model=QuotationResponse)
async def get_quotation(
    quotation_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Quotation).options(selectinload(Quotation.items), selectinload(Quotation.client)).where(Quotation.id == quotation_id)
    )
    quotation = result.scalar_one_or_none()
    if not quotation:
        raise HTTPException(status_code=404, detail="Quotation not found")
    eff_tenant = get_effective_tenant_id(current_user)
    if eff_tenant is not None and quotation.tenant_id != eff_tenant:
        raise HTTPException(status_code=403, detail="Access denied")
    if not OwnershipChecker.can_edit(current_user, quotation.created_by):
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    return quotation


@router.put("/{quotation_id}", response_model=QuotationResponse)
async def update_quotation(
    quotation_id: int,
    body: QuotationUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Quotation).options(selectinload(Quotation.items), selectinload(Quotation.client)).where(Quotation.id == quotation_id)
    )
    quotation = result.scalar_one_or_none()
    if not quotation:
        raise HTTPException(status_code=404, detail="Quotation not found")
    eff_tenant = get_effective_tenant_id(current_user)
    if eff_tenant is not None and quotation.tenant_id != eff_tenant:
        raise HTTPException(status_code=403, detail="Access denied")
    if not OwnershipChecker.can_edit(current_user, quotation.created_by):
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    update_data = body.model_dump(exclude_unset=True, exclude={"items"})
    for key, value in update_data.items():
        setattr(quotation, key, value)

    if body.items is not None:
        for item in quotation.items:
            await db.delete(item)
        items_data = []
        for i, item_data in enumerate(body.items):
            tax_rate_val = None
            if item_data.tax_rate_id:
                tr = await db.execute(select(TaxRate).where(TaxRate.id == item_data.tax_rate_id))
                tr_obj = tr.scalar_one_or_none()
                if tr_obj:
                    tax_rate_val = Decimal(str(tr_obj.rate))
            calcs = calculate_line_total(item_data.quantity, item_data.unit_price, tax_rate_val)
            items_data.append({"subtotal": calcs["subtotal"], "tax_amount": calcs["tax_amount"]})
            db.add(QuotationItem(
                quotation_id=quotation.id,
                description=item_data.description,
                quantity=item_data.quantity,
                unit_price=item_data.unit_price,
                tax_rate_id=item_data.tax_rate_id,
                tax_amount=calcs["tax_amount"],
                line_total=calcs["line_total"],
                sort_order=i,
            ))
        disc = body.discount_amount or quotation.discount_amount
        totals = calculate_document_totals(items_data, disc)
        quotation.subtotal = totals["subtotal"]
        quotation.tax_total = totals["tax_total"]
        quotation.total = totals["total"]

    await db.commit()
    result = await db.execute(
        select(Quotation).options(selectinload(Quotation.items), selectinload(Quotation.client)).where(Quotation.id == quotation_id)
    )
    return result.scalar_one()


@router.post("/{quotation_id}/send", response_model=QuotationResponse)
async def send_quotation(
    quotation_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Quotation).options(selectinload(Quotation.items), selectinload(Quotation.client)).where(Quotation.id == quotation_id)
    )
    quotation = result.scalar_one_or_none()
    if not quotation:
        raise HTTPException(status_code=404, detail="Quotation not found")
    eff_tenant = get_effective_tenant_id(current_user)
    if eff_tenant is not None and quotation.tenant_id != eff_tenant:
        raise HTTPException(status_code=403, detail="Access denied")

    quotation.status = QuotationStatus.sent
    quotation.sent_at = datetime.now(timezone.utc)

    activity = Activity(
        client_id=quotation.client_id,
        user_id=current_user.id,
        type=ActivityType.quote_sent,
        description=f"Quotation {quotation.quotation_number} sent to client",
        occurred_at=datetime.now(timezone.utc),
    )
    db.add(activity)
    await db.commit()
    result = await db.execute(
        select(Quotation).options(selectinload(Quotation.items), selectinload(Quotation.client)).where(Quotation.id == quotation_id)
    )
    quotation = result.scalar_one()

    # Auto-email if client has an email address configured
    client_email = quotation.client.email if quotation.client else None
    if client_email:
        try:
            await _email_quotation(quotation, client_email, db)
        except Exception as e:
            import logging
            logging.getLogger(__name__).error(f"Auto-email quotation {quotation_id} failed: {e}")

    return quotation


@router.post("/{quotation_id}/email")
async def email_quotation(
    quotation_id: int,
    body: EmailRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from datetime import timedelta
    result = await db.execute(
        select(Quotation).options(selectinload(Quotation.items), selectinload(Quotation.client)).where(Quotation.id == quotation_id)
    )
    quotation = result.scalar_one_or_none()
    if not quotation:
        raise HTTPException(status_code=404, detail="Quotation not found")
    eff_tenant = get_effective_tenant_id(current_user)
    if eff_tenant is not None and quotation.tenant_id != eff_tenant:
        raise HTTPException(status_code=403, detail="Access denied")
    try:
        await _email_quotation(quotation, body.to_email, db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to send email: {str(e)}")

    # Auto-create follow-up reminder 3 days later
    try:
        client_name = quotation.client.company_name if quotation.client else "client"
        reminder = Reminder(
            client_id=quotation.client_id,
            user_id=current_user.id,
            tenant_id=eff_tenant,
            title=f"Follow up on quotation {quotation.quotation_number}",
            description=f"Follow up on quotation {quotation.quotation_number} sent to {client_name}",
            due_date=datetime.now(timezone.utc) + timedelta(days=3),
            priority=ReminderPriority.medium,
        )
        db.add(reminder)
        await db.commit()
    except Exception:
        pass  # Non-critical — don't fail the email send

    return {"message": f"Email sent to {body.to_email}"}


@router.post("/{quotation_id}/convert", response_model=dict)
async def convert_to_invoice(
    quotation_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Quotation).options(selectinload(Quotation.items), selectinload(Quotation.client)).where(Quotation.id == quotation_id)
    )
    quotation = result.scalar_one_or_none()
    if not quotation:
        raise HTTPException(status_code=404, detail="Quotation not found")
    eff_tenant = get_effective_tenant_id(current_user)
    if eff_tenant is not None and quotation.tenant_id != eff_tenant:
        raise HTTPException(status_code=403, detail="Access denied")
    if quotation.status not in (QuotationStatus.sent, QuotationStatus.accepted):
        raise HTTPException(status_code=400, detail="Only sent or accepted quotations can be converted")

    # Generate invoice number
    settings_result = await db.execute(select(CompanySettings).where(CompanySettings.tenant_id == quotation.tenant_id).limit(1))
    settings = settings_result.scalar_one_or_none()
    prefix = settings.invoice_prefix if settings else "INV"
    year = datetime.now().year
    count_result = await db.execute(select(func.count(Invoice.id)))
    count = (count_result.scalar() or 0) + 1
    invoice_number = f"{prefix}-{year}-{count:04d}"

    from app.config import get_settings
    app_settings = get_settings()
    payment_terms = settings.default_payment_terms if settings else 30

    from datetime import timedelta
    due_date = datetime.now(timezone.utc) + timedelta(days=payment_terms)

    invoice = Invoice(
        invoice_number=invoice_number,
        quotation_id=quotation.id,
        client_id=quotation.client_id,
        currency=quotation.currency,
        exchange_rate=quotation.exchange_rate,
        issue_date=datetime.now(timezone.utc),
        due_date=due_date,
        subtotal=quotation.subtotal,
        discount_amount=quotation.discount_amount,
        tax_total=quotation.tax_total,
        total=quotation.total,
        balance_due=quotation.total,
        subject=quotation.subject,
        notes=quotation.notes,
        terms_conditions=quotation.terms_conditions,
        template_id=quotation.template_id,
        created_by=current_user.id,
        tenant_id=quotation.tenant_id,
    )
    db.add(invoice)
    await db.flush()

    for q_item in quotation.items:
        db.add(InvoiceItem(
            invoice_id=invoice.id,
            description=q_item.description,
            quantity=q_item.quantity,
            unit_price=q_item.unit_price,
            tax_rate_id=q_item.tax_rate_id,
            tax_amount=q_item.tax_amount,
            line_total=q_item.line_total,
            sort_order=q_item.sort_order,
        ))

    quotation.status = QuotationStatus.accepted
    quotation.accepted_at = datetime.now(timezone.utc)
    await db.commit()
    return {"invoice_id": invoice.id, "invoice_number": invoice_number}


@router.get("/{quotation_id}/email-tracking")
async def get_quotation_email_tracking(
    quotation_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.models.email_tracking import EmailTracking
    result = await db.execute(
        select(EmailTracking)
        .where(EmailTracking.doc_type == "quotation", EmailTracking.doc_id == quotation_id)
        .order_by(EmailTracking.sent_at.desc())
        .limit(1)
    )
    tracking = result.scalar_one_or_none()
    if not tracking:
        return {"sent": False}
    return {
        "sent": True,
        "sent_at": tracking.sent_at,
        "opened": tracking.opened_at is not None,
        "opened_at": tracking.opened_at,
        "open_count": tracking.open_count,
        "recipient_email": tracking.recipient_email,
    }


@router.get("/{quotation_id}/pdf")
async def get_quotation_pdf(
    quotation_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Quotation)
        .options(selectinload(Quotation.items), selectinload(Quotation.client))
        .where(Quotation.id == quotation_id)
    )
    quotation = result.scalar_one_or_none()
    if not quotation:
        raise HTTPException(status_code=404, detail="Quotation not found")
    eff_tenant = get_effective_tenant_id(current_user)
    if eff_tenant is not None and quotation.tenant_id != eff_tenant:
        raise HTTPException(status_code=403, detail="Access denied")

    from app.services.pdf_service import generate_pdf
    import json as _json
    settings_result = await db.execute(select(CompanySettings).where(CompanySettings.tenant_id == quotation.tenant_id).limit(1))
    company = settings_result.scalar_one_or_none()
    if company is None:
        _fb = await db.execute(select(CompanySettings).limit(1))
        company = _fb.scalar_one_or_none()
    template_style = "professional"
    if quotation.template_id:
        from app.models.settings import DocumentTemplate
        tmpl_result = await db.execute(select(DocumentTemplate).where(DocumentTemplate.id == quotation.template_id))
        tmpl = tmpl_result.scalar_one_or_none()
        if tmpl and tmpl.template_json:
            try:
                template_style = _json.loads(tmpl.template_json).get("style", "professional")
            except Exception:
                pass
    pdf_bytes = await generate_pdf("quotation", quotation, company, template_style)
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{quotation.quotation_number}.pdf"'},
    )


@router.post("/{quotation_id}/duplicate", response_model=QuotationResponse, status_code=status.HTTP_201_CREATED)
async def duplicate_quotation(
    quotation_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Quotation).options(selectinload(Quotation.items), selectinload(Quotation.client)).where(Quotation.id == quotation_id)
    )
    original = result.scalar_one_or_none()
    if not original:
        raise HTTPException(status_code=404, detail="Quotation not found")
    eff_tenant = get_effective_tenant_id(current_user)
    if eff_tenant is not None and original.tenant_id != eff_tenant:
        raise HTTPException(status_code=403, detail="Access denied")

    number = await _generate_quotation_number(db, current_user.tenant_id)
    new_q = Quotation(
        quotation_number=number,
        client_id=original.client_id,
        currency=original.currency,
        exchange_rate=original.exchange_rate,
        issue_date=datetime.now(timezone.utc),
        expiry_date=original.expiry_date,
        discount_amount=original.discount_amount,
        subtotal=original.subtotal,
        tax_total=original.tax_total,
        total=original.total,
        subject=original.subject,
        notes=original.notes,
        terms_conditions=original.terms_conditions,
        payment_terms=original.payment_terms,
        template_id=original.template_id,
        created_by=current_user.id,
        tenant_id=current_user.tenant_id,
    )
    db.add(new_q)
    await db.flush()

    for item in original.items:
        db.add(QuotationItem(
            quotation_id=new_q.id,
            description=item.description,
            quantity=item.quantity,
            unit_price=item.unit_price,
            tax_rate_id=item.tax_rate_id,
            tax_amount=item.tax_amount,
            line_total=item.line_total,
            sort_order=item.sort_order,
        ))

    await db.commit()
    result = await db.execute(
        select(Quotation).options(selectinload(Quotation.items), selectinload(Quotation.client)).where(Quotation.id == new_q.id)
    )
    return result.scalar_one()


@router.delete("/{quotation_id}", status_code=204)
async def delete_quotation(
    quotation_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Quotation).where(Quotation.id == quotation_id))
    quotation = result.scalar_one_or_none()
    if not quotation:
        raise HTTPException(status_code=404, detail="Quotation not found")
    eff_tenant = get_effective_tenant_id(current_user)
    if eff_tenant is not None and quotation.tenant_id != eff_tenant:
        raise HTTPException(status_code=403, detail="Access denied")
    if not OwnershipChecker.can_edit(current_user, quotation.created_by):
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    quotation.is_deleted = True
    await db.commit()
