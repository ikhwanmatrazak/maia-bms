from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from typing import List, Optional
from datetime import datetime, timezone, timedelta

from app.database import get_db
from app.models.product import Product, ProductPricing, ProductSubscription, SubscriptionStatus
from app.models.user import User
from app.schemas.product import (
    ProductCreate, ProductUpdate, ProductResponse,
    PricingCreate, PricingUpdate, PricingResponse,
    SubscriptionCreate, SubscriptionUpdate, SubscriptionResponse,
)
from app.middleware.auth import get_current_user
from app.middleware.rbac import apply_tenant_filter

router = APIRouter(prefix="/products", tags=["products"])


@router.get("/renewals", response_model=List[SubscriptionResponse])
async def upcoming_renewals(
    days: int = Query(30, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cutoff = datetime.now(timezone.utc) + timedelta(days=days)
    query = (
        select(ProductSubscription)
        .options(selectinload(ProductSubscription.client), selectinload(ProductSubscription.product))
        .where(
            ProductSubscription.status == SubscriptionStatus.active,
            ProductSubscription.next_renewal_date.isnot(None),
            ProductSubscription.next_renewal_date <= cutoff,
        )
        .order_by(ProductSubscription.next_renewal_date)
    )
    if not current_user.is_super_admin and current_user.tenant_id is not None:
        query = query.where(ProductSubscription.tenant_id == current_user.tenant_id)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/client-subscriptions", response_model=List[SubscriptionResponse])
async def list_client_subscriptions(
    client_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = (
        select(ProductSubscription)
        .options(selectinload(ProductSubscription.client), selectinload(ProductSubscription.product))
        .where(ProductSubscription.client_id == client_id)
        .order_by(ProductSubscription.next_renewal_date)
    )
    if not current_user.is_super_admin and current_user.tenant_id is not None:
        query = query.where(ProductSubscription.tenant_id == current_user.tenant_id)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("", response_model=List[ProductResponse])
async def list_products(
    search: Optional[str] = Query(None),
    is_active: Optional[bool] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = select(Product).options(selectinload(Product.subscriptions), selectinload(Product.pricing))
    query = apply_tenant_filter(query, Product, current_user)
    if is_active is not None:
        query = query.where(Product.is_active == is_active)
    if search:
        query = query.where(Product.name.ilike(f"%{search}%"))
    query = query.order_by(Product.name)
    result = await db.execute(query)
    return result.scalars().all()


@router.post("", response_model=ProductResponse)
async def create_product(
    data: ProductCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    product = Product(**data.model_dump(), tenant_id=current_user.tenant_id)
    db.add(product)
    await db.commit()
    result = await db.execute(
        select(Product).options(selectinload(Product.subscriptions), selectinload(Product.pricing)).where(Product.id == product.id)
    )
    return result.scalar_one()


@router.get("/{product_id}", response_model=ProductResponse)
async def get_product(
    product_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Product).options(selectinload(Product.subscriptions), selectinload(Product.pricing)).where(Product.id == product_id)
    )
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return product


@router.put("/{product_id}", response_model=ProductResponse)
async def update_product(
    product_id: int,
    data: ProductUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Product).where(Product.id == product_id))
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(product, k, v)
    await db.commit()
    result = await db.execute(
        select(Product).options(selectinload(Product.subscriptions), selectinload(Product.pricing)).where(Product.id == product_id)
    )
    return result.scalar_one()


@router.delete("/{product_id}", status_code=204)
async def delete_product(
    product_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Product).where(Product.id == product_id))
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    await db.delete(product)
    await db.commit()


@router.get("/{product_id}/subscriptions", response_model=List[SubscriptionResponse])
async def list_subscriptions(
    product_id: int,
    status: Optional[SubscriptionStatus] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = (
        select(ProductSubscription)
        .options(selectinload(ProductSubscription.client), selectinload(ProductSubscription.product))
        .where(ProductSubscription.product_id == product_id)
        .order_by(ProductSubscription.next_renewal_date)
    )
    if status:
        query = query.where(ProductSubscription.status == status)
    result = await db.execute(query)
    return result.scalars().all()


@router.post("/{product_id}/subscriptions", response_model=SubscriptionResponse)
async def create_subscription(
    product_id: int,
    data: SubscriptionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Product).where(Product.id == product_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Product not found")
    sub = ProductSubscription(**data.model_dump(), product_id=product_id, tenant_id=current_user.tenant_id)
    db.add(sub)
    await db.commit()
    result = await db.execute(
        select(ProductSubscription)
        .options(selectinload(ProductSubscription.client), selectinload(ProductSubscription.product))
        .where(ProductSubscription.id == sub.id)
    )
    return result.scalar_one()


@router.put("/{product_id}/subscriptions/{sub_id}", response_model=SubscriptionResponse)
async def update_subscription(
    product_id: int,
    sub_id: int,
    data: SubscriptionUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ProductSubscription).where(
            ProductSubscription.id == sub_id,
            ProductSubscription.product_id == product_id,
        )
    )
    sub = result.scalar_one_or_none()
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(sub, k, v)
    await db.commit()
    result = await db.execute(
        select(ProductSubscription)
        .options(selectinload(ProductSubscription.client), selectinload(ProductSubscription.product))
        .where(ProductSubscription.id == sub_id)
    )
    return result.scalar_one()


@router.delete("/{product_id}/subscriptions/{sub_id}", status_code=204)
async def delete_subscription(
    product_id: int,
    sub_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ProductSubscription).where(
            ProductSubscription.id == sub_id,
            ProductSubscription.product_id == product_id,
        )
    )
    sub = result.scalar_one_or_none()
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found")
    await db.delete(sub)
    await db.commit()


# --- Pricing Tiers ---

@router.get("/{product_id}/pricing", response_model=List[PricingResponse])
async def list_pricing(
    product_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ProductPricing)
        .where(ProductPricing.product_id == product_id)
        .order_by(ProductPricing.sort_order)
    )
    return result.scalars().all()


@router.post("/{product_id}/pricing", response_model=PricingResponse)
async def create_pricing(
    product_id: int,
    data: PricingCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Product).where(Product.id == product_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Product not found")
    pricing = ProductPricing(**data.model_dump(), product_id=product_id)
    db.add(pricing)
    await db.commit()
    await db.refresh(pricing)
    return pricing


@router.put("/{product_id}/pricing/{pricing_id}", response_model=PricingResponse)
async def update_pricing(
    product_id: int,
    pricing_id: int,
    data: PricingUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ProductPricing).where(
            ProductPricing.id == pricing_id,
            ProductPricing.product_id == product_id,
        )
    )
    pricing = result.scalar_one_or_none()
    if not pricing:
        raise HTTPException(status_code=404, detail="Pricing not found")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(pricing, k, v)
    await db.commit()
    await db.refresh(pricing)
    return pricing


@router.delete("/{product_id}/pricing/{pricing_id}", status_code=204)
async def delete_pricing(
    product_id: int,
    pricing_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ProductPricing).where(
            ProductPricing.id == pricing_id,
            ProductPricing.product_id == product_id,
        )
    )
    pricing = result.scalar_one_or_none()
    if not pricing:
        raise HTTPException(status_code=404, detail="Pricing not found")
    await db.delete(pricing)
    await db.commit()
