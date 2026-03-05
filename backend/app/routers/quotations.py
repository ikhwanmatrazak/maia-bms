from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from typing import List, Optional
from decimal import Decimal
import io

from app.database import get_db
from app.models.quotation import Quotation, QuotationItem, QuotationStatus
from app.models.invoice import Invoice, InvoiceItem, InvoiceStatus
from app.models.settings import TaxRate, CompanySettings
from app.models.activity import Activity, ActivityType
from app.models.user import User
from app.schemas.document import QuotationCreate, QuotationUpdate, QuotationResponse
from app.middleware.auth import get_current_user
from app.middleware.rbac import require_admin_or_manager, OwnershipChecker
from app.utils.tax import calculate_line_total, calculate_document_totals
from datetime import datetime, timezone

router = APIRouter(prefix="/quotations", tags=["quotations"])


async def _generate_quotation_number(db: AsyncSession) -> str:
    result = await db.execute(select(CompanySettings).limit(1))
    settings = result.scalar_one_or_none()
    prefix = (settings.quotation_prefix if settings else None) or "QT"
    year = datetime.now().year
    count_result = await db.execute(select(func.count(Quotation.id)))
    count = (count_result.scalar() or 0) + 1
    return f"{prefix}-{year}-{count:04d}"


async def _build_items(db: AsyncSession, items_data, doc_id: int, model_cls, id_field: str):
    items = []
    for i, item_data in enumerate(items_data):
        tax_rate_val = None
        if item_data.tax_rate_id:
            tr = await db.execute(select(TaxRate).where(TaxRate.id == item_data.tax_rate_id))
            tr_obj = tr.scalar_one_or_none()
            if tr_obj:
                tax_rate_val = Decimal(str(tr_obj.rate))

        calcs = calculate_line_total(item_data.quantity, item_data.unit_price, tax_rate_val)
        item = model_cls(
            **{id_field: doc_id},
            description=item_data.description,
            quantity=item_data.quantity,
            unit_price=item_data.unit_price,
            tax_rate_id=item_data.tax_rate_id,
            tax_amount=calcs["tax_amount"],
            line_total=calcs["line_total"],
            sort_order=item_data.sort_order if item_data.sort_order else i,
        )
        items.append(item)
    return items


