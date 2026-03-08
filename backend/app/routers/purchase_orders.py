from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from typing import List, Optional
from decimal import Decimal
import io

from app.database import get_db
from app.models.purchase_order import PurchaseOrder, PurchaseOrderItem, PurchaseOrderStatus
from app.models.settings import TaxRate, CompanySettings
from app.models.user import User
from app.schemas.purchase_order import PurchaseOrderCreate, PurchaseOrderUpdate, PurchaseOrderResponse
from app.middleware.auth import get_current_user
from app.middleware.rbac import require_admin_or_manager, OwnershipChecker, apply_tenant_filter
from app.utils.tax import calculate_line_total, calculate_document_totals
from datetime import datetime, timezone

router = APIRouter(prefix="/purchase-orders", tags=["purchase-orders"])


async def _generate_po_number(db: AsyncSession) -> str:
    result = await db.execute(select(CompanySettings).limit(1))
    settings = result.scalar_one_or_none()
    prefix = (getattr(settings, "po_prefix", None) if settings else None) or "PO"
    year = datetime.now().year
    count_result = await db.execute(select(func.count(PurchaseOrder.id)))
    count = (count_result.scalar() or 0) + 1
    return f"{prefix}-{year}-{count:04d}"


def _load_po(po_id: int):
    return select(PurchaseOrder).options(selectinload(PurchaseOrder.items)).where(PurchaseOrder.id == po_id)


