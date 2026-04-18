import io
import re
import uuid
from datetime import datetime
from typing import Optional
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from pydantic import BaseModel

from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.user import User
from app.config import get_settings

router = APIRouter(prefix="/user-claims", tags=["user-claims"], redirect_slashes=False)

ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"}
UPLOAD_BASE = "uploads/claims"


# ---------- Schemas ----------

class ClaimOut(BaseModel):
    id: int
    user_id: int
    tenant_id: Optional[int]
    title: str
    claim_type: str
    description: str
    amount: float
    claim_date: str
    receipt_url: Optional[str]
    status: str
    rejection_reason: Optional[str]
    submitted_by_name: Optional[str]
    created_at: str


class ExtractedClaim(BaseModel):
    title: Optional[str] = None
    claim_type: Optional[str] = None
    description: Optional[str] = None
    amount: Optional[float] = None
    claim_date: Optional[str] = None
    vendor: Optional[str] = None


# ---------- Helpers ----------

def _upload_dir() -> Path:
    settings = get_settings()
    path = Path(settings.upload_dir) / "claims"
    path.mkdir(parents=True, exist_ok=True)
    return path


async def _save_file(file: UploadFile) -> str:
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail="Only images and PDFs are allowed")
    settings = get_settings()
    if file.size and file.size > settings.max_file_size_mb * 1024 * 1024:
        raise HTTPException(status_code=400, detail=f"File too large (max {settings.max_file_size_mb}MB)")

    ext = Path(file.filename or "file").suffix or ".jpg"
    filename = f"{uuid.uuid4().hex}{ext}"
    dest = _upload_dir() / filename
    content = await file.read()
    dest.write_bytes(content)
    return f"claims/{filename}"


# ---------- OCR Extraction (Tesseract, no API key needed) ----------

CLAIM_TYPE_KEYWORDS = {
    "Meals": ["restaurant", "cafe", "food", "makan", "dining", "lunch", "dinner", "breakfast", "kedai", "mamak", "pizza", "burger", "nasi", "mee", "roti"],
    "Petrol": ["petrol", "fuel", "petronas", "shell", "caltex", "bhp", "esso", "ron95", "ron97", "diesel"],
    "Travel": ["grab", "taxi", "uber", "bas", "bus", "train", "ktm", "lrt", "mrt", "flight", "airasia", "malindo", "mas ", "toll", "highway"],
    "Parking": ["parking", "park", "park&ride", "dbkl", "mbpj", "mpark"],
    "Accommodation": ["hotel", "resort", "inn", "lodge", "airbnb", "motel", "suite"],
    "Medical": ["klinik", "clinic", "hospital", "pharmacy", "farmasi", "doctor", "doktor", "ubat", "medicine"],
    "Office Supplies": ["stationery", "stationary", "office", "printing", "print", "photocopy", "atk", "pen", "paper"],
}


def _ocr_text(file_bytes: bytes, mime_type: str) -> str:
    """Extract raw text from image or PDF using Tesseract / pdfplumber."""
    if mime_type == "application/pdf":
        try:
            import pdfplumber
            with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
                return "\n".join(page.extract_text() or "" for page in pdf.pages[:3])
        except Exception:
            return ""
    try:
        import pytesseract
        from PIL import Image
        img = Image.open(io.BytesIO(file_bytes))
        return pytesseract.image_to_string(img, lang="eng")
    except Exception:
        return ""


def _parse_receipt_text(text: str) -> ExtractedClaim:
    """Parse OCR text into structured claim fields using regex heuristics."""
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    if not lines:
        return ExtractedClaim()

    # --- Vendor: first meaningful non-numeric line ---
    vendor = None
    for line in lines[:6]:
        if len(line) > 3 and not re.match(r'^[\d\s\-\/\.:]+$', line):
            vendor = line[:60]
            break

    # --- Amount: largest currency value found ---
    amount = None
    amount_patterns = [
        r'(?:TOTAL|JUMLAH|AMOUNT|BAYAR|GRAND\s*TOTAL|CHARGE)[^\d]*([\d,]+\.\d{2})',
        r'RM\s*([\d,]+\.\d{2})',
        r'MYR\s*([\d,]+\.\d{2})',
        r'\b([\d,]+\.\d{2})\b',
    ]
    for pat in amount_patterns:
        matches = re.findall(pat, text, re.IGNORECASE)
        if matches:
            vals = [float(m.replace(',', '')) for m in matches]
            amount = max(vals)
            break

    # --- Date: find most receipt-like date ---
    claim_date = None
    date_patterns = [
        r'(\d{4}[-/]\d{2}[-/]\d{2})',
        r'(\d{2}[-/]\d{2}[-/]\d{4})',
        r'(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4})',
        r'(\d{2}[-/]\d{2}[-/]\d{2})',
    ]
    for pat in date_patterns:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            raw_date = m.group(1)
            for fmt in ('%Y-%m-%d', '%Y/%m/%d', '%d-%m-%Y', '%d/%m/%Y',
                        '%d %b %Y', '%d %B %Y', '%d-%m-%y', '%d/%m/%y'):
                try:
                    claim_date = datetime.strptime(raw_date, fmt).strftime('%Y-%m-%d')
                    break
                except ValueError:
                    continue
            if claim_date:
                break

    # --- Claim type: keyword matching ---
    text_lower = text.lower()
    claim_type = "Other"
    for ctype, keywords in CLAIM_TYPE_KEYWORDS.items():
        if any(kw in text_lower for kw in keywords):
            claim_type = ctype
            break

    # --- Title and description ---
    title = f"{claim_type} - {vendor}" if vendor else claim_type
    description = vendor or ""

    return ExtractedClaim(
        title=title[:100],
        claim_type=claim_type,
        description=description[:200],
        amount=amount,
        claim_date=claim_date,
        vendor=vendor,
    )


