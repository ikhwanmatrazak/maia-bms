import os
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional

from app.database import get_db
from app.models.payment import Payment
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
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = select(Payment).order_by(Payment.created_at.desc()).offset(skip).limit(limit)
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