@router.get("", response_model=List[PurchaseOrderResponse])
async def list_purchase_orders(
    status: Optional[PurchaseOrderStatus] = Query(None),
    search: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = select(PurchaseOrder).options(selectinload(PurchaseOrder.items))
    query = apply_tenant_filter(query, PurchaseOrder, current_user)
    query = query.where(PurchaseOrder.is_deleted != True)
    if not OwnershipChecker.can_view_all(current_user):
        query = query.where(PurchaseOrder.created_by == current_user.id)
    if status:
        query = query.where(PurchaseOrder.status == status)
    if search:
        query = query.where(
            PurchaseOrder.po_number.ilike(f"%{search}%") |
            PurchaseOrder.vendor_name.ilike(f"%{search}%")
        )
    query = query.order_by(PurchaseOrder.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(query)
    return result.scalars().all()


@router.post("", response_model=PurchaseOrderResponse, status_code=status.HTTP_201_CREATED)
async def create_purchase_order(
    body: PurchaseOrderCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    number = await _generate_po_number(db)
    po = PurchaseOrder(
        po_number=number,
        vendor_name=body.vendor_name,
        vendor_email=body.vendor_email,
        vendor_phone=body.vendor_phone,
        vendor_address=body.vendor_address,
        currency=body.currency,
        exchange_rate=body.exchange_rate,
        issue_date=body.issue_date,
        expected_delivery_date=body.expected_delivery_date,
        discount_amount=body.discount_amount,
        notes=body.notes,
        terms_conditions=body.terms_conditions,
        created_by=current_user.id,
        tenant_id=current_user.tenant_id,
    )
    db.add(po)
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
        items_data.append({"subtotal": calcs["subtotal"], "tax_amount": calcs["tax_amount"]})
        db.add(PurchaseOrderItem(
            purchase_order_id=po.id,
            description=item_data.description,
            quantity=item_data.quantity,
            unit_price=item_data.unit_price,
            tax_rate_id=item_data.tax_rate_id,
            tax_amount=calcs["tax_amount"],
            line_total=calcs["line_total"],
            sort_order=i,
        ))

    totals = calculate_document_totals(items_data, body.discount_amount)
    po.subtotal = totals["subtotal"]
    po.tax_total = totals["tax_total"]
    po.total = totals["total"]

    await db.commit()
    result = await db.execute(_load_po(po.id))
    return result.scalar_one()


@router.get("/{po_id}", response_model=PurchaseOrderResponse)
async def get_purchase_order(
    po_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(_load_po(po_id))
    po = result.scalar_one_or_none()
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    if not OwnershipChecker.can_edit(current_user, po.created_by):
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    return po


@router.put("/{po_id}", response_model=PurchaseOrderResponse)
async def update_purchase_order(
    po_id: int,
    body: PurchaseOrderUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(_load_po(po_id))
    po = result.scalar_one_or_none()
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    if not OwnershipChecker.can_edit(current_user, po.created_by):
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    update_data = body.model_dump(exclude_unset=True, exclude={"items"})
    for key, value in update_data.items():
        setattr(po, key, value)

    if body.items is not None:
        for item in po.items:
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
            db.add(PurchaseOrderItem(
                purchase_order_id=po.id,
                description=item_data.description,
                quantity=item_data.quantity,
                unit_price=item_data.unit_price,
                tax_rate_id=item_data.tax_rate_id,
                tax_amount=calcs["tax_amount"],
                line_total=calcs["line_total"],
                sort_order=i,
            ))
        disc = body.discount_amount or po.discount_amount
        totals = calculate_document_totals(items_data, disc)
        po.subtotal = totals["subtotal"]
        po.tax_total = totals["tax_total"]
        po.total = totals["total"]

    await db.commit()
    result = await db.execute(_load_po(po_id))
    return result.scalar_one()


@router.post("/{po_id}/send", response_model=PurchaseOrderResponse)
async def send_purchase_order(
    po_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(_load_po(po_id))
    po = result.scalar_one_or_none()
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    po.status = PurchaseOrderStatus.sent
    po.sent_at = datetime.now(timezone.utc)
    await db.commit()
    result = await db.execute(_load_po(po_id))
    return result.scalar_one()


@router.post("/{po_id}/receive", response_model=PurchaseOrderResponse)
async def receive_purchase_order(
    po_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(_load_po(po_id))
    po = result.scalar_one_or_none()
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    po.status = PurchaseOrderStatus.received
    po.received_at = datetime.now(timezone.utc)
    await db.commit()
    result = await db.execute(_load_po(po_id))
    return result.scalar_one()


@router.get("/{po_id}/pdf")
async def get_purchase_order_pdf(
    po_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(_load_po(po_id))
    po = result.scalar_one_or_none()
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")

    from app.services.pdf_service import generate_pdf
    settings_result = await db.execute(select(CompanySettings).limit(1))
    company = settings_result.scalar_one_or_none()
    pdf_bytes = await generate_pdf("purchase_order", po, company, "professional")
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{po.po_number}.pdf"'},
    )


@router.post("/{po_id}/duplicate", response_model=PurchaseOrderResponse, status_code=status.HTTP_201_CREATED)
async def duplicate_purchase_order(
    po_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(_load_po(po_id))
    original = result.scalar_one_or_none()
    if not original:
        raise HTTPException(status_code=404, detail="Purchase order not found")

    number = await _generate_po_number(db)
    new_po = PurchaseOrder(
        po_number=number,
        vendor_name=original.vendor_name,
        vendor_email=original.vendor_email,
        vendor_phone=original.vendor_phone,
        vendor_address=original.vendor_address,
        currency=original.currency,
        exchange_rate=original.exchange_rate,
        issue_date=datetime.now(timezone.utc),
        expected_delivery_date=original.expected_delivery_date,
        discount_amount=original.discount_amount,
        subtotal=original.subtotal,
        tax_total=original.tax_total,
        total=original.total,
        notes=original.notes,
        terms_conditions=original.terms_conditions,
        created_by=current_user.id,
    )
    db.add(new_po)
    await db.flush()

    for item in original.items:
        db.add(PurchaseOrderItem(
            purchase_order_id=new_po.id,
            description=item.description,
            quantity=item.quantity,
            unit_price=item.unit_price,
            tax_rate_id=item.tax_rate_id,
            tax_amount=item.tax_amount,
            line_total=item.line_total,
            sort_order=item.sort_order,
        ))

    await db.commit()
    result = await db.execute(_load_po(new_po.id))
    return result.scalar_one()


@router.delete("/{po_id}", status_code=204)
async def delete_purchase_order(
    po_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(PurchaseOrder).where(PurchaseOrder.id == po_id))
    po = result.scalar_one_or_none()
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    if not OwnershipChecker.can_edit(current_user, po.created_by):
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    po.is_deleted = True
    await db.commit()
