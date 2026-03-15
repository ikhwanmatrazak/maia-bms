from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete
from sqlalchemy.orm import selectinload
from typing import List, Optional
from decimal import Decimal
from pydantic import BaseModel
import io
from datetime import datetime, timezone

from app.database import get_db
from app.models.client import Client
from app.models.invoice import Invoice, InvoiceItem, InvoiceStatus
from app.models.receipt import Receipt, PaymentMethod
from app.models.payment import Payment
from app.models.settings import TaxRate, CompanySettings, EmailTemplate
from app.models.activity import Activity, ActivityType
from app.models.user import User
from app.schemas.document import InvoiceCreate, InvoiceUpdate, InvoiceResponse, PaymentCreate, PaymentResponse
from app.middleware.auth import get_current_user
from app.middleware.rbac import OwnershipChecker, apply_tenant_filter, get_effective_tenant_id
from app.utils.tax import calculate_line_total, calculate_document_totals
from app.services.email_service import decrypt_smtp_password, render_template, send_email


class EmailRequest(BaseModel):
    to_email: str


async def _email_invoice(invoice, to_email: str, db):
    from app.services.pdf_service import generate_pdf
    settings_result = await db.execute(select(CompanySettings).where(CompanySettings.tenant_id == invoice.tenant_id).limit(1))
    company = settings_result.scalar_one_or_none()
    if company is None:
        _fb = await db.execute(select(CompanySettings).limit(1))
        company = _fb.scalar_one_or_none()
    if not company or not company.smtp_host:
        raise ValueError("SMTP not configured in Settings")
    smtp_password = decrypt_smtp_password(company)
    if not smtp_password:
        raise ValueError("SMTP password not saved in Settings")

    tmpl_result = await db.execute(select(EmailTemplate).where(EmailTemplate.doc_type == "invoice"))
    tmpl = tmpl_result.scalar_one_or_none()
    subject_tpl = tmpl.subject if tmpl else "Invoice {{invoice_number}} from {{company_name}}"
    body_tpl = tmpl.body if tmpl else "Dear {{client_name}},\n\nPlease find attached invoice {{invoice_number}}.\n\nBest regards,\n{{company_name}}"

    vars_map = {
        "{{company_name}}": company.name or "MAIA",
        "{{client_name}}": invoice.client.company_name if invoice.client else "",
        "{{invoice_number}}": invoice.invoice_number,
        "{{issue_date}}": invoice.issue_date.strftime("%d %b %Y") if invoice.issue_date else "",
        "{{due_date}}": invoice.due_date.strftime("%d %b %Y") if invoice.due_date else "",
        "{{currency}}": invoice.currency,
        "{{total}}": str(invoice.total),
        "{{balance_due}}": str(invoice.balance_due),
    }
    subject = render_template(subject_tpl, vars_map)
    body_text = render_template(body_tpl, vars_map)
    html_body = f"<html><body><pre style='font-family:sans-serif;white-space:pre-wrap'>{body_text}</pre></body></html>"
    pdf_bytes = await generate_pdf("invoice", invoice, company, "professional")
    await send_email(company, smtp_password, to_email, subject, html_body, pdf_bytes=pdf_bytes, pdf_filename=f"{invoice.invoice_number}.pdf")

router = APIRouter(prefix="/invoices", tags=["invoices"])


async def _generate_invoice_number(db: AsyncSession, tenant_id=None) -> str:
    result = await db.execute(select(CompanySettings).where(CompanySettings.tenant_id == tenant_id).limit(1))
    settings = result.scalar_one_or_none()
    if settings is None:
        result = await db.execute(select(CompanySettings).limit(1))
        settings = result.scalar_one_or_none()
    prefix = (settings.invoice_prefix if settings else None) or "INV"
    year = datetime.now().year
    count_result = await db.execute(select(func.count(Invoice.id)))
    count = (count_result.scalar() or 0) + 1
    return f"{prefix}-{year}-{count:04d}"


