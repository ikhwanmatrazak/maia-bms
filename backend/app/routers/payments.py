import os
import base64
import json
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from typing import List, Optional

from app.database import get_db
from app.models.payment import Payment
from app.models.invoice import Invoice
from app.models.client import Client
from app.models.user import User
from app.schemas.document import PaymentResponse
from app.middleware.auth import get_current_user
from app.config import get_settings

router = APIRouter(prefix="/payments", tags=["payments"])
settings = get_settings()

ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/webp", "application/pdf"}


@router.get("", response_model=List[PaymentResponse])
async def list_payments(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    month: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from datetime import datetime as _dt, timezone as _tz
    query = (
        select(Payment)
        .options(selectinload(Payment.invoice).selectinload(Invoice.client))
        .order_by(Payment.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    if not current_user.is_super_admin and current_user.tenant_id is not None:
        tenant_invoice_ids = select(Invoice.id).where(Invoice.tenant_id == current_user.tenant_id).scalar_subquery()
        query = query.where(Payment.invoice_id.in_(tenant_invoice_ids))
    if month:
        y, m_n = int(month.split("-")[0]), int(month.split("-")[1])
        start = _dt(y, m_n, 1, tzinfo=_tz.utc)
        end = _dt(y + 1, 1, 1, tzinfo=_tz.utc) if m_n == 12 else _dt(y, m_n + 1, 1, tzinfo=_tz.utc)
        query = query.where(Payment.payment_date >= start, Payment.payment_date < end)
    result = await db.execute(query)
    return result.scalars().all()


@router.post("/{payment_id}/upload-proof", response_model=PaymentResponse)
async def upload_proof(
    payment_id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Payment).where(Payment.id == payment_id))
    payment = result.scalar_one_or_none()
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")

    if file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(status_code=400, detail="Invalid file type. Allowed: JPEG, PNG, WebP, PDF")

    content = await file.read()
    max_bytes = settings.max_file_size_mb * 1024 * 1024
    if len(content) > max_bytes:
        raise HTTPException(status_code=400, detail=f"File too large. Maximum size: {settings.max_file_size_mb}MB")

    upload_dir = os.path.join(settings.upload_dir, "payment_proofs")
    os.makedirs(upload_dir, exist_ok=True)
    ext = os.path.splitext(file.filename or "proof")[1] or ".jpg"
    filename = f"payment_{payment_id}{ext}"
    file_path = os.path.join(upload_dir, filename)

    with open(file_path, "wb") as f:
        f.write(content)

    payment.proof_file_url = f"/uploads/payment_proofs/{filename}"
    await db.commit()
    await db.refresh(payment)
    return payment


@router.post("/analyze-proof")
async def analyze_payment_proof(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """Upload a payment receipt image/PDF and extract payment details using AI."""
    if file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(status_code=400, detail="Invalid file type. Allowed: JPEG, PNG, WebP, PDF")

    if not settings.anthropic_api_key:
        raise HTTPException(status_code=503, detail="AI analysis not configured. Set ANTHROPIC_API_KEY in environment.")

    content = await file.read()
    max_bytes = settings.max_file_size_mb * 1024 * 1024
    if len(content) > max_bytes:
        raise HTTPException(status_code=400, detail=f"File too large. Maximum size: {settings.max_file_size_mb}MB")

    import anthropic as _anthropic
    client = _anthropic.Anthropic(api_key=settings.anthropic_api_key)

    # For PDFs convert to base64 as document type; for images use image type
    is_pdf = file.content_type == "application/pdf"
    b64_content = base64.standard_b64encode(content).decode("utf-8")

    if is_pdf:
        source = {"type": "base64", "media_type": "application/pdf", "data": b64_content}
        content_block = {"type": "document", "source": source}
    else:
        source = {"type": "base64", "media_type": file.content_type, "data": b64_content}
        content_block = {"type": "image", "source": source}

    prompt = (
        "This is a payment receipt or bank transaction proof. "
        "Extract the following details and respond ONLY with a JSON object (no markdown, no explanation):\n"
        '{"amount": <number or null>, "currency": "<3-letter code or MYR>", '
        '"payment_date": "<YYYY-MM-DD or null>", "payment_method": "<cash|bank_transfer|cheque|online|other>", '
        '"reference_number": "<string or null>", "notes": "<brief description or null>"}'
    )

    try:
        response = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=256,
            messages=[{"role": "user", "content": [content_block, {"type": "text", "text": prompt}]}],
        )
        raw = response.content[0].text.strip()
        # Strip markdown fences if present
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        extracted = json.loads(raw)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Could not extract payment details: {str(e)}")

    return extracted


from decimal import Decimal as _Dec
from datetime import datetime as _dt, timezone as _tz


def _month_range(month):
    if month:
        y, m = int(month.split("-")[0]), int(month.split("-")[1])
    else:
        now = _dt.now(_tz.utc)
        y, m = now.year, now.month
    start = _dt(y, m, 1, tzinfo=_tz.utc)
    end = _dt(y + 1, 1, 1, tzinfo=_tz.utc) if m == 12 else _dt(y, m + 1, 1, tzinfo=_tz.utc)
    return start, end


@router.get("/summary")
async def payments_summary(
    month: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    start, end = _month_range(month)
    q = select(Payment).join(Invoice, Payment.invoice_id == Invoice.id).where(
        Payment.payment_date >= start, Payment.payment_date < end
    )
    if not current_user.is_super_admin and current_user.tenant_id is not None:
        q = q.where(Invoice.tenant_id == current_user.tenant_id)
    result = await db.execute(q)
    rows = result.scalars().all()

    by_method = {}
    for r in rows:
        k = r.payment_method.value if r.payment_method else "other"
        by_method[k] = by_method.get(k, 0) + 1

    return {
        "count": len(rows),
        "total_amount": float(sum(_Dec(str(r.amount)) for r in rows)),
        "by_method": by_method,
        "month": month or _dt.now(_tz.utc).strftime("%Y-%m"),
    }
