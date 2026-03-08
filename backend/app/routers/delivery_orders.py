from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from typing import List, Optional
import io

from app.database import get_db
from app.models.client import Client
from app.models.delivery_order import DeliveryOrder, DeliveryOrderItem, DeliveryOrderStatus
from app.models.settings import CompanySettings
from app.models.user import User
from app.schemas.delivery_order import DeliveryOrderCreate, DeliveryOrderUpdate, DeliveryOrderResponse
from app.middleware.auth import get_current_user
from app.middleware.rbac import OwnershipChecker, apply_tenant_filter
from datetime import datetime, timezone

router = APIRouter(prefix="/delivery-orders", tags=["delivery-orders"])


async def _generate_do_number(db: AsyncSession) -> str:
    result = await db.execute(select(CompanySettings).limit(1))
    settings = result.scalar_one_or_none()
    prefix = (getattr(settings, "do_prefix", None) if settings else None) or "DO"
    year = datetime.now().year
    count_result = await db.execute(select(func.count(DeliveryOrder.id)))
    count = (count_result.scalar() or 0) + 1
    return f"{prefix}-{year}-{count:04d}"


def _load_do(do_id: int):
    return (
        select(DeliveryOrder)
        .options(selectinload(DeliveryOrder.items), selectinload(DeliveryOrder.client))
        .where(DeliveryOrder.id == do_id)
    )


@router.get("", response_model=List[DeliveryOrderResponse])
async def list_delivery_orders(
    status: Optional[DeliveryOrderStatus] = Query(None),
    client_id: Optional[int] = Query(None),
    search: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = select(DeliveryOrder).options(selectinload(DeliveryOrder.items), selectinload(DeliveryOrder.client))
    query = apply_tenant_filter(query, DeliveryOrder, current_user)
    query = query.where(DeliveryOrder.is_deleted != True)
    if not OwnershipChecker.can_view_all(current_user):
        query = query.where(DeliveryOrder.created_by == current_user.id)
    if status:
        query = query.where(DeliveryOrder.status == status)
    if client_id:
        query = query.where(DeliveryOrder.client_id == client_id)
    if search:
        client_ids_sq = select(Client.id).where(Client.company_name.ilike(f"%{search}%")).scalar_subquery()
        query = query.where(
            DeliveryOrder.do_number.ilike(f"%{search}%") |
            DeliveryOrder.client_id.in_(client_ids_sq)
        )
    query = query.order_by(DeliveryOrder.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(query)
    return result.scalars().all()


@router.post("", response_model=DeliveryOrderResponse, status_code=status.HTTP_201_CREATED)
async def create_delivery_order(
    body: DeliveryOrderCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    number = await _generate_do_number(db)
    do = DeliveryOrder(
        do_number=number,
        client_id=body.client_id,
        issue_date=body.issue_date,
        delivery_date=body.delivery_date,
        delivery_address=body.delivery_address,
        notes=body.notes,
        created_by=current_user.id,
        tenant_id=current_user.tenant_id,
    )
    db.add(do)
    await db.flush()

    for i, item_data in enumerate(body.items):
        db.add(DeliveryOrderItem(
            delivery_order_id=do.id,
            description=item_data.description,
            quantity=item_data.quantity,
            unit=item_data.unit or "pcs",
            sort_order=i,
        ))

    await db.commit()
    result = await db.execute(_load_do(do.id))
    return result.scalar_one()


@router.get("/{do_id}", response_model=DeliveryOrderResponse)
async def get_delivery_order(
    do_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(_load_do(do_id))
    do = result.scalar_one_or_none()
    if not do:
        raise HTTPException(status_code=404, detail="Delivery order not found")
    if not OwnershipChecker.can_edit(current_user, do.created_by):
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    return do


@router.put("/{do_id}", response_model=DeliveryOrderResponse)
async def update_delivery_order(
    do_id: int,
    body: DeliveryOrderUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(_load_do(do_id))
    do = result.scalar_one_or_none()
    if not do:
        raise HTTPException(status_code=404, detail="Delivery order not found")
    if not OwnershipChecker.can_edit(current_user, do.created_by):
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    update_data = body.model_dump(exclude_unset=True, exclude={"items"})
    for key, value in update_data.items():
        setattr(do, key, value)

    if body.items is not None:
        for item in do.items:
            await db.delete(item)
        for i, item_data in enumerate(body.items):
            db.add(DeliveryOrderItem(
                delivery_order_id=do.id,
                description=item_data.description,
                quantity=item_data.quantity,
                unit=item_data.unit or "pcs",
                sort_order=i,
            ))

    await db.commit()
    result = await db.execute(_load_do(do_id))
    return result.scalar_one()


@router.post("/{do_id}/send", response_model=DeliveryOrderResponse)
async def send_delivery_order(
    do_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(_load_do(do_id))
    do = result.scalar_one_or_none()
    if not do:
        raise HTTPException(status_code=404, detail="Delivery order not found")
    do.status = DeliveryOrderStatus.sent
    do.sent_at = datetime.now(timezone.utc)
    await db.commit()
    result = await db.execute(_load_do(do_id))
    return result.scalar_one()


@router.post("/{do_id}/deliver", response_model=DeliveryOrderResponse)
async def mark_delivered(
    do_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(_load_do(do_id))
    do = result.scalar_one_or_none()
    if not do:
        raise HTTPException(status_code=404, detail="Delivery order not found")
    do.status = DeliveryOrderStatus.delivered
    do.delivered_at = datetime.now(timezone.utc)
    await db.commit()
    result = await db.execute(_load_do(do_id))
    return result.scalar_one()


@router.get("/{do_id}/pdf")
async def get_delivery_order_pdf(
    do_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(_load_do(do_id))
    do = result.scalar_one_or_none()
    if not do:
        raise HTTPException(status_code=404, detail="Delivery order not found")

    from app.services.pdf_service import generate_pdf
    settings_result = await db.execute(select(CompanySettings).limit(1))
    company = settings_result.scalar_one_or_none()
    pdf_bytes = await generate_pdf("delivery_order", do, company, "professional")
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{do.do_number}.pdf"'},
    )


@router.post("/{do_id}/duplicate", response_model=DeliveryOrderResponse, status_code=status.HTTP_201_CREATED)
async def duplicate_delivery_order(
    do_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(_load_do(do_id))
    original = result.scalar_one_or_none()
    if not original:
        raise HTTPException(status_code=404, detail="Delivery order not found")

    number = await _generate_do_number(db)
    new_do = DeliveryOrder(
        do_number=number,
        client_id=original.client_id,
        issue_date=datetime.now(timezone.utc),
        delivery_date=original.delivery_date,
        delivery_address=original.delivery_address,
        notes=original.notes,
        created_by=current_user.id,
    )
    db.add(new_do)
    await db.flush()

    for item in original.items:
        db.add(DeliveryOrderItem(
            delivery_order_id=new_do.id,
            description=item.description,
            quantity=item.quantity,
            unit=item.unit,
            sort_order=item.sort_order,
        ))

    await db.commit()
    result = await db.execute(_load_do(new_do.id))
    return result.scalar_one()


@router.delete("/{do_id}", status_code=204)
async def delete_delivery_order(
    do_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(DeliveryOrder).where(DeliveryOrder.id == do_id))
    do = result.scalar_one_or_none()
    if not do:
        raise HTTPException(status_code=404, detail="Delivery order not found")
    if not OwnershipChecker.can_edit(current_user, do.created_by):
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    do.is_deleted = True
    await db.commit()
