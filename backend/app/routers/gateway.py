"""
Payment gateway router — Billplz integration.
Public endpoints (webhook, bill creation for authenticated users).
"""
from datetime import datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.database import get_db
from app.models.user import User
from app.models.invoice import Invoice, InvoiceStatus
from app.models.payment import Payment
from app.models.receipt import Receipt, PaymentMethod
from app.models.activity import Activity, ActivityType
from app.models.settings import CompanySettings
from app.routers.auth import get_current_user
from app.services import billplz_service

router = APIRouter(prefix="/gateway", tags=["gateway"])


# ── Create payment link (authenticated — staff/admin only) ──────────────────

@router.post("/billplz/bill/{invoice_id}")
async def create_payment_link(
    invoice_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Generate a Billplz payment URL for an unpaid invoice."""
    result = await db.execute(
        select(Invoice).where(Invoice.id == invoice_id)
    )
    invoice = result.scalar_one_or_none()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if invoice.status in (InvoiceStatus.paid, InvoiceStatus.cancelled):
        raise HTTPException(status_code=400, detail="Invoice is already paid or cancelled")

    # Reuse cached bill URL if already created
    if invoice.payment_link_url:
        return {"url": invoice.payment_link_url, "bill_id": invoice.payment_link_id}

    # Need client loaded for email/phone
    from sqlalchemy.orm import selectinload
    result2 = await db.execute(
        select(Invoice).options(selectinload(Invoice.client)).where(Invoice.id == invoice_id)
    )
    invoice = result2.scalar_one()

    try:
        bill = await billplz_service.create_bill(invoice)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Billplz error: {str(e)}")

    invoice.payment_link_id = bill["id"]
    invoice.payment_link_url = bill["url"]
    await db.commit()

    return {"url": bill["url"], "bill_id": bill["id"]}


# ── Public endpoint: get payment link for an invoice number ─────────────────

@router.get("/billplz/link/{invoice_number}")
async def get_payment_link(invoice_number: str, db: AsyncSession = Depends(get_db)):
    """
    Public: return existing payment URL for an invoice number.
    Used by the verify page so clients can pay without logging in.
    """
    result = await db.execute(
        select(Invoice).where(Invoice.invoice_number == invoice_number, Invoice.is_deleted != True)
    )
    invoice = result.scalar_one_or_none()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if invoice.status in (InvoiceStatus.paid, InvoiceStatus.cancelled):
        return {"url": None, "status": invoice.status.value}
    if invoice.payment_link_url:
        return {"url": invoice.payment_link_url, "status": invoice.status.value}
    return {"url": None, "status": invoice.status.value}


# ── Billplz webhook (public — no auth) ──────────────────────────────────────

@router.post("/billplz/webhook", status_code=status.HTTP_200_OK)
async def billplz_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    """
    Billplz callback URL. Called by Billplz when payment status changes.
    Verifies X-Signature and records payment if paid=true.
    """
    form = await request.form()
    params = dict(form)

    # Verify signature
    if not billplz_service.verify_webhook_signature(params):
        raise HTTPException(status_code=400, detail="Invalid signature")

    bill_id = params.get("id", "")
    paid = params.get("paid", "false").lower() == "true"
    invoice_number = params.get("reference_1", "")

    if not paid or not invoice_number:
        return {"status": "ignored"}

    # Find invoice
    result = await db.execute(
        select(Invoice).where(Invoice.invoice_number == invoice_number, Invoice.is_deleted != True)
    )
    invoice = result.scalar_one_or_none()
    if not invoice:
        return {"status": "invoice_not_found"}

    if invoice.status == InvoiceStatus.paid:
        return {"status": "already_paid"}

    if invoice.status == InvoiceStatus.cancelled:
        return {"status": "cancelled"}

    # Parse amount from Billplz (in cents)
    try:
        paid_amount_cents = int(params.get("paid_amount", params.get("amount", "0")))
        paid_amount = Decimal(paid_amount_cents) / Decimal("100")
    except (ValueError, TypeError):
        paid_amount = Decimal(str(invoice.balance_due))

    payment_date = datetime.now(timezone.utc)
    try:
        paid_at_str = params.get("paid_at", "")
        if paid_at_str:
            payment_date = datetime.fromisoformat(paid_at_str.replace("Z", "+00:00"))
    except ValueError:
        pass

    # Record payment
    payment = Payment(
        invoice_id=invoice.id,
        amount=paid_amount,
        currency=invoice.currency,
        payment_date=payment_date,
        payment_method=PaymentMethod.online,
        reference_number=bill_id,
        notes=f"Paid via Billplz (bill: {bill_id})",
        recorded_by=None,
    )
    db.add(payment)
    await db.flush()

    invoice.amount_paid = Decimal(str(invoice.amount_paid)) + paid_amount
    invoice.balance_due = Decimal(str(invoice.total)) - invoice.amount_paid

    if invoice.balance_due <= 0:
        invoice.balance_due = Decimal("0.00")
        invoice.status = InvoiceStatus.paid
        invoice.paid_at = payment_date

        # Auto-generate receipt
        settings_result = await db.execute(
            select(CompanySettings).where(CompanySettings.tenant_id == invoice.tenant_id).limit(1)
        )
        settings = settings_result.scalar_one_or_none()
        if settings is None:
            settings_result = await db.execute(select(CompanySettings).limit(1))
            settings = settings_result.scalar_one_or_none()

        prefix = (settings.receipt_prefix if settings else None) or "RCP"
        year = datetime.now().year
        count_result = await db.execute(select(func.count(Receipt.id)))
        count = (count_result.scalar() or 0) + 1
        receipt_number = f"{prefix}-{year}-{count:04d}"

        receipt = Receipt(
            receipt_number=receipt_number,
            invoice_id=invoice.id,
            client_id=invoice.client_id,
            currency=invoice.currency,
            exchange_rate=invoice.exchange_rate,
            amount=paid_amount,
            payment_method=PaymentMethod.online,
            payment_date=payment_date,
            notes=f"Payment received via Billplz",
            created_by=None,
        )
        db.add(receipt)
        await db.flush()
        payment.receipt_id = receipt.id
    else:
        invoice.status = InvoiceStatus.partial

    # Activity log
    activity = Activity(
        client_id=invoice.client_id,
        user_id=None,
        type=ActivityType.payment_received,
        description=f"Online payment of {invoice.currency} {paid_amount} received via Billplz for invoice {invoice.invoice_number}",
        occurred_at=payment_date,
    )
    db.add(activity)
    await db.commit()

    return {"status": "ok"}
