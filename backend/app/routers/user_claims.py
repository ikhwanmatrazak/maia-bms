import asyncio
import base64
import io
import re
import uuid
from datetime import datetime
from typing import List, Optional
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import Response
from jinja2 import Environment, FileSystemLoader
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from pydantic import BaseModel
from weasyprint import HTML

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


@router.post("")
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


@router.post("/on-behalf")
async def submit_claim_on_behalf(
    on_behalf_of_user_id: int = Form(...),
    title: str = Form(...),
    claim_type: str = Form(...),
    description: str = Form(...),
    amount: float = Form(...),
    claim_date: str = Form(...),
    receipt: Optional[UploadFile] = File(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ("admin", "manager") and not current_user.is_super_admin:
        raise HTTPException(status_code=403, detail="Access denied")

    # Resolve target user tenant
    target = await db.execute(
        text("SELECT id, tenant_id FROM users WHERE id=:uid"), {"uid": on_behalf_of_user_id}
    )
    target_row = target.fetchone()
    if not target_row:
        raise HTTPException(status_code=404, detail="User not found")

    receipt_url = None
    if receipt and receipt.filename:
        receipt_url = await _save_file(receipt)

    await db.execute(text("""
        INSERT INTO user_claims
          (user_id, tenant_id, title, claim_type, description, amount, claim_date, receipt_url, status)
        VALUES
          (:user_id, :tenant_id, :title, :claim_type, :description, :amount, :claim_date, :receipt_url, 'pending')
    """), {
        "user_id": target_row.id,
        "tenant_id": target_row.tenant_id,
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


# ═══════════════════════════════════════════════════════════════════
#  Monthly Claims
# ═══════════════════════════════════════════════════════════════════

MONTH_NAMES = [
    "", "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
]


class GenerateMonthlyBody(BaseModel):
    year: int
    month: int  # 1–12


class RejectMonthlyBody(BaseModel):
    reason: str = ""


def _mc_row_to_dict(r) -> dict:
    return {
        "id": r[0],
        "user_id": r[1],
        "tenant_id": r[2],
        "year": r[3],
        "month": r[4],
        "total_amount": float(r[5]),
        "claim_count": int(r[6]),
        "status": r[7],
        "submitted_at": str(r[8]) if r[8] else None,
        "approved_by": r[9],
        "approved_at": str(r[10]) if r[10] else None,
        "rejection_reason": r[11],
        "submitted_by_name": r[12],
        "created_at": str(r[13]),
    }


_MC_SELECT = """
    SELECT mc.id, mc.user_id, mc.tenant_id, mc.year, mc.month,
           mc.total_amount, mc.claim_count, mc.status,
           mc.submitted_at, mc.approved_by, mc.approved_at,
           mc.rejection_reason, u.name, mc.created_at
    FROM monthly_claims mc
    LEFT JOIN users u ON u.id = mc.user_id
"""


@router.post("/monthly/generate")
async def generate_monthly_claim(
    body: GenerateMonthlyBody,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create or return existing monthly claim record for the given year/month."""
    if not (1 <= body.month <= 12):
        raise HTTPException(status_code=400, detail="month must be 1–12")

    # Check if already exists
    existing = await db.execute(
        text("SELECT id FROM monthly_claims WHERE user_id=:uid AND year=:y AND month=:m"),
        {"uid": current_user.id, "y": body.year, "m": body.month},
    )
    row = existing.fetchone()

    if row:
        mc_id = row[0]
    else:
        # Calculate totals from individual claims for that month
        totals = await db.execute(
            text("""
                SELECT COUNT(*), COALESCE(SUM(amount), 0)
                FROM user_claims
                WHERE user_id=:uid AND YEAR(claim_date)=:y AND MONTH(claim_date)=:m
            """),
            {"uid": current_user.id, "y": body.year, "m": body.month},
        )
        count, total = totals.fetchone()
        r = await db.execute(
            text("""
                INSERT INTO monthly_claims
                  (user_id, tenant_id, year, month, total_amount, claim_count, status)
                VALUES (:uid, :tid, :y, :m, :total, :count, 'draft')
            """),
            {
                "uid": current_user.id, "tid": current_user.tenant_id,
                "y": body.year, "m": body.month,
                "total": float(total), "count": int(count),
            },
        )
        await db.commit()
        mc_id = r.lastrowid

    mc = await db.execute(text(f"{_MC_SELECT} WHERE mc.id=:id"), {"id": mc_id})
    return _mc_row_to_dict(mc.fetchone())


@router.get("/monthly")
async def list_my_monthly_claims(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        text(f"{_MC_SELECT} WHERE mc.user_id=:uid ORDER BY mc.year DESC, mc.month DESC"),
        {"uid": current_user.id},
    )
    return [_mc_row_to_dict(r) for r in result.fetchall()]


@router.get("/monthly/all")
async def list_all_monthly_claims(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ("admin", "manager") and not current_user.is_super_admin:
        raise HTTPException(status_code=403, detail="Access denied")
    where = "" if current_user.is_super_admin else "WHERE mc.tenant_id=:tid"
    params = {} if current_user.is_super_admin else {"tid": current_user.tenant_id}
    result = await db.execute(
        text(f"{_MC_SELECT} {where} ORDER BY mc.year DESC, mc.month DESC, u.name"),
        params,
    )
    return [_mc_row_to_dict(r) for r in result.fetchall()]


@router.patch("/monthly/{mc_id}/submit")
async def submit_monthly_claim(
    mc_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await db.execute(
        text("""
            UPDATE monthly_claims
            SET status='submitted', submitted_at=NOW()
            WHERE id=:id AND user_id=:uid AND status='draft'
        """),
        {"id": mc_id, "uid": current_user.id},
    )
    await db.commit()
    return {"message": "Submitted"}


@router.patch("/monthly/{mc_id}/approve")
async def approve_monthly_claim(
    mc_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ("admin", "manager") and not current_user.is_super_admin:
        raise HTTPException(status_code=403, detail="Access denied")
    await db.execute(
        text("""
            UPDATE monthly_claims
            SET status='approved', approved_by=:by, approved_at=NOW()
            WHERE id=:id
        """),
        {"id": mc_id, "by": current_user.id},
    )
    await db.commit()
    return {"message": "Approved"}


@router.patch("/monthly/{mc_id}/reject")
async def reject_monthly_claim(
    mc_id: int,
    body: RejectMonthlyBody,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ("admin", "manager") and not current_user.is_super_admin:
        raise HTTPException(status_code=403, detail="Access denied")
    await db.execute(
        text("""
            UPDATE monthly_claims
            SET status='rejected', rejection_reason=:reason, approved_by=:by, approved_at=NOW()
            WHERE id=:id
        """),
        {"id": mc_id, "reason": body.reason, "by": current_user.id},
    )
    await db.commit()
    return {"message": "Rejected"}


# ── PDF generation ────────────────────────────────────────────────

def _receipt_images(receipt_relative_url: Optional[str], upload_dir: str) -> List[str]:
    """Return list of base64 data-URIs for a receipt (1 for image, N for PDF pages)."""
    if not receipt_relative_url:
        return []
    path = Path(upload_dir) / receipt_relative_url
    if not path.exists():
        return []
    suffix = path.suffix.lower()
    try:
        if suffix == ".pdf":
            import pdfplumber
            results = []
            with pdfplumber.open(path) as pdf:
                for page in pdf.pages[:6]:
                    img = page.to_image(resolution=100).original
                    buf = io.BytesIO()
                    img.save(buf, format="JPEG", quality=70)
                    results.append(
                        f"data:image/jpeg;base64,{base64.b64encode(buf.getvalue()).decode()}"
                    )
            return results
        mime_map = {".jpg": "image/jpeg", ".jpeg": "image/jpeg",
                    ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif"}
        mime = mime_map.get(suffix)
        if not mime:
            return []
        data = base64.b64encode(path.read_bytes()).decode()
        return [f"data:{mime};base64,{data}"]
    except Exception:
        return []


@router.get("/monthly/{mc_id}/pdf")
async def download_monthly_claim_pdf(
    mc_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    settings = get_settings()
    upload_dir = settings.upload_dir

    # Fetch monthly claim record (own or admin)
    mc_row = await db.execute(
        text(f"{_MC_SELECT} WHERE mc.id=:id"),
        {"id": mc_id},
    )
    mc = mc_row.fetchone()
    if not mc:
        raise HTTPException(status_code=404, detail="Monthly claim not found")

    # Access control: own record OR admin/manager of same tenant
    is_own = mc[1] == current_user.id
    is_admin = current_user.role in ("admin", "manager") or current_user.is_super_admin
    if not is_own and not is_admin:
        raise HTTPException(status_code=403, detail="Access denied")

    mc_dict = _mc_row_to_dict(mc)
    year, month = mc_dict["year"], mc_dict["month"]

    # Fetch individual claims for this user/month
    claims_r = await db.execute(
        text("""
            SELECT id, title, claim_type, description, amount, claim_date,
                   receipt_url, status
            FROM user_claims
            WHERE user_id=:uid AND YEAR(claim_date)=:y AND MONTH(claim_date)=:m
            ORDER BY claim_date
        """),
        {"uid": mc_dict["user_id"], "y": year, "m": month},
    )
    claims = [
        {
            "id": r[0], "title": r[1], "claim_type": r[2],
            "description": r[3], "amount": float(r[4]),
            "claim_date": str(r[5]), "receipt_url": r[6], "status": r[7],
            "receipt_images": _receipt_images(r[6], upload_dir),
        }
        for r in claims_r.fetchall()
    ]

    # Fetch employee profile (linked via user_id)
    emp_r = await db.execute(
        text("""
            SELECT e.full_name, e.employee_no, e.designation, e.email, e.phone,
                   d.name AS dept_name
            FROM hr_employees e
            LEFT JOIN hr_departments d ON d.id = e.department_id
            WHERE e.user_id=:uid
            LIMIT 1
        """),
        {"uid": mc_dict["user_id"]},
    )
    emp = emp_r.mappings().first()

    # Fetch company settings
    tid = mc_dict["tenant_id"]
    cs_r = await db.execute(
        text("SELECT name, logo_url, address, phone, email FROM company_settings WHERE tenant_id=:tid OR tenant_id IS NULL ORDER BY tenant_id DESC LIMIT 1"),
        {"tid": tid},
    )
    company = cs_r.mappings().first()

    # Logo as data URI
    logo_data = None
    if company and company.get("logo_url"):
        raw = company["logo_url"]
        if raw.startswith("data:"):
            logo_data = raw
        else:
            logo_path = Path(upload_dir) / raw.lstrip("/")
            if logo_path.exists():
                ext = logo_path.suffix.lower()
                mime = "image/png" if ext == ".png" else "image/jpeg"
                logo_data = f"data:{mime};base64,{base64.b64encode(logo_path.read_bytes()).decode()}"

    context = {
        "mc": mc_dict,
        "year": year,
        "month_name": MONTH_NAMES[month],
        "claims": claims,
        "total_amount": sum(c["amount"] for c in claims),
        "employee": dict(emp) if emp else {"full_name": mc_dict["submitted_by_name"] or "—"},
        "company": dict(company) if company else {},
        "logo_data": logo_data,
        "generated_at": datetime.now().strftime("%d %B %Y %H:%M"),
    }

    templates_dir = Path(__file__).parent.parent / "templates" / "pdf"
    jinja_env = Environment(loader=FileSystemLoader(str(templates_dir)), autoescape=False)
    template = jinja_env.get_template("monthly_claim.html")
    html_content = template.render(**context)

    loop = asyncio.get_event_loop()
    pdf_bytes = await loop.run_in_executor(None, lambda: HTML(string=html_content).write_pdf())

    emp_name = (emp["full_name"] if emp else mc_dict["submitted_by_name"] or "claim").replace(" ", "_")
    filename = f"Monthly_Claim_{year}_{month:02d}_{emp_name}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
