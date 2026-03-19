import base64
import io
import json
import os
import re
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
    payment_receipt_url: Optional[str] = None
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


# ── Local OCR extraction (free, no API key needed) ────────────────────────────

KNOWN_BANKS = [
    "Maybank", "CIMB", "Public Bank", "RHB", "Hong Leong", "AmBank",
    "Bank Rakyat", "BSN", "HSBC", "Standard Chartered", "OCBC", "UOB",
    "Alliance Bank", "Affin Bank", "Bank Islam", "Bank Muamalat",
]


def _extract_text_from_pdf(content: bytes) -> str:
    import pdfplumber
    text = ""
    with pdfplumber.open(io.BytesIO(content)) as pdf:
        for page in pdf.pages:
            text += (page.extract_text() or "") + "\n"
    return text


def _extract_text_from_image(content: bytes) -> str:
    import pytesseract
    from PIL import Image
    img = Image.open(io.BytesIO(content))
    return pytesseract.image_to_string(img)


def _normalize_date(raw: str) -> Optional[str]:
    """Convert various date formats to YYYY-MM-DD."""
    raw = raw.strip()
    # DD/MM/YYYY or DD-MM-YYYY
    m = re.match(r"(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$", raw)
    if m:
        d, mo, y = m.groups()
        if len(y) == 2:
            y = "20" + y
        return f"{y}-{mo.zfill(2)}-{d.zfill(2)}"
    # YYYY-MM-DD
    m = re.match(r"(\d{4})[/\-.](\d{2})[/\-.](\d{2})$", raw)
    if m:
        return raw
    # "15 March 2024" or "15 Mar 2024"
    months = {"jan": "01", "feb": "02", "mar": "03", "apr": "04",
               "may": "05", "jun": "06", "jul": "07", "aug": "08",
               "sep": "09", "oct": "10", "nov": "11", "dec": "12"}
    m = re.match(r"(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})", raw)
    if m:
        d, mon, y = m.groups()
        mo = months.get(mon[:3].lower())
        if mo:
            return f"{y}-{mo}-{d.zfill(2)}"
    return None