@router.get("", response_model=List[InvoiceResponse])
async def list_invoices(
    status: Optional[InvoiceStatus] = Query(None),
    client_id: Optional[int] = Query(None),
    search: Optional[str] = Query(None),
    month: Optional[str] = Query(None),
    user_id: Optional[int] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = select(Invoice).options(selectinload(Invoice.items), selectinload(Invoice.client))
    query = apply_tenant_filter(query, Invoice, current_user)
    query = query.where(Invoice.is_deleted != True)
    if not OwnershipChecker.can_view_all(current_user):
        query = query.where(Invoice.created_by == current_user.id)
    elif user_id:
        query = query.where(Invoice.created_by == user_id)
    if month:
        start, end = _month_range_inv(month)
        query = query.where(Invoice.issue_date >= start, Invoice.issue_date < end)
    if status:
        query = query.where(Invoice.status == status)
    if client_id:
        query = query.where(Invoice.client_id == client_id)
    if search:
        client_ids_sq = select(Client.id).where(Client.company_name.ilike(f"%{search}%")).scalar_subquery()
        query = query.where(
            Invoice.invoice_number.ilike(f"%{search}%") |
            Invoice.client_id.in_(client_ids_sq)
        )
    query = query.order_by(Invoice.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(query)
    return result.scalars().all()


@router.post("", response_model=InvoiceResponse, status_code=status.HTTP_201_CREATED)
async def create_invoice(
    body: InvoiceCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    number = await _generate_invoice_number(db, current_user.tenant_id)
    invoice = Invoice(
        invoice_number=number,
        client_id=body.client_id,
        quotation_id=body.quotation_id,
        currency=body.currency,
        exchange_rate=body.exchange_rate,
        issue_date=body.issue_date,
        due_date=body.due_date,
        discount_amount=body.discount_amount,
        notes=body.notes,
        terms_conditions=body.terms_conditions,
        payment_terms=body.payment_terms,
        template_id=body.template_id,
        created_by=current_user.id,
        tenant_id=current_user.tenant_id,
    )
    db.add(invoice)
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
        items_data.append({"subtotal": calcs["subtotal"], "tax_amount": calcs["tax_amount"]})
        db.add(InvoiceItem(
            invoice_id=invoice.id,
            description=item_data.description,
            quantity=item_data.quantity,
            unit_price=item_data.unit_price,
            tax_rate_id=item_data.tax_rate_id,
            tax_amount=calcs["tax_amount"],
            line_total=calcs["line_total"],
            sort_order=i,
        ))

    totals = calculate_document_totals(items_data, body.discount_amount)
    invoice.subtotal = totals["subtotal"]
    invoice.tax_total = totals["tax_total"]
    invoice.total = totals["total"]
    invoice.balance_due = totals["total"]

    await db.commit()
    result = await db.execute(
        select(Invoice).options(selectinload(Invoice.items), selectinload(Invoice.client)).where(Invoice.id == invoice.id)
    )
    return result.scalar_one()


def _month_range_inv(month):
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
async def invoices_summary_route(
    month: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    start, end = _month_range_inv(month)
    q = select(Invoice).where(Invoice.issue_date >= start, Invoice.issue_date < end, Invoice.is_deleted != True)
    q = apply_tenant_filter(q, Invoice, current_user)
    result = await db.execute(q)
    rows = result.scalars().all()
    by_status = {}
    for r in rows:
        k = r.status.value
        by_status[k] = by_status.get(k, 0) + 1
    total_billed = sum(Decimal(str(r.total or 0)) for r in rows)
    total_paid = sum(Decimal(str(r.amount_paid or 0)) for r in rows)
    total_outstanding = sum(Decimal(str(r.balance_due or 0)) for r in rows)
    return {
        "count": len(rows),
        "total_billed": float(total_billed),
        "total_paid": float(total_paid),
        "total_outstanding": float(total_outstanding),
        "by_status": by_status,
        "month": month or datetime.now(timezone.utc).strftime("%Y-%m"),
    }


@router.get("/{invoice_id}", response_model=InvoiceResponse)
async def get_invoice(
    invoice_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Invoice).options(selectinload(Invoice.items), selectinload(Invoice.client)).where(Invoice.id == invoice_id)
    )
    invoice = result.scalar_one_or_none()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    eff_tenant = get_effective_tenant_id(current_user)
    if eff_tenant is not None and invoice.tenant_id != eff_tenant:
        raise HTTPException(status_code=403, detail="Access denied")
    return invoice


@router.put("/{invoice_id}", response_model=InvoiceResponse)
async def update_invoice(
    invoice_id: int,
    body: InvoiceUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Invoice).options(selectinload(Invoice.items), selectinload(Invoice.client)).where(Invoice.id == invoice_id)
    )
    invoice = result.scalar_one_or_none()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    eff_tenant = get_effective_tenant_id(current_user)
    if eff_tenant is not None and invoice.tenant_id != eff_tenant:
        raise HTTPException(status_code=403, detail="Access denied")
    if not OwnershipChecker.can_edit(current_user, invoice.created_by):
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    update_data = body.model_dump(exclude_unset=True, exclude={"items"})
    for key, value in update_data.items():
        setattr(invoice, key, value)

    if body.items is not None:
        for item in invoice.items:
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
            db.add(InvoiceItem(
                invoice_id=invoice.id,
                description=item_data.description,
                quantity=item_data.quantity,
                unit_price=item_data.unit_price,
                tax_rate_id=item_data.tax_rate_id,
                tax_amount=calcs["tax_amount"],
                line_total=calcs["line_total"],
                sort_order=i,
            ))
        disc = body.discount_amount or invoice.discount_amount
        totals = calculate_document_totals(items_data, disc)
        invoice.subtotal = totals["subtotal"]
        invoice.tax_total = totals["tax_total"]
        invoice.total = totals["total"]
        invoice.balance_due = invoice.total - invoice.amount_paid

    await db.commit()
    result = await db.execute(
        select(Invoice).options(selectinload(Invoice.items), selectinload(Invoice.client)).where(Invoice.id == invoice_id)
    )
    return result.scalar_one()


@router.post("/{invoice_id}/send", response_model=InvoiceResponse)
async def send_invoice(
    invoice_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Invoice).options(selectinload(Invoice.items)).where(Invoice.id == invoice_id)
    )
    invoice = result.scalar_one_or_none()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    eff_tenant = get_effective_tenant_id(current_user)
    if eff_tenant is not None and invoice.tenant_id != eff_tenant:
        raise HTTPException(status_code=403, detail="Access denied")

    invoice.status = InvoiceStatus.sent
    invoice.sent_at = datetime.now(timezone.utc)

    activity = Activity(
        client_id=invoice.client_id,
        user_id=current_user.id,
        type=ActivityType.invoice_sent,
        description=f"Invoice {invoice.invoice_number} sent to client",
        occurred_at=datetime.now(timezone.utc),
    )
    db.add(activity)
    await db.commit()
    result = await db.execute(
        select(Invoice).options(selectinload(Invoice.items), selectinload(Invoice.client)).where(Invoice.id == invoice_id)
    )
    invoice = result.scalar_one()

    # Auto-email if client has an email address configured
    client_email = invoice.client.email if invoice.client else None
    if client_email:
        try:
            await _email_invoice(invoice, client_email, db)
        except Exception as e:
            import logging
            logging.getLogger(__name__).error(f"Auto-email invoice {invoice_id} failed: {e}")

    return invoice


@router.post("/{invoice_id}/email")
async def email_invoice(
    invoice_id: int,
    body: EmailRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Invoice).options(selectinload(Invoice.items), selectinload(Invoice.client)).where(Invoice.id == invoice_id)
    )
    invoice = result.scalar_one_or_none()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    eff_tenant = get_effective_tenant_id(current_user)
    if eff_tenant is not None and invoice.tenant_id != eff_tenant:
        raise HTTPException(status_code=403, detail="Access denied")
    try:
        await _email_invoice(invoice, body.to_email, db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to send email: {str(e)}")
    return {"message": f"Email sent to {body.to_email}"}


@router.post("/{invoice_id}/cancel", response_model=InvoiceResponse)
async def cancel_invoice(
    invoice_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Invoice).options(selectinload(Invoice.items)).where(Invoice.id == invoice_id)
    )
    invoice = result.scalar_one_or_none()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    eff_tenant = get_effective_tenant_id(current_user)
    if eff_tenant is not None and invoice.tenant_id != eff_tenant:
        raise HTTPException(status_code=403, detail="Access denied")
    if invoice.status == InvoiceStatus.paid:
        raise HTTPException(status_code=400, detail="Cannot cancel a paid invoice")

    invoice.status = InvoiceStatus.cancelled
    await db.execute(delete(Payment).where(Payment.invoice_id == invoice_id))
    await db.commit()
    result = await db.execute(
        select(Invoice).options(selectinload(Invoice.items), selectinload(Invoice.client)).where(Invoice.id == invoice_id)
    )
    return result.scalar_one()


