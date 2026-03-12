from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from typing import List, Optional
import io
from decimal import Decimal
from datetime import datetime, timezone

from app.database import get_db
from app.models.credit_note import CreditNote, CreditNoteItem, CreditNoteStatus
from app.models.client import Client
from app.models.invoice import Invoice
from app.models.settings import TaxRate, CompanySettings
from app.models.user import User
from app.schemas.credit_note import CreditNoteCreate, CreditNoteUpdate, CreditNoteResponse
from app.middleware.auth import get_current_user
from app.middleware.rbac import get_effective_tenant_id, apply_tenant_filter
from app.utils.tax import calculate_line_total, calculate_document_totals

router = APIRouter(prefix="/credit-notes", tags=["credit-notes"])


async def _generate_credit_note_number(db: AsyncSession, tenant_id) -> str:
    result = await db.execute(select(CompanySettings).where(CompanySettings.tenant_id == tenant_id).limit(1))
    settings = result.scalar_one_or_none()
    if settings is None:
        result = await db.execute(select(CompanySettings).limit(1))
        settings = result.scalar_one_or_none()

    prefix = "CN"
    year = datetime.now().year

    count_result = await db.execute(
        select(func.count(CreditNote.id)).where(CreditNote.is_deleted == False)
    )
    count = count_result.scalar() or 0
    return f"{prefix}-{year}-{str(count + 1).zfill(4)}"


async def _build_items(items_data, db: AsyncSession):
    built = []
    for i, item in enumerate(items_data):
        tax_rate_val = None
        if item.tax_rate_id:
            tr = await db.get(TaxRate, item.tax_rate_id)
            if tr:
                tax_rate_val = Decimal(str(tr.rate))
        calc = calculate_line_total(
            Decimal(str(item.quantity)),
            Decimal(str(item.unit_price)),
            tax_rate_val,
        )
        built.append({
            "description": item.description,
            "quantity": item.quantity,
            "unit_price": item.unit_price,
            "tax_rate_id": item.tax_rate_id,
            "tax_amount": calc["tax_amount"],
            "line_total": calc["line_total"],
            "sort_order": item.sort_order if item.sort_order is not None else i,
            "_subtotal": calc["subtotal"],
            "_tax_amount": calc["tax_amount"],
        })
    return built


