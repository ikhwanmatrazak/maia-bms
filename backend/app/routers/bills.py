import base64
import json
import os
import uuid
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.config import get_settings
from app.database import get_db
from app.middleware.auth import get_current_user
from app.middleware.rbac import apply_tenant_filter, get_effective_tenant_id
from app.models.user import User
from app.models.bill import Bill, BillStatus

router = APIRouter(prefix="/bills", tags=["bills"])

ALLOWED_MIME = {"image/jpeg", "image/png", "image/webp", "application/pdf"}


# ── Schemas ──────────────────────────────────────────────────────────────────

class BillCreate(BaseModel):
    vendor_name: Optional[str] = None
    vendor_address: Optional[str] = None
    vendor_email: Optional[str] = None
    vendor_phone: Optional[str] = None
    vendor_reg_no: Optional[str] = None
    bank_name: Optional[str] = None
    bank_account_no: Optional[str] = None
    bank_account_name: Optional[str] = None
    bill_number: Optional[str] = None
    description: Optional[str] = None
    issue_date: Optional[datetime] = None
    due_date: Optional[datetime] = None
    amount: Optional[float] = None
    currency: str = "MYR"
    notes: Optional[str] = None
    file_url: Optional[str] = None


class BillUpdate(BillCreate):
    status: Optional[BillStatus] = None
    paid_at: Optional[datetime] = None
    payment_reference: Optional[str] = None


class BillResponse(BaseModel):
    id: int
    vendor_name: Optional[str] = None
    vendor_address: Optional[str] = None
    vendor_email: Optional[str] = None
    vendor_phone: Optional[str] = None
    vendor_reg_no: Optional[str] = None
    bank_name: Optional[str] = None
    bank_account_no: Optional[str] = None
    bank_account_name: Optional[str] = None
    bill_number: Optional[str] = None
    description: Optional[str] = None
    issue_date: Optional[datetime] = None
    due_date: Optional[datetime] = None
    amount: Optional[float] = None
    currency: str = "MYR"
    status: BillStatus = BillStatus.pending
    paid_at: Optional[datetime] = None
    payment_reference: Optional[str] = None
    file_url: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _bills_upload_dir() -> str:
    path = os.path.join(get_settings().upload_dir, "bills")
    os.makedirs(path, exist_ok=True)
    return path


async def _save_file(file: UploadFile) -> str:
    content = await file.read()
    settings = get_settings()
    max_bytes = settings.max_file_size_mb * 1024 * 1024
    if len(content) > max_bytes:
        raise HTTPException(status_code=400, detail=f"File too large. Max {settings.max_file_size_mb}MB")
    ext = os.path.splitext(file.filename or "file")[1] or ".bin"
    filename = f"{uuid.uuid4().hex}{ext}"
    path = os.path.join(_bills_upload_dir(), filename)
    with open(path, "wb") as f:
        f.write(content)
    return f"/uploads/bills/{filename}", content


# ── AI extraction ─────────────────────────────────────────────────────────────

EXTRACT_PROMPT = (
    "This is a vendor invoice / bill. Extract ALL relevant information and respond ONLY with a JSON object "
    "(no markdown, no explanation). Use null for fields you cannot find.\n\n"
    "Return this exact structure:\n"
    '{"vendor_name": "<company name>", '
    '"vendor_address": "<full address>", '
    '"vendor_email": "<email or null>", '
    '"vendor_phone": "<phone or null>", '
    '"vendor_reg_no": "<company reg number or null>", '
    '"bank_name": "<bank name or null>", '
    '"bank_account_no": "<account number or null>", '
    '"bank_account_name": "<account holder name or null>", '
    '"bill_number": "<invoice/bill number or null>", '
    '"description": "<brief description of what the bill is for or null>", '
    '"issue_date": "<YYYY-MM-DD or null>", '
    '"due_date": "<YYYY-MM-DD or null>", '
    '"amount": <total amount as number or null>, '
    '"currency": "<3-letter code, default MYR>"}'
)