@router.post("/{invoice_id}/payments", response_model=PaymentResponse, status_code=status.HTTP_201_CREATED)
async def record_payment(
    invoice_id: int,
    body: PaymentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Invoice).options(selectinload(Invoice.items)).where(Invoice.id == invoice_id)
    )
    invoice = result.scalar_one_or_none()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    eff_tenant = get_effective_tenant_id(current_user)
    if eff_tenant is not None and invoice.tenant_id != eff_tenant:
        raise HTTPException(status_code=403, detail="Access denied")
    if invoice.status == InvoiceStatus.cancelled:
        raise HTTPException(status_code=400, detail="Cannot record payment for cancelled invoice")
    if invoice.status == InvoiceStatus.paid:
        raise HTTPException(status_code=400, detail="Invoice is already fully paid")

    payment = Payment(
        invoice_id=invoice_id,
        amount=body.amount,
        currency=body.currency,
        payment_date=body.payment_date,
        payment_method=body.payment_method,
        reference_number=body.reference_number,
        notes=body.notes,
        recorded_by=current_user.id,
    )
    db.add(payment)
    await db.flush()

    invoice.amount_paid = Decimal(str(invoice.amount_paid)) + body.amount
    invoice.balance_due = Decimal(str(invoice.total)) - invoice.amount_paid

    receipt_id = None
    if invoice.balance_due <= 0:
        invoice.balance_due = Decimal("0.00")
        invoice.status = InvoiceStatus.paid
        invoice.paid_at = datetime.now(timezone.utc)

        if body.generate_receipt:
            settings_result = await db.execute(select(CompanySettings).where(CompanySettings.tenant_id == invoice.tenant_id).limit(1))
            settings = settings_result.scalar_one_or_none()
            if settings is None:
                settings_result = await db.execute(select(CompanySettings).limit(1))
                settings = settings_result.scalar_one_or_none()
            prefix = settings.receipt_prefix if settings else "RCP"
            year = datetime.now().year
            count_result = await db.execute(select(func.count(Receipt.id)))
            count = (count_result.scalar() or 0) + 1
            receipt_number = f"{prefix}-{year}-{count:04d}"

            receipt = Receipt(
                receipt_number=receipt_number,
                invoice_id=invoice_id,
                client_id=invoice.client_id,
                currency=invoice.currency,
                exchange_rate=invoice.exchange_rate,
                amount=body.amount,
                payment_method=body.payment_method,
                payment_date=body.payment_date,
                notes=body.notes,
                created_by=current_user.id,
            )
            db.add(receipt)
            await db.flush()
            payment.receipt_id = receipt.id
            receipt_id = receipt.id
    else:
        invoice.status = InvoiceStatus.partial

    activity = Activity(
        client_id=invoice.client_id,
        user_id=current_user.id,
        type=ActivityType.payment_received,
        description=f"Payment of {body.currency} {body.amount} recorded for invoice {invoice.invoice_number}",
        occurred_at=datetime.now(timezone.utc),
    )
    db.add(activity)
    await db.commit()
    payment_result = await db.execute(
        select(Payment).options(
            selectinload(Payment.invoice).selectinload(Invoice.client)
        ).where(Payment.id == payment.id)
    )
    return payment_result.scalar_one()


