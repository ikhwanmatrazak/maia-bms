from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from typing import List, Optional
from decimal import Decimal
import io
from datetime import datetime, timezone

from app.database import get_db
from app.models.invoice import Invoice, InvoiceItem, InvoiceStatus
from app.models.receipt import Receipt, PaymentMethod
from app.models.payment import Payment
from app.models.settings import TaxRate, CompanySettings
from app.models.activity import Activity, ActivityType
from app.models.user import User
from app.schemas.document import InvoiceCreate, InvoiceUpdate, InvoiceResponse, PaymentCreate, PaymentResponse
from app.middleware.auth import get_current_user
from app.middleware.rbac import OwnershipChecker
from app.utils.tax import calculate_line_total, calculate_document_totals

router = APIRouter(prefix="/invoices", tags=["invoices"])


async def _generate_invoice_number(db: AsyncSession) -> str:
    result = await db.execute(select(CompanySettings).limit(1))
    settings = result.scalar_one_or_none()
    prefix = settings.invoice_prefix if settings else "INV"
    year = datetime.now().year
    count_result = await db.execute(select(func.count(Invoice.id)))
    count = (count_result.scalar() or 0) + 1
    return f"{prefix}-{year}-{count:04d}"


@router.get("", response_model=List[InvoiceResponse])
async def list_invoices(
    status: Optional[InvoiceStatus] = Query(None),
    client_id: Optional[int] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = select(Invoice).options(selectinload(Invoice.items))
    if not OwnershipChecker.can_view_all(current_user):
        query = query.where(Invoice.created_by == current_user.id)
    if status:
        query = query.where(Invoice.status == status)
    if client_id:
        query = query.where(Invoice.client_id == client_id)
    query = query.order_by(Invoice.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(query)
    return result.scalars().all()


@router.post("", response_model=InvoiceResponse, status_code=status.HTTP_201_CREATED)
async def create_invoice(
    body: InvoiceCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    number = await _generate_invoice_number(db)
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
        template_id=body.template_id,
        created_by=current_user.id,
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
        select(Invoice).options(selectinload(Invoice.items)).where(Invoice.id == invoice.id)
    )
    return result.scalar_one()


@router.get("/{invoice_id}", response_model=InvoiceResponse)
async def get_invoice(
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
    return invoice


@router.put("/{invoice_id}", response_model=InvoiceResponse)
async def update_invoice(
    invoice_id: int,
    body: InvoiceUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Invoice).options(selectinload(Invoice.items)).where(Invoice.id == invoice_id)
    )
    invoice = result.scalar_one_or_none()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
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
        select(Invoice).options(selectinload(Invoice.items)).where(Invoice.id == invoice_id)
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
    await db.refresh(invoice)
    return invoice


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
    if invoice.status == InvoiceStatus.paid:
        raise HTTPException(status_code=400, detail="Cannot cancel a paid invoice")

    invoice.status = InvoiceStatus.cancelled
    await db.commit()
    await db.refresh(invoice)
    return invoice


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
    await db.refresh(payment)
    return payment


@router.get("/{invoice_id}/payments", response_model=List[PaymentResponse])
async def list_payments(
    invoice_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Payment).where(Payment.invoice_id == invoice_id).order_by(Payment.payment_date)
    )
    return result.scalars().all()


@router.get("/{invoice_id}/pdf")
async def get_invoice_pdf(
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

    from app.services.pdf_service import generate_pdf
    settings_result = await db.execute(select(CompanySettings).limit(1))
    company = settings_result.scalar_one_or_none()
    pdf_bytes = await generate_pdf("invoice", invoice, company)
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{invoice.invoice_number}.pdf"'},
    )
