from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text
from typing import Optional, List
from decimal import Decimal
from pydantic import BaseModel
from datetime import datetime, timezone
import io

from app.database import get_db
from app.models.payment_voucher import PaymentVoucher, PaymentMethod, PVStatus
from app.models.settings import CompanySettings
from app.middleware.auth import get_current_user
from app.middleware.rbac import apply_tenant_filter, get_effective_tenant_id

router = APIRouter(prefix="/payment-vouchers", tags=["payment-vouchers"])


# ── Number-to-words ────────────────────────────────────────────────────────────

_ONES = ["", "ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE",
         "TEN", "ELEVEN", "TWELVE", "THIRTEEN", "FOURTEEN", "FIFTEEN", "SIXTEEN",
         "SEVENTEEN", "EIGHTEEN", "NINETEEN"]
_TENS = ["", "", "TWENTY", "THIRTY", "FORTY", "FIFTY", "SIXTY", "SEVENTY", "EIGHTY", "NINETY"]


def _below_thousand(n: int) -> str:
    if n == 0:
        return ""
    elif n < 20:
        return _ONES[n]
    elif n < 100:
        rem = n % 10
        return _TENS[n // 10] + (" " + _ONES[rem] if rem else "")
    else:
        rem = n % 100
        return _ONES[n // 100] + " HUNDRED" + (" " + _below_thousand(rem) if rem else "")


def amount_to_words(amount: Decimal) -> str:
    amount = Decimal(str(amount)).quantize(Decimal("0.01"))
    ringgit = int(amount)
    sen = int(round((amount - ringgit) * 100))

    if ringgit == 0 and sen == 0:
        return "ZERO RINGGIT ONLY"

    parts = []
    billions = ringgit // 1_000_000_000
    millions = (ringgit % 1_000_000_000) // 1_000_000
    thousands = (ringgit % 1_000_000) // 1_000
    remainder = ringgit % 1_000

    if billions:
        parts.append(_below_thousand(billions) + " BILLION")
    if millions:
        parts.append(_below_thousand(millions) + " MILLION")
    if thousands:
        parts.append(_below_thousand(thousands) + " THOUSAND")
    if remainder:
        parts.append(_below_thousand(remainder))

    words = "RINGGIT MALAYSIA: " + " ".join(parts)
    if sen:
        words += f" AND {_below_thousand(sen)} SEN"
    words += " ONLY"
    return words


# ── Voucher number generation ──────────────────────────────────────────────────

async def _generate_voucher_number(db: AsyncSession, tenant_id=None) -> str:
    result = await db.execute(
        select(CompanySettings).where(CompanySettings.tenant_id == tenant_id).limit(1)
    )
    settings = result.scalar_one_or_none()
    if settings is None:
        result = await db.execute(select(CompanySettings).limit(1))
        settings = result.scalar_one_or_none()

    prefix = "PV"
    year = datetime.now().year
    pattern = f"{prefix}-{year}-%"

    max_result = await db.execute(
        select(PaymentVoucher.voucher_number)
        .where(PaymentVoucher.voucher_number.like(pattern))
        .order_by(PaymentVoucher.voucher_number.desc())
        .limit(1)
    )
    last = max_result.scalar_one_or_none()
    last_seq = 0
    if last:
        try:
            last_seq = int(last.split("-")[-1])
        except (ValueError, IndexError):
            last_seq = 0

    candidate = last_seq + 1
    while True:
        number = f"{prefix}-{year}-{candidate:04d}"
        exists = await db.execute(
            select(PaymentVoucher.id).where(PaymentVoucher.voucher_number == number).limit(1)
        )
        if exists.scalar_one_or_none() is None:
            return number
        candidate += 1


# ── Schemas ────────────────────────────────────────────────────────────────────

class PVCreate(BaseModel):
    date: str
    payee_name: str
    payee_address: Optional[str] = None
    amount: float
    description: str
    payment_method: PaymentMethod = PaymentMethod.bank_transfer
    cheque_number: Optional[str] = None
    bank_ref: Optional[str] = None
    transaction_id: Optional[int] = None
    prepared_by: Optional[str] = None
    approved_by: Optional[str] = None
    notes: Optional[str] = None
    status: PVStatus = PVStatus.draft


class PVUpdate(BaseModel):
    date: Optional[str] = None
    payee_name: Optional[str] = None
    payee_address: Optional[str] = None
    amount: Optional[float] = None
    description: Optional[str] = None
    payment_method: Optional[PaymentMethod] = None
    cheque_number: Optional[str] = None
    bank_ref: Optional[str] = None
    transaction_id: Optional[int] = None
    prepared_by: Optional[str] = None
    approved_by: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[PVStatus] = None


def _pv_to_dict(pv: PaymentVoucher) -> dict:
    return {
        "id": pv.id,
        "tenant_id": pv.tenant_id,
        "voucher_number": pv.voucher_number,
        "date": pv.date.isoformat() if pv.date else None,
        "payee_name": pv.payee_name,
        "payee_address": pv.payee_address,
        "amount": float(pv.amount) if pv.amount is not None else 0.0,
        "amount_in_words": pv.amount_in_words,
        "description": pv.description,
        "payment_method": pv.payment_method,
        "cheque_number": pv.cheque_number,
        "bank_ref": pv.bank_ref,
        "transaction_id": pv.transaction_id,
        "status": pv.status,
        "prepared_by": pv.prepared_by,
        "approved_by": pv.approved_by,
        "notes": pv.notes,
        "created_by": pv.created_by,
        "created_at": pv.created_at.isoformat() if pv.created_at else None,
        "updated_at": pv.updated_at.isoformat() if pv.updated_at else None,
    }


# ── Endpoints ──────────────────────────────────────────────────────────────────


@router.get("")
async def list_vouchers(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    search: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    q = select(PaymentVoucher).where(PaymentVoucher.is_deleted == False)
    q = apply_tenant_filter(q, PaymentVoucher, current_user)
    if search:
        like = f"%{search}%"
        q = q.where(
            PaymentVoucher.voucher_number.ilike(like) |
            PaymentVoucher.payee_name.ilike(like) |
            PaymentVoucher.description.ilike(like)
        )
    if status:
        q = q.where(PaymentVoucher.status == status)
    count_q = q.with_only_columns(PaymentVoucher.id)
    total_r = await db.execute(count_q)
    total = len(total_r.all())
    q = q.order_by(PaymentVoucher.date.desc(), PaymentVoucher.id.desc()).offset(skip).limit(limit)
    result = await db.execute(q)
    rows = result.scalars().all()
    return {"total": total, "items": [_pv_to_dict(r) for r in rows]}


@router.get("/next-number")
async def next_number(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    num = await _generate_voucher_number(db, current_user.tenant_id)
    return {"voucher_number": num}


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_voucher(
    body: PVCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    tid = get_effective_tenant_id(current_user)
    number = await _generate_voucher_number(db, tid)
    amount = Decimal(str(body.amount))
    pv = PaymentVoucher(
        tenant_id=tid,
        voucher_number=number,
        date=datetime.fromisoformat(body.date).replace(tzinfo=timezone.utc),
        payee_name=body.payee_name,
        payee_address=body.payee_address,
        amount=amount,
        amount_in_words=amount_to_words(amount),
        description=body.description,
        payment_method=body.payment_method,
        cheque_number=body.cheque_number,
        bank_ref=body.bank_ref,
        transaction_id=body.transaction_id,
        status=body.status,
        prepared_by=body.prepared_by,
        approved_by=body.approved_by,
        notes=body.notes,
        created_by=current_user.id,
    )
    db.add(pv)
    await db.commit()
    await db.refresh(pv)
    return _pv_to_dict(pv)


@router.get("/{pv_id}")
async def get_voucher(
    pv_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    q = select(PaymentVoucher).where(
        PaymentVoucher.id == pv_id,
        PaymentVoucher.is_deleted == False,
    )
    q = apply_tenant_filter(q, PaymentVoucher, current_user)
    result = await db.execute(q)
    pv = result.scalar_one_or_none()
    if not pv:
        raise HTTPException(status_code=404, detail="Payment voucher not found")
    return _pv_to_dict(pv)


@router.put("/{pv_id}")
async def update_voucher(
    pv_id: int,
    body: PVUpdate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    q = select(PaymentVoucher).where(
        PaymentVoucher.id == pv_id,
        PaymentVoucher.is_deleted == False,
    )
    q = apply_tenant_filter(q, PaymentVoucher, current_user)
    result = await db.execute(q)
    pv = result.scalar_one_or_none()
    if not pv:
        raise HTTPException(status_code=404, detail="Payment voucher not found")

    if body.date is not None:
        pv.date = datetime.fromisoformat(body.date).replace(tzinfo=timezone.utc)
    if body.payee_name is not None:
        pv.payee_name = body.payee_name
    if body.payee_address is not None:
        pv.payee_address = body.payee_address
    if body.amount is not None:
        pv.amount = Decimal(str(body.amount))
        pv.amount_in_words = amount_to_words(pv.amount)
    if body.description is not None:
        pv.description = body.description
    if body.payment_method is not None:
        pv.payment_method = body.payment_method
    if body.cheque_number is not None:
        pv.cheque_number = body.cheque_number
    if body.bank_ref is not None:
        pv.bank_ref = body.bank_ref
    if body.transaction_id is not None:
        pv.transaction_id = body.transaction_id
    if body.status is not None:
        pv.status = body.status
    if body.prepared_by is not None:
        pv.prepared_by = body.prepared_by
    if body.approved_by is not None:
        pv.approved_by = body.approved_by
    if body.notes is not None:
        pv.notes = body.notes

    await db.commit()
    await db.refresh(pv)
    return _pv_to_dict(pv)


@router.delete("/{pv_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_voucher(
    pv_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    q = select(PaymentVoucher).where(
        PaymentVoucher.id == pv_id,
        PaymentVoucher.is_deleted == False,
    )
    q = apply_tenant_filter(q, PaymentVoucher, current_user)
    result = await db.execute(q)
    pv = result.scalar_one_or_none()
    if not pv:
        raise HTTPException(status_code=404, detail="Payment voucher not found")
    pv.is_deleted = True
    await db.commit()


@router.get("/{pv_id}/pdf")
async def download_pdf(
    pv_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    from app.services.pdf_service import generate_pdf

    q = select(PaymentVoucher).where(
        PaymentVoucher.id == pv_id,
        PaymentVoucher.is_deleted == False,
    )
    q = apply_tenant_filter(q, PaymentVoucher, current_user)
    result = await db.execute(q)
    pv = result.scalar_one_or_none()
    if not pv:
        raise HTTPException(status_code=404, detail="Payment voucher not found")

    co_result = await db.execute(
        select(CompanySettings).where(CompanySettings.tenant_id == current_user.tenant_id).limit(1)
    )
    company = co_result.scalar_one_or_none()
    if company is None:
        co_result = await db.execute(select(CompanySettings).limit(1))
        company = co_result.scalar_one_or_none()

    pdf_bytes = await generate_pdf("payment_voucher", pv, company, "professional")
    filename = f"{pv.voucher_number}.pdf"
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