async def _extract_from_image(file_bytes: bytes, mime_type: str) -> ExtractedClaim:
    try:
        raw_text = _ocr_text(file_bytes, mime_type)
        if not raw_text.strip():
            return ExtractedClaim()
        return _parse_receipt_text(raw_text)
    except Exception:
        return ExtractedClaim()


# ---------- Endpoints ----------

@router.post("/extract")
async def extract_from_receipt(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """Upload a receipt image/PDF and get AI-extracted claim details."""
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail="Only images and PDFs are allowed")
    content = await file.read()
    result = await _extract_from_image(content, file.content_type)
    return result


@router.post("/")
async def submit_claim(
    title: str = Form(...),
    claim_type: str = Form(...),
    description: str = Form(...),
    amount: float = Form(...),
    claim_date: str = Form(...),
    receipt: Optional[UploadFile] = File(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    receipt_url = None
    if receipt and receipt.filename:
        receipt_url = await _save_file(receipt)

    await db.execute(text("""
        INSERT INTO user_claims
          (user_id, tenant_id, title, claim_type, description, amount, claim_date, receipt_url, status)
        VALUES
          (:user_id, :tenant_id, :title, :claim_type, :description, :amount, :claim_date, :receipt_url, 'pending')
    """), {
        "user_id": current_user.id,
        "tenant_id": current_user.tenant_id,
        "title": title,
        "claim_type": claim_type,
        "description": description,
        "amount": amount,
        "claim_date": claim_date,
        "receipt_url": receipt_url,
    })
    await db.commit()
    return {"message": "Claim submitted successfully"}


@router.get("/my")
async def list_my_claims(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(text("""
        SELECT c.id, c.user_id, c.tenant_id, c.title, c.claim_type, c.description,
               c.amount, c.claim_date, c.receipt_url, c.status, c.rejection_reason,
               u.name as submitted_by_name, c.created_at
        FROM user_claims c
        LEFT JOIN users u ON u.id = c.user_id
        WHERE c.user_id = :user_id
        ORDER BY c.created_at DESC
    """), {"user_id": current_user.id})
    rows = result.fetchall()
    return [_row_to_dict(r) for r in rows]


@router.get("/all")
async def list_all_claims(
    status: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ("admin", "manager") and not current_user.is_super_admin:
        raise HTTPException(status_code=403, detail="Access denied")

    where = "WHERE 1=1"
    params: dict = {}
    if not current_user.is_super_admin:
        where += " AND c.tenant_id = :tenant_id"
        params["tenant_id"] = current_user.tenant_id
    if status:
        where += " AND c.status = :status"
        params["status"] = status

    result = await db.execute(text(f"""
        SELECT c.id, c.user_id, c.tenant_id, c.title, c.claim_type, c.description,
               c.amount, c.claim_date, c.receipt_url, c.status, c.rejection_reason,
               u.name as submitted_by_name, c.created_at
        FROM user_claims c
        LEFT JOIN users u ON u.id = c.user_id
        {where}
        ORDER BY c.created_at DESC
    """), params)
    rows = result.fetchall()
    return [_row_to_dict(r) for r in rows]


@router.patch("/{claim_id}/approve")
async def approve_claim(
    claim_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ("admin", "manager") and not current_user.is_super_admin:
        raise HTTPException(status_code=403, detail="Access denied")
    await db.execute(text("""
        UPDATE user_claims SET status='approved', approved_by=:by, approved_at=NOW()
        WHERE id=:id AND tenant_id=:tenant_id
    """), {"id": claim_id, "by": current_user.id, "tenant_id": current_user.tenant_id})
    await db.commit()
    return {"message": "Claim approved"}


@router.patch("/{claim_id}/reject")
async def reject_claim(
    claim_id: int,
    reason: str = Form(""),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ("admin", "manager") and not current_user.is_super_admin:
        raise HTTPException(status_code=403, detail="Access denied")
    await db.execute(text("""
        UPDATE user_claims SET status='rejected', rejection_reason=:reason, approved_by=:by, approved_at=NOW()
        WHERE id=:id AND tenant_id=:tenant_id
    """), {"id": claim_id, "reason": reason, "by": current_user.id, "tenant_id": current_user.tenant_id})
    await db.commit()
    return {"message": "Claim rejected"}


@router.delete("/{claim_id}")
async def delete_claim(
    claim_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await db.execute(text("""
        DELETE FROM user_claims WHERE id=:id AND user_id=:user_id AND status='pending'
    """), {"id": claim_id, "user_id": current_user.id})
    await db.commit()
    return {"message": "Claim deleted"}


def _row_to_dict(r) -> dict:
    return {
        "id": r.id,
        "user_id": r.user_id,
        "tenant_id": r.tenant_id,
        "title": r.title,
        "claim_type": r.claim_type,
        "description": r.description,
        "amount": float(r.amount),
        "claim_date": str(r.claim_date),
        "receipt_url": r.receipt_url,
        "status": r.status,
        "rejection_reason": r.rejection_reason,
        "submitted_by_name": r.submitted_by_name,
        "created_at": str(r.created_at),
    }