def _parse_text(text: str) -> dict:
    result: dict = {
        "vendor_name": None, "vendor_address": None,
        "vendor_email": None, "vendor_phone": None, "vendor_reg_no": None,
        "bank_name": None, "bank_account_no": None, "bank_account_name": None,
        "bill_number": None, "description": None,
        "issue_date": None, "due_date": None,
        "amount": None, "currency": "MYR",
    }

    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]

    # Email
    m = re.search(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}", text)
    if m:
        result["vendor_email"] = m.group()

    # Phone (Malaysian: starts with +60 / 60 / 01x / 03)
    m = re.search(
        r"(?:Tel|Phone|H/?P|Mobile|Fax)?[:\s]*"
        r"(\+?6?0[\s\-]?\d{1,2}[\s\-]?\d{3,4}[\s\-]?\d{4})",
        text, re.IGNORECASE,
    )
    if m:
        result["vendor_phone"] = re.sub(r"\s+", "", m.group(1))

    # Registration / Company No
    # Pattern 1: labelled "Reg No:", "Company No:", "SST Reg No:"
    m = re.search(
        r"(?:Reg(?:istration)?\.?\s*(?:No\.?)?|Co(?:mpany)?\.?\s*No\.?|SST\s*(?:Reg\.?\s*No\.?)?)"
        r"[:\s]*([A-Z0-9][\w\-]{3,20})",
        text, re.IGNORECASE,
    )
    if m:
        result["vendor_reg_no"] = m.group(1).strip()
    # Pattern 2: embedded in company name as "( 1582786-P )" or "(1234567-H)"
    if not result["vendor_reg_no"]:
        m = re.search(r"\(\s*(\d{6,8}[\-][A-Z0-9]{1,3})\s*\)", text)
        if m:
            result["vendor_reg_no"] = m.group(1).strip()

    # Invoice / Bill number
    # Pattern 1: "Invoice No.: INV-001" — SAME LINE only ([ \t:] not \s, prevents newline-crossing)
    m = re.search(
        r"(?:Invoice|Bill|Inv|Receipt|Tax\s+Invoice)\s*(?:No\.?|Number|#)[ \t:]+([^\n\r]{2,50})",
        text, re.IGNORECASE,
    )
    if m:
        val = m.group(1).strip().rstrip(":").strip()
        # Skip section header words like "Invoice No. Date" or "Invoice No. to"
        if val and not re.match(r"^(to|from|date|for|of|the|a)\b", val, re.IGNORECASE):
            result["bill_number"] = val
    # Pattern 2: multi-line column layout — standalone ": XXXX" line
    # (pdfplumber puts "Invoice No." label and ": 2026/MAIA/..." value on separate lines)
    if not result["bill_number"]:
        for line in lines:
            m = re.match(r"^:\s+(.{3,50})$", line)
            if m:
                candidate = m.group(1).strip()
                # Skip date lines ("17 March 2026"), amount lines ("RM1,000.00"), DD/MM/YYYY
                if not re.match(r"\d{1,2}\s+[A-Za-z]", candidate) and \
                   not re.match(r"RM|MYR|\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4}", candidate, re.IGNORECASE):
                    result["bill_number"] = candidate
                    break

    # Dates: labelled (same-line)
    issue_m = re.search(
        r"(?:Invoice|Issue|Inv\.?)\s*Date[:\s]+"
        r"(\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{2,4}"
        r"|\d{4}[/\-\.]\d{2}[/\-\.]\d{2}"
        r"|\d{1,2}\s+[A-Za-z]+\s+\d{4})",
        text, re.IGNORECASE,
    )
    due_m = re.search(
        r"(?:Due|Payment|Pay\s+by|Pay\s+Before)\s*(?:Date)?[:\s]+"
        r"(\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{2,4}"
        r"|\d{4}[/\-\.]\d{2}[/\-\.]\d{2}"
        r"|\d{1,2}\s+[A-Za-z]+\s+\d{4})",
        text, re.IGNORECASE,
    )
    if issue_m:
        result["issue_date"] = _normalize_date(issue_m.group(1))
    if due_m:
        result["due_date"] = _normalize_date(due_m.group(1))
    # Multi-line column layout: date appears as ": 17 March 2026" on its own line
    if not result["issue_date"]:
        for line in lines:
            m = re.match(r"^:\s+(\d{1,2}\s+[A-Za-z]+\s+\d{4})$", line)
            if m:
                result["issue_date"] = _normalize_date(m.group(1))
                break

    # Fallback: grab standalone dates — only assign issue_date, NOT due_date
    # (if there's no labelled due date, leave it null rather than guessing)
    if not result["issue_date"]:
        all_dates = re.findall(
            r"\b(\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{2,4}|\d{4}[/\-\.]\d{2}[/\-\.]\d{2})\b",
            text,
        )
        normalized = [_normalize_date(d) for d in all_dates if _normalize_date(d)]
        unique_dates = list(dict.fromkeys(normalized))
        if unique_dates:
            result["issue_date"] = unique_dates[0]

    # Amount — multi-pass, most specific first
    def _try_amount(pattern: str, t: str) -> Optional[float]:
        hit = re.search(pattern, t, re.IGNORECASE)
        if hit:
            try:
                return float(hit.group(1).replace(",", ""))
            except ValueError:
                pass
        return None

    def _parse_num(s: str) -> Optional[float]:
        try:
            return float(s.replace(",", ""))
        except ValueError:
            return None

    # Pass 1: scan EVERY "Total" line and take the LAST decimal number on it
    # (totals always appear in the rightmost column — after qty, unit price, etc.)
    # Handles: "Total: RM1,200.00", "TOTAL 1 1,200.00", "Grand Total 1,200.00", etc.
    for line in lines:
        if re.search(r"\b(?:Grand\s+Total|Total(?:\s+(?:Due|Amount))?|Amount\s+Due)\b", line, re.IGNORECASE):
            # strip currency symbol first, then find all numbers with decimals
            clean = re.sub(r"(?:RM|MYR|USD|SGD|EUR)", "", line, flags=re.IGNORECASE)
            nums = re.findall(r"[\d,]+\.\d{1,2}", clean)
            if nums:
                v = _parse_num(nums[-1])  # last number = rightmost column = total amount
                if v and v > 0:
                    result["amount"] = v
                    break

    # Pass 2: standalone ": RM1,000.00" line (multi-column PDF — value on its own line)
    if not result["amount"]:
        for line in lines:
            m = re.match(r"^:\s+RM\s*([\d,]+(?:\.\d{1,2})?)$", line, re.IGNORECASE)
            if m:
                v = _parse_num(m.group(1))
                if v:
                    result["amount"] = v
                    break

    # Pass 3: largest RM-prefixed value in the whole document
    if not result["amount"]:
        found = re.findall(r"(?:RM|MYR)\s*([\d,]+\.\d{1,2})", text, re.IGNORECASE)
        parsed = [v for v in (_parse_num(a) for a in found) if v and v > 0]
        if parsed:
            result["amount"] = max(parsed)

    # Currency
    if re.search(r"\bUSD\b|\$", text):
        result["currency"] = "USD"
    elif re.search(r"\bSGD\b", text):
        result["currency"] = "SGD"
    elif re.search(r"\bEUR\b|€", text):
        result["currency"] = "EUR"

    # Bank name — no word boundaries, plain substring search (handles "Public Bank" etc.)
    for bank in KNOWN_BANKS:
        if re.search(re.escape(bank), text, re.IGNORECASE):
            result["bank_name"] = bank
            break

    # Bank account number
    # Pattern 1: labelled "Acc No:", "Account No:", "A/C:"
    m = re.search(
        r"(?:Acc(?:ount)?\.?\s*(?:No\.?)?|A/C)[:\s]*(\d[\d\s\-]{6,18}\d)",
        text, re.IGNORECASE,
    )
    if m:
        result["bank_account_no"] = re.sub(r"[\s\-]", "", m.group(1))
    # Pattern 2: "BankName - XXXX XXXX XXXX" format (common in Malaysian invoices)
    if not result["bank_account_no"] and result["bank_name"]:
        m = re.search(
            re.escape(result["bank_name"]) + r"[\s\-–]+(\d[\d\s]{6,20}\d)",
            text, re.IGNORECASE,
        )
        if m:
            result["bank_account_no"] = re.sub(r"\s+", "", m.group(1))
    # Pattern 3: any "BankName - digits" even if bank_name not yet set
    if not result["bank_account_no"]:
        for bank in KNOWN_BANKS:
            m = re.search(
                re.escape(bank) + r"[\s\-–]+(\d[\d\s]{6,20}\d)",
                text, re.IGNORECASE,
            )
            if m:
                result["bank_name"] = result["bank_name"] or bank
                result["bank_account_no"] = re.sub(r"\s+", "", m.group(1))
                break

    # Description — extract main item title + bullet points ("To develop...", "To build..." etc.)
    desc_parts = []
    # Main item line: "AliLife: ... Phase 2 1 RM1,000.00"
    # Use greedy match so group(1) captures everything BEFORE the trailing qty+amount
    item_m = re.search(
        r"^([A-Z].+)\s+\d+(?:\.\d+)?\s+RM[\d,]+(?:\.\d{1,2})?$",
        text, re.MULTILINE | re.IGNORECASE,
    )
    if item_m:
        desc_parts.append(item_m.group(1).strip())
    # Bullet points starting with "To " — use re.MULTILINE so ^ anchors to each line
    bullets = re.findall(r"^To\s+\w[^\n]{14,}", text, re.MULTILINE | re.IGNORECASE)
    if bullets:
        desc_parts.extend(b.strip() for b in bullets[:6])
    if desc_parts:
        result["description"] = "\n".join(desc_parts)

    # Account holder name (line after "Account Name" or "Beneficiary")
    m = re.search(
        r"(?:Account\s*(?:Holder|Name)|Beneficiary|Payee)[:\s]+(.+)",
        text, re.IGNORECASE,
    )
    if m:
        result["bank_account_name"] = m.group(1).strip()

    # Vendor name — first meaningful line (skip common header words)
    skip = re.compile(
        r"^(invoice|bill|receipt|quotation|tax|page|date|no\.?|to:|from:|dear|"
        r"statement|delivery|purchase|order|description|unit|amount|subtotal|total|copyright)\b",
        re.IGNORECASE,
    )
    for line in lines[:8]:
        if len(line) < 3:
            continue
        if skip.match(line):
            continue
        if re.search(r"@|Tel|Fax|www\.|http|Reg\s*No", line, re.IGNORECASE):
            continue
        if re.search(r"^\d", line):  # starts with digit (probably a date/number)
            continue
        # Strip trailing "(reg no)" from company name line
        result["vendor_name"] = re.sub(r"\s*\(\s*[\d\w\-]+\s*\)\s*$", "", line).strip()
        break

    # Address: lines between vendor name and first labelled section
    addr_lines = []
    collecting = result["vendor_name"] is not None
    for line in lines:
        # Skip the vendor name line (compare via `in` because the line may include reg no suffix)
        if result["vendor_name"] and result["vendor_name"] in line:
            continue
        if collecting:
            if re.match(r"(?:Invoice|Bill|Date|Tel|Email|Ref|To:|Attn)", line, re.IGNORECASE):
                break
            if len(line) > 3 and not re.search(r"@", line):
                addr_lines.append(line)
        if len(addr_lines) >= 4:
            break
    if addr_lines:
        result["vendor_address"] = "\n".join(addr_lines)

    return result