@router.get("", response_model=List[CreditNoteResponse])
async def list_credit_notes(
    client_id: Optional[int] = Query(None),
    status: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = (
        select(CreditNote)
        .options(selectinload(CreditNote.client), selectinload(CreditNote.items))
        .where(CreditNote.is_deleted == False)
        .order_by(CreditNote.created_at.desc())
    )
    query = apply_tenant_filter(query, CreditNote, current_user)
    if client_id:
        query = query.where(CreditNote.client_id == client_id)
    if status:
        query = query.where(CreditNote.status == status)
    if search:
        query = query.join(Client).where(
            CreditNote.credit_note_number.ilike(f"%{search}%") |
            Client.company_name.ilike(f"%{search}%")
        )
    result = await db.execute(query)
    return result.scalars().all()


@router.post("", response_model=CreditNoteResponse, status_code=201)
async def create_credit_note(
    data: CreditNoteCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    eff_tenant = get_effective_tenant_id(current_user)

    # Validate client
    client = await db.get(Client, data.client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    cn_number = await _generate_credit_note_number(db, eff_tenant)

    built_items = await _build_items(data.items, db)
    totals = calculate_document_totals([
        {"subtotal": it["_subtotal"], "tax_amount": it["_tax_amount"]} for it in built_items
    ])

    cn = CreditNote(
        tenant_id=eff_tenant,
        credit_note_number=cn_number,
        client_id=data.client_id,
        invoice_id=data.invoice_id,
        currency=data.currency,
        issue_date=data.issue_date,
        reason=data.reason,
        notes=data.notes,
        subtotal=totals["subtotal"],
        tax_total=totals["tax_total"],
        total=totals["total"],
        amount_used=Decimal("0.00"),
        available_balance=totals["total"],
        created_by=current_user.id,
    )
    db.add(cn)
    await db.flush()

    for it in built_items:
        db.add(CreditNoteItem(
            credit_note_id=cn.id,
            description=it["description"],
            quantity=it["quantity"],
            unit_price=it["unit_price"],
            tax_rate_id=it["tax_rate_id"],
            tax_amount=it["tax_amount"],
            line_total=it["line_total"],
            sort_order=it["sort_order"],
        ))

    await db.commit()
    await db.refresh(cn)
    result = await db.execute(
        select(CreditNote)
        .options(selectinload(CreditNote.client), selectinload(CreditNote.items))
        .where(CreditNote.id == cn.id)
    )
    return result.scalar_one()


@router.get("/{cn_id}", response_model=CreditNoteResponse)
async def get_credit_note(
    cn_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(CreditNote)
        .options(selectinload(CreditNote.client), selectinload(CreditNote.items))
        .where(CreditNote.id == cn_id, CreditNote.is_deleted == False)
    )
    cn = result.scalar_one_or_none()
    if not cn:
        raise HTTPException(status_code=404, detail="Credit note not found")
    eff_tenant = get_effective_tenant_id(current_user)
    if eff_tenant is not None and cn.tenant_id != eff_tenant:
        raise HTTPException(status_code=403, detail="Access denied")
    return cn


@router.put("/{cn_id}", response_model=CreditNoteResponse)
async def update_credit_note(
    cn_id: int,
    data: CreditNoteUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(CreditNote)
        .options(selectinload(CreditNote.client), selectinload(CreditNote.items))
        .where(CreditNote.id == cn_id, CreditNote.is_deleted == False)
    )
    cn = result.scalar_one_or_none()
    if not cn:
        raise HTTPException(status_code=404, detail="Credit note not found")
    eff_tenant = get_effective_tenant_id(current_user)
    if eff_tenant is not None and cn.tenant_id != eff_tenant:
        raise HTTPException(status_code=403, detail="Access denied")
    if cn.status == CreditNoteStatus.cancelled:
        raise HTTPException(status_code=400, detail="Cannot edit a cancelled credit note")

    update_data = data.model_dump(exclude_unset=True)
    items_data = update_data.pop("items", None)

    for field, value in update_data.items():
        setattr(cn, field, value)

    if items_data is not None:
        # Replace items
        for old_item in cn.items:
            await db.delete(old_item)
        await db.flush()

        built_items = await _build_items(data.items or [], db)
        totals = calculate_document_totals([
            {"subtotal": it["_subtotal"], "tax_amount": it["_tax_amount"]} for it in built_items
        ])
        cn.subtotal = totals["subtotal"]
        cn.tax_total = totals["tax_total"]
        cn.total = totals["total"]
        cn.available_balance = totals["total"] - cn.amount_used

        for it in built_items:
            db.add(CreditNoteItem(
                credit_note_id=cn.id,
                description=it["description"],
                quantity=it["quantity"],
                unit_price=it["unit_price"],
                tax_rate_id=it["tax_rate_id"],
                tax_amount=it["tax_amount"],
                line_total=it["line_total"],
                sort_order=it["sort_order"],
            ))

    await db.commit()
    result = await db.execute(
        select(CreditNote)
        .options(selectinload(CreditNote.client), selectinload(CreditNote.items))
        .where(CreditNote.id == cn.id)
    )
    return result.scalar_one()


@router.post("/{cn_id}/issue", response_model=CreditNoteResponse)
async def issue_credit_note(
    cn_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(CreditNote)
        .options(selectinload(CreditNote.client), selectinload(CreditNote.items))
        .where(CreditNote.id == cn_id, CreditNote.is_deleted == False)
    )
    cn = result.scalar_one_or_none()
    if not cn:
        raise HTTPException(status_code=404, detail="Credit note not found")
    eff_tenant = get_effective_tenant_id(current_user)
    if eff_tenant is not None and cn.tenant_id != eff_tenant:
        raise HTTPException(status_code=403, detail="Access denied")
    if cn.status != CreditNoteStatus.draft:
        raise HTTPException(status_code=400, detail="Only draft credit notes can be issued")
    cn.status = CreditNoteStatus.issued
    await db.commit()
    await db.refresh(cn)
    return cn


@router.post("/{cn_id}/cancel", response_model=CreditNoteResponse)
async def cancel_credit_note(
    cn_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(CreditNote)
        .options(selectinload(CreditNote.client), selectinload(CreditNote.items))
        .where(CreditNote.id == cn_id, CreditNote.is_deleted == False)
    )
    cn = result.scalar_one_or_none()
    if not cn:
        raise HTTPException(status_code=404, detail="Credit note not found")
    eff_tenant = get_effective_tenant_id(current_user)
    if eff_tenant is not None and cn.tenant_id != eff_tenant:
        raise HTTPException(status_code=403, detail="Access denied")
    if cn.status == CreditNoteStatus.applied:
        raise HTTPException(status_code=400, detail="Cannot cancel a fully applied credit note")
    cn.status = CreditNoteStatus.cancelled
    await db.commit()
    await db.refresh(cn)
    return cn


@router.get("/{cn_id}/pdf")
async def get_credit_note_pdf(
    cn_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(CreditNote)
        .options(
            selectinload(CreditNote.client),
            selectinload(CreditNote.items),
            selectinload(CreditNote.invoice),
        )
        .where(CreditNote.id == cn_id, CreditNote.is_deleted == False)
    )
    cn = result.scalar_one_or_none()
    if not cn:
        raise HTTPException(status_code=404, detail="Credit note not found")

    from app.services.pdf_service import generate_pdf
    settings_result = await db.execute(
        select(CompanySettings).where(CompanySettings.tenant_id == cn.tenant_id).limit(1)
    )
    company = settings_result.scalar_one_or_none()
    if company is None:
        fb = await db.execute(select(CompanySettings).limit(1))
        company = fb.scalar_one_or_none()

    pdf_bytes = await generate_pdf("credit_note", cn, company, "professional")
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{cn.credit_note_number}.pdf"'},
    )


@router.delete("/{cn_id}", status_code=204)
async def delete_credit_note(
    cn_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(CreditNote).where(CreditNote.id == cn_id))
    cn = result.scalar_one_or_none()
    if not cn:
        raise HTTPException(status_code=404, detail="Credit note not found")
    eff_tenant = get_effective_tenant_id(current_user)
    if eff_tenant is not None and cn.tenant_id != eff_tenant:
        raise HTTPException(status_code=403, detail="Access denied")
    cn.is_deleted = True
    await db.commit()
