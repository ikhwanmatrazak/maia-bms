from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.quotation import Quotation
from app.models.invoice import Invoice
from app.models.receipt import Receipt
from app.models.settings import CompanySettings
from app.models.user import User
from app.middleware.auth import get_current_user

router = APIRouter(prefix="/verify", tags=["verification"])


@router.get("/{doc_type}/{doc_number}")
async def verify_document(
    doc_type: str,
    doc_number: str,
    db: AsyncSession = Depends(get_db),
):
    """Public endpoint for QR code document verification."""
    if doc_type == "quotation":
        result = await db.execute(
            select(Quotation).options(selectinload(Quotation.items)).where(
                Quotation.quotation_number == doc_number
            )
        )
        doc = result.scalar_one_or_none()
        if not doc:
            raise HTTPException(status_code=404, detail="Document not found")
        return {
            "type": "quotation",
            "number": doc.quotation_number,
            "status": doc.status,
            "issue_date": doc.issue_date.isoformat(),
            "total": float(doc.total),
            "currency": doc.currency,
            "valid": True,
        }

    elif doc_type == "invoice":
        result = await db.execute(
            select(Invoice).options(selectinload(Invoice.items)).where(
                Invoice.invoice_number == doc_number
            )
        )
        doc = result.scalar_one_or_none()
        if not doc:
            raise HTTPException(status_code=404, detail="Document not found")
        return {
            "type": "invoice",
            "number": doc.invoice_number,
            "status": doc.status,
            "issue_date": doc.issue_date.isoformat(),
            "due_date": doc.due_date.isoformat() if doc.due_date else None,
            "total": float(doc.total),
            "amount_paid": float(doc.amount_paid),
            "currency": doc.currency,
            "valid": True,
        }

    elif doc_type == "receipt":
        result = await db.execute(
            select(Receipt).where(Receipt.receipt_number == doc_number)
        )
        doc = result.scalar_one_or_none()
        if not doc:
            raise HTTPException(status_code=404, detail="Document not found")
        return {
            "type": "receipt",
            "number": doc.receipt_number,
            "amount": float(doc.amount),
            "payment_date": doc.payment_date.isoformat(),
            "payment_method": doc.payment_method,
            "currency": doc.currency,
            "valid": True,
        }

    else:
        raise HTTPException(status_code=400, detail="Invalid document type")