@router.get("/{invoice_id}/payments", response_model=List[PaymentResponse])
async def list_payments(
    invoice_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    inv_result = await db.execute(select(Invoice).where(Invoice.id == invoice_id))
    invoice = inv_result.scalar_one_or_none()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    eff_tenant = get_effective_tenant_id(current_user)
    if eff_tenant is not None and invoice.tenant_id != eff_tenant:
        raise HTTPException(status_code=403, detail="Access denied")
    result = await db.execute(
        select(Payment).options(
            selectinload(Payment.invoice).selectinload(Invoice.client)
        ).where(Payment.invoice_id == invoice_id).order_by(Payment.payment_date)
    )
    return result.scalars().all()


@router.post("/{invoice_id}/generate-receipt", status_code=status.HTTP_201_CREATED)
async def generate_receipt(
    invoice_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a receipt for a paid invoice (e.g. when one wasn't auto-generated)."""
    result = await db.execute(
        select(Invoice).options(selectinload(Invoice.items), selectinload(Invoice.client)).where(Invoice.id == invoice_id)
    )
    invoice = result.scalar_one_or_none()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    eff_tenant = get_effective_tenant_id(current_user)
    if eff_tenant is not None and invoice.tenant_id != eff_tenant:
        raise HTTPException(status_code=403, detail="Access denied")
    if invoice.status != InvoiceStatus.paid:
        raise HTTPException(status_code=400, detail="Receipt can only be generated for paid invoices")

    settings_result = await db.execute(select(CompanySettings).where(CompanySettings.tenant_id == invoice.tenant_id).limit(1))
    settings = settings_result.scalar_one_or_none()
    if settings is None:
        settings_result = await db.execute(select(CompanySettings).limit(1))
        settings = settings_result.scalar_one_or_none()
    prefix = settings.receipt_prefix if settings else "RCP"
    year = datetime.now().year
    count_result = await db.execute(select(func.count(Receipt.id)))
    count = (count_result.scalar() or 0) + 1
    receipt_number = f"{prefix}-{year}-{count:04d}"

    # Find most recent payment method
    pay_result = await db.execute(
        select(Payment).where(Payment.invoice_id == invoice_id).order_by(Payment.payment_date.desc()).limit(1)
    )
    last_payment = pay_result.scalar_one_or_none()
    payment_method = last_payment.payment_method if last_payment else PaymentMethod.bank_transfer
    payment_date = last_payment.payment_date if last_payment else invoice.paid_at or datetime.now(timezone.utc)

    receipt = Receipt(
        receipt_number=receipt_number,
        invoice_id=invoice_id,
        client_id=invoice.client_id,
        currency=invoice.currency,
        exchange_rate=invoice.exchange_rate,
        amount=invoice.amount_paid,
        payment_method=payment_method,
        payment_date=payment_date,
        created_by=current_user.id,
        tenant_id=invoice.tenant_id,
    )
    db.add(receipt)
    await db.flush()
    # Link the receipt back to the most recent payment so the frontend can detect it
    if last_payment:
        last_payment.receipt_id = receipt.id
    await db.commit()
    return {"receipt_id": receipt.id}


@router.post("/{invoice_id}/duplicate", response_model=InvoiceResponse, status_code=status.HTTP_201_CREATED)
async def duplicate_invoice(
    invoice_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Invoice).options(selectinload(Invoice.items), selectinload(Invoice.client)).where(Invoice.id == invoice_id)
    )
    original = result.scalar_one_or_none()
    if not original:
        raise HTTPException(status_code=404, detail="Invoice not found")
    eff_tenant = get_effective_tenant_id(current_user)
    if eff_tenant is not None and original.tenant_id != eff_tenant:
        raise HTTPException(status_code=403, detail="Access denied")

    number = await _generate_invoice_number(db, current_user.tenant_id)
    new_inv = Invoice(
        invoice_number=number,
        client_id=original.client_id,
        currency=original.currency,
        exchange_rate=original.exchange_rate,
        issue_date=datetime.now(timezone.utc),
        due_date=original.due_date,
        discount_amount=original.discount_amount,
        subtotal=original.subtotal,
        tax_total=original.tax_total,
        total=original.total,
        balance_due=original.total,
        notes=original.notes,
        terms_conditions=original.terms_conditions,
        payment_terms=original.payment_terms,
        template_id=original.template_id,
        created_by=current_user.id,
        tenant_id=current_user.tenant_id,
    )
    db.add(new_inv)
    await db.flush()

    for item in original.items:
        db.add(InvoiceItem(
            invoice_id=new_inv.id,
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
        select(Invoice).options(selectinload(Invoice.items), selectinload(Invoice.client)).where(Invoice.id == new_inv.id)
    )
    return result.scalar_one()


@router.delete("/{invoice_id}", status_code=204)
async def delete_invoice(
    invoice_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Invoice).where(Invoice.id == invoice_id))
    invoice = result.scalar_one_or_none()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    eff_tenant = get_effective_tenant_id(current_user)
    if eff_tenant is not None and invoice.tenant_id != eff_tenant:
        raise HTTPException(status_code=403, detail="Access denied")
    if not OwnershipChecker.can_edit(current_user, invoice.created_by):
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    invoice.is_deleted = True
    await db.execute(delete(Payment).where(Payment.invoice_id == invoice_id))
    await db.commit()


@router.get("/{invoice_id}/pdf")
async def get_invoice_pdf(
    invoice_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Invoice)
        .options(selectinload(Invoice.items), selectinload(Invoice.client))
        .where(Invoice.id == invoice_id)
    )
    invoice = result.scalar_one_or_none()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    eff_tenant = get_effective_tenant_id(current_user)
    if eff_tenant is not None and invoice.tenant_id != eff_tenant:
        raise HTTPException(status_code=403, detail="Access denied")

    from app.services.pdf_service import generate_pdf
    import json as _json
    settings_result = await db.execute(select(CompanySettings).where(CompanySettings.tenant_id == invoice.tenant_id).limit(1))
    company = settings_result.scalar_one_or_none()
    if company is None:
        _fb = await db.execute(select(CompanySettings).limit(1))
        company = _fb.scalar_one_or_none()
    template_style = "professional"
    if invoice.template_id:
        from app.models.settings import DocumentTemplate
        tmpl_result = await db.execute(select(DocumentTemplate).where(DocumentTemplate.id == invoice.template_id))
        tmpl = tmpl_result.scalar_one_or_none()
        if tmpl and tmpl.template_json:
            try:
                template_style = _json.loads(tmpl.template_json).get("style", "professional")
            except Exception:
                pass
    pdf_bytes = await generate_pdf("invoice", invoice, company, template_style)
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{invoice.invoice_number}.pdf"'},
    )