async def _local_extract(content: bytes, mime_type: str) -> dict:
    try:
        if mime_type == "application/pdf":
            text = _extract_text_from_pdf(content)
        else:
            text = _extract_text_from_image(content)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"OCR failed: {str(e)}")
    if not text.strip():
        raise HTTPException(status_code=422, detail="Could not extract text from the document. Try a clearer image.")
    return _parse_text(text)


async def _ai_extract(content: bytes, mime_type: str) -> dict:
    """Try Anthropic AI first; fall back to local OCR if no API key."""
    settings = get_settings()
    if settings.anthropic_api_key:
        try:
            import anthropic as _anthropic
            PROMPT = (
                "This is a vendor invoice/bill. Extract ALL relevant information and respond ONLY with a JSON object "
                "(no markdown, no explanation). Use null for fields you cannot find.\n\n"
                "Return this exact structure:\n"
                '{"vendor_name":"<name>","vendor_address":"<address>","vendor_email":"<email or null>",'
                '"vendor_phone":"<phone or null>","vendor_reg_no":"<reg no or null>",'
                '"bank_name":"<bank or null>","bank_account_no":"<acc no or null>",'
                '"bank_account_name":"<holder name or null>","bill_number":"<inv no or null>",'
                '"description":"<what the bill is for or null>","issue_date":"<YYYY-MM-DD or null>",'
                '"due_date":"<YYYY-MM-DD or null>","amount":<number or null>,"currency":"<MYR>"}'
            )
            client = _anthropic.Anthropic(api_key=settings.anthropic_api_key)
            b64 = base64.standard_b64encode(content).decode("utf-8")
            block = (
                {"type": "document", "source": {"type": "base64", "media_type": "application/pdf", "data": b64}}
                if mime_type == "application/pdf"
                else {"type": "image", "source": {"type": "base64", "media_type": mime_type, "data": b64}}
            )
            response = client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=512,
                messages=[{"role": "user", "content": [block, {"type": "text", "text": PROMPT}]}],
            )
            raw = response.content[0].text.strip()
            if raw.startswith("```"):
                raw = raw.split("```")[1]
                if raw.startswith("json"):
                    raw = raw[4:]
            return json.loads(raw)
        except Exception:
            pass  # fall through to local OCR

    return await _local_extract(content, mime_type)


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
    payment_reference: Optional[str] = Form(None),
    receipt: Optional[UploadFile] = File(None),
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
    if receipt and receipt.filename:
        url, _ = await _save_file(receipt)
        bill.payment_receipt_url = url
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