@router.get("", response_model=List[QuotationResponse])
async def list_quotations(
    status: Optional[QuotationStatus] = Query(None),
    client_id: Optional[int] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = select(Quotation).options(selectinload(Quotation.items), selectinload(Quotation.client))
    query = query.where(Quotation.is_deleted != True)
    if not OwnershipChecker.can_view_all(current_user):
        query = query.where(Quotation.created_by == current_user.id)
    if status:
        query = query.where(Quotation.status == status)
    if client_id:
        query = query.where(Quotation.client_id == client_id)
    query = query.order_by(Quotation.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(query)
    return result.scalars().all()


@router.post("", response_model=QuotationResponse, status_code=status.HTTP_201_CREATED)
async def create_quotation(
    body: QuotationCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    number = await _generate_quotation_number(db)
    quotation = Quotation(
        quotation_number=number,
        client_id=body.client_id,
        currency=body.currency,
        exchange_rate=body.exchange_rate,
        issue_date=body.issue_date,
        expiry_date=body.expiry_date,
        discount_amount=body.discount_amount,
        notes=body.notes,
        terms_conditions=body.terms_conditions,
        payment_terms=body.payment_terms,
        template_id=body.template_id,
        created_by=current_user.id,
    )
    db.add(quotation)
    await db.flush()

    items_data = []
    for i, item_data in enumerate(body.items):
        tax_rate_val = None
        if item_data.tax_rate_id:
            tr = await db.execute(select(TaxRate).where(TaxRate.id == item_data.tax_rate_id))
            tr_obj = tr.scalar_one_or_none()
            if tr_obj:
                tax_rate_val = Decimal(str(tr_obj.rate))
        calcs = calculate_line_total(item_data.quantity, item_data.unit_price, tax_rate_val)
        items_data.append({
            "subtotal": calcs["subtotal"],
            "tax_amount": calcs["tax_amount"],
        })
        item = QuotationItem(
            quotation_id=quotation.id,
            description=item_data.description,
            quantity=item_data.quantity,
            unit_price=item_data.unit_price,
            tax_rate_id=item_data.tax_rate_id,
            tax_amount=calcs["tax_amount"],
            line_total=calcs["line_total"],
            sort_order=i,
        )
        db.add(item)

    totals = calculate_document_totals(items_data, body.discount_amount)
    quotation.subtotal = totals["subtotal"]
    quotation.tax_total = totals["tax_total"]
    quotation.total = totals["total"]

    await db.commit()
    result = await db.execute(
        select(Quotation).options(selectinload(Quotation.items), selectinload(Quotation.client)).where(Quotation.id == quotation.id)
    )
    return result.scalar_one()


@router.get("/{quotation_id}", response_model=QuotationResponse)
async def get_quotation(
    quotation_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Quotation).options(selectinload(Quotation.items), selectinload(Quotation.client)).where(Quotation.id == quotation_id)
    )
    quotation = result.scalar_one_or_none()
    if not quotation:
        raise HTTPException(status_code=404, detail="Quotation not found")
    if not OwnershipChecker.can_edit(current_user, quotation.created_by):
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    return quotation


@router.put("/{quotation_id}", response_model=QuotationResponse)
async def update_quotation(
    quotation_id: int,
    body: QuotationUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Quotation).options(selectinload(Quotation.items), selectinload(Quotation.client)).where(Quotation.id == quotation_id)
    )
    quotation = result.scalar_one_or_none()
    if not quotation:
        raise HTTPException(status_code=404, detail="Quotation not found")
    if not OwnershipChecker.can_edit(current_user, quotation.created_by):
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    update_data = body.model_dump(exclude_unset=True, exclude={"items"})
    for key, value in update_data.items():
        setattr(quotation, key, value)

    if body.items is not None:
        for item in quotation.items:
            await db.delete(item)
        items_data = []
        for i, item_data in enumerate(body.items):
            tax_rate_val = None
            if item_data.tax_rate_id:
                tr = await db.execute(select(TaxRate).where(TaxRate.id == item_data.tax_rate_id))
                tr_obj = tr.scalar_one_or_none()
                if tr_obj:
                    tax_rate_val = Decimal(str(tr_obj.rate))
            calcs = calculate_line_total(item_data.quantity, item_data.unit_price, tax_rate_val)
            items_data.append({"subtotal": calcs["subtotal"], "tax_amount": calcs["tax_amount"]})
            db.add(QuotationItem(
                quotation_id=quotation.id,
                description=item_data.description,
                quantity=item_data.quantity,
                unit_price=item_data.unit_price,
                tax_rate_id=item_data.tax_rate_id,
                tax_amount=calcs["tax_amount"],
                line_total=calcs["line_total"],
                sort_order=i,
            ))
        disc = body.discount_amount or quotation.discount_amount
        totals = calculate_document_totals(items_data, disc)
        quotation.subtotal = totals["subtotal"]
        quotation.tax_total = totals["tax_total"]
        quotation.total = totals["total"]

    await db.commit()
    result = await db.execute(
        select(Quotation).options(selectinload(Quotation.items), selectinload(Quotation.client)).where(Quotation.id == quotation_id)
    )
    return result.scalar_one()


@router.post("/{quotation_id}/send", response_model=QuotationResponse)
async def send_quotation(
    quotation_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Quotation).options(selectinload(Quotation.items), selectinload(Quotation.client)).where(Quotation.id == quotation_id)
    )
    quotation = result.scalar_one_or_none()
    if not quotation:
        raise HTTPException(status_code=404, detail="Quotation not found")

    quotation.status = QuotationStatus.sent
    quotation.sent_at = datetime.now(timezone.utc)

    activity = Activity(
        client_id=quotation.client_id,
        user_id=current_user.id,
        type=ActivityType.quote_sent,
        description=f"Quotation {quotation.quotation_number} sent to client",
        occurred_at=datetime.now(timezone.utc),
    )
    db.add(activity)
    await db.commit()
    result = await db.execute(
        select(Quotation).options(selectinload(Quotation.items), selectinload(Quotation.client)).where(Quotation.id == quotation_id)
    )
    return result.scalar_one()