async def _ai_extract(content: bytes, mime_type: str) -> dict:
    settings = get_settings()
    if not settings.anthropic_api_key:
        raise HTTPException(status_code=503, detail="AI extraction not configured (ANTHROPIC_API_KEY missing)")

    import anthropic as _anthropic
    client = _anthropic.Anthropic(api_key=settings.anthropic_api_key)
    b64 = base64.standard_b64encode(content).decode("utf-8")
    is_pdf = mime_type == "application/pdf"

    if is_pdf:
        content_block = {"type": "document", "source": {"type": "base64", "media_type": "application/pdf", "data": b64}}
    else:
        content_block = {"type": "image", "source": {"type": "base64", "media_type": mime_type, "data": b64}}

    try:
        response = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=512,
            messages=[{"role": "user", "content": [content_block, {"type": "text", "text": EXTRACT_PROMPT}]}],
        )
        raw = response.content[0].text.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        return json.loads(raw)
    except json.JSONDecodeError:
        raise HTTPException(status_code=422, detail="AI could not parse the document")
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"AI extraction failed: {str(e)}")


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/analyze", summary="Upload invoice file and extract info via AI")
async def analyze_bill(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    if file.content_type not in ALLOWED_MIME:
        raise HTTPException(status_code=400, detail="Invalid file type. Allowed: JPEG, PNG, WebP, PDF")
    content = await file.read()
    settings = get_settings()
    if len(content) > settings.max_file_size_mb * 1024 * 1024:
        raise HTTPException(status_code=400, detail=f"File too large. Max {settings.max_file_size_mb}MB")

    extracted = await _ai_extract(content, file.content_type)

    # Save the file so user doesn't need to re-upload
    ext = os.path.splitext(file.filename or "bill")[1] or ".bin"
    filename = f"{uuid.uuid4().hex}{ext}"
    path = os.path.join(_bills_upload_dir(), filename)
    with open(path, "wb") as f:
        f.write(content)
    extracted["file_url"] = f"/uploads/bills/{filename}"
    extracted["original_filename"] = file.filename

    return extracted


@router.get("", response_model=List[BillResponse])
async def list_bills(
    status: Optional[BillStatus] = Query(None),
    search: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = select(Bill).where(Bill.is_deleted != True)
    query = apply_tenant_filter(query, Bill, current_user)
    if status:
        query = query.where(Bill.status == status)
    if search:
        query = query.where(Bill.vendor_name.ilike(f"%{search}%") | Bill.bill_number.ilike(f"%{search}%"))
    query = query.order_by(Bill.created_at.desc())
    result = await db.execute(query)
    return result.scalars().all()


@router.post("", response_model=BillResponse, status_code=status.HTTP_201_CREATED)
async def create_bill(
    data: BillCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    bill = Bill(
        **data.model_dump(),
        tenant_id=current_user.tenant_id,
        created_by=current_user.id,
    )
    db.add(bill)
    await db.commit()
    await db.refresh(bill)
    return bill


@router.get("/{bill_id}", response_model=BillResponse)
async def get_bill(
    bill_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Bill).where(Bill.id == bill_id, Bill.is_deleted != True))
    bill = result.scalar_one_or_none()
    if not bill:
        raise HTTPException(status_code=404, detail="Bill not found")
    eff = get_effective_tenant_id(current_user)
    if eff is not None and bill.tenant_id != eff:
        raise HTTPException(status_code=403, detail="Access denied")
    return bill


@router.put("/{bill_id}", response_model=BillResponse)
async def update_bill(
    bill_id: int,
    data: BillUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Bill).where(Bill.id == bill_id, Bill.is_deleted != True))
    bill = result.scalar_one_or_none()
    if not bill:
        raise HTTPException(status_code=404, detail="Bill not found")
    eff = get_effective_tenant_id(current_user)
    if eff is not None and bill.tenant_id != eff:
        raise HTTPException(status_code=403, detail="Access denied")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(bill, k, v)
    await db.commit()
    await db.refresh(bill)
    return bill


@router.post("/{bill_id}/mark-paid", response_model=BillResponse)
async def mark_paid(
    bill_id: int,
    payment_reference: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Bill).where(Bill.id == bill_id, Bill.is_deleted != True))
    bill = result.scalar_one_or_none()
    if not bill:
        raise HTTPException(status_code=404, detail="Bill not found")
    eff = get_effective_tenant_id(current_user)
    if eff is not None and bill.tenant_id != eff:
        raise HTTPException(status_code=403, detail="Access denied")
    bill.status = BillStatus.paid
    bill.paid_at = datetime.now(timezone.utc)
    if payment_reference:
        bill.payment_reference = payment_reference
    await db.commit()
    await db.refresh(bill)
    return bill


@router.delete("/{bill_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_bill(
    bill_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Bill).where(Bill.id == bill_id, Bill.is_deleted != True))
    bill = result.scalar_one_or_none()
    if not bill:
        raise HTTPException(status_code=404, detail="Bill not found")
    eff = get_effective_tenant_id(current_user)
    if eff is not None and bill.tenant_id != eff:
        raise HTTPException(status_code=403, detail="Access denied")
    bill.is_deleted = True
    await db.commit()
