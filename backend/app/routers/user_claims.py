import os
import base64
import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Optional, List
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from pydantic import BaseModel

from app.database import get_db
from app.middleware.auth import get_current_user
from app.middleware.rbac import apply_tenant_filter
from app.models.user import User
from app.config import get_settings

router = APIRouter(prefix="/user-claims", tags=["user-claims"])

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


# ---------- AI Extraction ----------

async def _extract_from_image(file_bytes: bytes, mime_type: str) -> ExtractedClaim:
    settings = get_settings()
    if not settings.anthropic_api_key:
        return ExtractedClaim()

    try:
        import anthropic
        client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

        # For PDF, try to extract text first page image
        if mime_type == "application/pdf":
            try:
                import pdfplumber, io
                with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
                    text_content = "\n".join(page.extract_text() or "" for page in pdf.pages[:2])
                if text_content.strip():
                    msg = client.messages.create(
                        model="claude-haiku-4-5-20251001",
                        max_tokens=512,
                        messages=[{
                            "role": "user",
                            "content": f"""Extract claim details from this receipt/invoice text. Return ONLY valid JSON with these keys (use null if not found):
{{"title": "short title", "claim_type": "Meals|Travel|Accommodation|Office Supplies|Medical|Petrol|Parking|Other", "description": "brief description", "amount": 0.00, "claim_date": "YYYY-MM-DD", "vendor": "vendor name"}}

Receipt text:
{text_content[:3000]}"""
                        }]
                    )
                    import json
                    raw = msg.content[0].text.strip()
                    start, end = raw.find("{"), raw.rfind("}") + 1
                    data = json.loads(raw[start:end])
                    return ExtractedClaim(**{k: v for k, v in data.items() if v is not None})
            except Exception:
                pass
            return ExtractedClaim()

        # Image — use vision
        b64 = base64.standard_b64encode(file_bytes).decode()
        msg = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=512,
            messages=[{
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {"type": "base64", "media_type": mime_type, "data": b64}
                    },
                    {
                        "type": "text",
                        "text": """Extract claim details from this receipt/invoice image. Return ONLY valid JSON with these keys (use null if not found):
{"title": "short title", "claim_type": "Meals|Travel|Accommodation|Office Supplies|Medical|Petrol|Parking|Other", "description": "brief description", "amount": 0.00, "claim_date": "YYYY-MM-DD", "vendor": "vendor name"}"""
                    }
                ]
            }]
        )
        import json
        raw = msg.content[0].text.strip()
        start, end = raw.find("{"), raw.rfind("}") + 1
        data = json.loads(raw[start:end])
        return ExtractedClaim(**{k: v for k, v in data.items() if v is not None})
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