@router.post("/{quotation_id}/convert", response_model=dict)
async def convert_to_invoice(
    quotation_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Quotation).options(selectinload(Quotation.items), selectinload(Quotation.client)).where(Quotation.id == quotation_id)
    )
    quotation = result.scalar_one_or_none()
    if not quotation:
        raise HTTPException(status_code=404, detail="Quotation not found")
    if quotation.status not in (QuotationStatus.sent, QuotationStatus.accepted):
        raise HTTPException(status_code=400, detail="Only sent or accepted quotations can be converted")

    # Generate invoice number
    settings_result = await db.execute(select(CompanySettings).limit(1))
    settings = settings_result.scalar_one_or_none()
    prefix = settings.invoice_prefix if settings else "INV"
    year = datetime.now().year
    count_result = await db.execute(select(func.count(Invoice.id)))
    count = (count_result.scalar() or 0) + 1
    invoice_number = f"{prefix}-{year}-{count:04d}"

    from app.config import get_settings
    app_settings = get_settings()
    payment_terms = settings.default_payment_terms if settings else 30

    from datetime import timedelta
    due_date = datetime.now(timezone.utc) + timedelta(days=payment_terms)

    invoice = Invoice(
        invoice_number=invoice_number,
        quotation_id=quotation.id,
        client_id=quotation.client_id,
        currency=quotation.currency,
        exchange_rate=quotation.exchange_rate,
        issue_date=datetime.now(timezone.utc),
        due_date=due_date,
        subtotal=quotation.subtotal,
        discount_amount=quotation.discount_amount,
        tax_total=quotation.tax_total,
        total=quotation.total,
        balance_due=quotation.total,
        notes=quotation.notes,
        terms_conditions=quotation.terms_conditions,
        template_id=quotation.template_id,
        created_by=current_user.id,
    )
    db.add(invoice)
    await db.flush()

    for q_item in quotation.items:
        db.add(InvoiceItem(
            invoice_id=invoice.id,
            description=q_item.description,
            quantity=q_item.quantity,
            unit_price=q_item.unit_price,
            tax_rate_id=q_item.tax_rate_id,
            tax_amount=q_item.tax_amount,
            line_total=q_item.line_total,
            sort_order=q_item.sort_order,
        ))

    quotation.status = QuotationStatus.accepted
    quotation.accepted_at = datetime.now(timezone.utc)
    await db.commit()
    return {"invoice_id": invoice.id, "invoice_number": invoice_number}


@router.get("/{quotation_id}/pdf")
async def get_quotation_pdf(
    quotation_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Quotation)
        .options(selectinload(Quotation.items), selectinload(Quotation.client))
        .where(Quotation.id == quotation_id)
    )
    quotation = result.scalar_one_or_none()
    if not quotation:
        raise HTTPException(status_code=404, detail="Quotation not found")

    from app.services.pdf_service import generate_pdf
    import json as _json
    settings_result = await db.execute(select(CompanySettings).limit(1))
    company = settings_result.scalar_one_or_none()
    template_style = "professional"
    if quotation.template_id:
        from app.models.settings import DocumentTemplate
        tmpl_result = await db.execute(select(DocumentTemplate).where(DocumentTemplate.id == quotation.template_id))
        tmpl = tmpl_result.scalar_one_or_none()
        if tmpl and tmpl.template_json:
            try:
                template_style = _json.loads(tmpl.template_json).get("style", "professional")
            except Exception:
                pass
    pdf_bytes = await generate_pdf("quotation", quotation, company, template_style)
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{quotation.quotation_number}.pdf"'},
    )


@router.post("/{quotation_id}/duplicate", response_model=QuotationResponse, status_code=status.HTTP_201_CREATED)
async def duplicate_quotation(
    quotation_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Quotation).options(selectinload(Quotation.items), selectinload(Quotation.client)).where(Quotation.id == quotation_id)
    )
    original = result.scalar_one_or_none()
    if not original:
        raise HTTPException(status_code=404, detail="Quotation not found")

    number = await _generate_quotation_number(db)
    new_q = Quotation(
        quotation_number=number,
        client_id=original.client_id,
        currency=original.currency,
        exchange_rate=original.exchange_rate,
        issue_date=datetime.now(timezone.utc),
        expiry_date=original.expiry_date,
        discount_amount=original.discount_amount,
        subtotal=original.subtotal,
        tax_total=original.tax_total,
        total=original.total,
        notes=original.notes,
        terms_conditions=original.terms_conditions,
        payment_terms=original.payment_terms,
        template_id=original.template_id,
        created_by=current_user.id,
    )
    db.add(new_q)
    await db.flush()

    for item in original.items:
        db.add(QuotationItem(
            quotation_id=new_q.id,
            description=item.description,
            quantity=item.quantity,
            unit_price=item.unit_price,
            tax_rate_id=item.tax_rate_id,
            tax_amount=item.tax_amount,
            line_total=item.line_total,
            sort_order=item.sort_order,
        ))

    await db.commit()
    result = await db.execute(
        select(Quotation).options(selectinload(Quotation.items), selectinload(Quotation.client)).where(Quotation.id == new_q.id)
    )
    return result.scalar_one()


@router.delete("/{quotation_id}", status_code=204)
async def delete_quotation(
    quotation_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Quotation).where(Quotation.id == quotation_id))
    quotation = result.scalar_one_or_none()
    if not quotation:
        raise HTTPException(status_code=404, detail="Quotation not found")
    if not OwnershipChecker.can_edit(current_user, quotation.created_by):
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    quotation.is_deleted = True
    await db.commit()
