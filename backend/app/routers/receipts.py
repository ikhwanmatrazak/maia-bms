from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
import io

from app.database import get_db
from app.models.receipt import Receipt
from app.models.settings import CompanySettings
from app.models.activity import Activity, ActivityType
from app.models.user import User
from app.schemas.document import ReceiptResponse
from app.middleware.auth import get_current_user

router = APIRouter(prefix="/receipts", tags=["receipts"])


@router.get("", response_model=List[ReceiptResponse])
async def list_receipts(
    client_id: Optional[int] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = select(Receipt)
    if client_id:
        query = query.where(Receipt.client_id == client_id)
    query = query.order_by(Receipt.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/{receipt_id}", response_model=ReceiptResponse)
async def get_receipt(
    receipt_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Receipt).where(Receipt.id == receipt_id))
    receipt = result.scalar_one_or_none()
    if not receipt:
        raise HTTPException(status_code=404, detail="Receipt not found")
    return receipt


@router.post("/{receipt_id}/send", response_model=ReceiptResponse)
async def send_receipt(
    receipt_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from datetime import datetime, timezone
    result = await db.execute(select(Receipt).where(Receipt.id == receipt_id))
    receipt = result.scalar_one_or_none()
    if not receipt:
        raise HTTPException(status_code=404, detail="Receipt not found")

    receipt.sent_at = datetime.now(timezone.utc)

    activity = Activity(
        client_id=receipt.client_id,
        user_id=current_user.id,
        type=ActivityType.email,
        description=f"Receipt {receipt.receipt_number} sent to client",
        occurred_at=datetime.now(timezone.utc),
    )
    db.add(activity)
    await db.commit()
    await db.refresh(receipt)
    return receipt


@router.get("/{receipt_id}/pdf")
async def get_receipt_pdf(
    receipt_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Receipt).where(Receipt.id == receipt_id))
    receipt = result.scalar_one_or_none()
    if not receipt:
        raise HTTPException(status_code=404, detail="Receipt not found")

    from app.services.pdf_service import generate_pdf
    settings_result = await db.execute(select(CompanySettings).limit(1))
    company = settings_result.scalar_one_or_none()
    pdf_bytes = await generate_pdf("receipt", receipt, company)
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{receipt.receipt_number}.pdf"'},
    )
