from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime

from app.database import get_db
from app.models.tenant import Tenant
from app.models.user import User, UserRole
from app.models.settings import CompanySettings
from app.middleware.auth import get_current_user, hash_password, create_access_token, create_refresh_token

router = APIRouter(prefix="/super-admin", tags=["super-admin"])


async def require_super_admin(current_user: User = Depends(get_current_user)) -> User:
    if not current_user.is_super_admin:
        raise HTTPException(status_code=403, detail="Super admin access required")
    return current_user


# ---------- Schemas ----------

class TenantCreate(BaseModel):
    name: str
    slug: str
    plan: str = "standard"
    notes: Optional[str] = None
    admin_name: str
    admin_email: str
    admin_password: str


class TenantUpdate(BaseModel):
    name: Optional[str] = None
    plan: Optional[str] = None
    is_active: Optional[bool] = None
    notes: Optional[str] = None


class TenantResponse(BaseModel):
    id: int
    name: str
    slug: str
    plan: str
    is_active: bool
    notes: Optional[str]
    created_at: datetime
    user_count: int = 0

    model_config = {"from_attributes": True}


class AdminUserCreate(BaseModel):
    name: str
    email: str
    password: str
    role: UserRole = UserRole.admin


class AdminUserUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    role: Optional[UserRole] = None
    is_active: Optional[bool] = None
    password: Optional[str] = None


class UserResponse(BaseModel):
    id: int
    tenant_id: Optional[int]
    name: str
    email: str
    role: UserRole
    is_active: bool
    is_super_admin: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# ---------- Endpoints ----------

@router.get("/tenants", response_model=List[TenantResponse])
async def list_tenants(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_super_admin),
):
    result = await db.execute(select(Tenant).order_by(Tenant.created_at.desc()))
    tenants = result.scalars().all()

    # Attach user counts
    count_result = await db.execute(
        select(User.tenant_id, func.count(User.id).label("cnt"))
        .where(User.tenant_id.isnot(None))
        .group_by(User.tenant_id)
    )
    counts = {row.tenant_id: row.cnt for row in count_result}

    response = []
    for t in tenants:
        d = TenantResponse.model_validate(t)
        d.user_count = counts.get(t.id, 0)
        response.append(d)
    return response


@router.post("/tenants", response_model=TenantResponse, status_code=status.HTTP_201_CREATED)
async def create_tenant(
    body: TenantCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_super_admin),
):
    # Check slug uniqueness
    existing = await db.execute(select(Tenant).where(Tenant.slug == body.slug))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Slug already in use")

    # Check admin email uniqueness
    existing_user = await db.execute(select(User).where(User.email == body.admin_email))
    if existing_user.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Admin email already registered")

    # Create tenant
    tenant = Tenant(name=body.name, slug=body.slug, plan=body.plan, notes=body.notes)
    db.add(tenant)
    await db.flush()

    # Create company settings for tenant
    settings = CompanySettings(tenant_id=tenant.id, name=body.name)
    db.add(settings)

    # Create admin user for tenant
    admin_user = User(
        tenant_id=tenant.id,
        name=body.admin_name,
        email=body.admin_email,
        password_hash=hash_password(body.admin_password),
        role=UserRole.admin,
        is_active=True,
        is_super_admin=False,
    )
    db.add(admin_user)
    await db.commit()
    await db.refresh(tenant)

    result = TenantResponse.model_validate(tenant)
    result.user_count = 1
    return result


@router.get("/tenants/{tenant_id}", response_model=TenantResponse)
async def get_tenant(
    tenant_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_super_admin),
):
    result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    count = await db.execute(select(func.count(User.id)).where(User.tenant_id == tenant_id))
    resp = TenantResponse.model_validate(tenant)
    resp.user_count = count.scalar() or 0
    return resp


@router.put("/tenants/{tenant_id}", response_model=TenantResponse)
async def update_tenant(
    tenant_id: int,
    body: TenantUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_super_admin),
):
    result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(tenant, k, v)
    await db.commit()
    await db.refresh(tenant)
    count = await db.execute(select(func.count(User.id)).where(User.tenant_id == tenant_id))
    resp = TenantResponse.model_validate(tenant)
    resp.user_count = count.scalar() or 0
    return resp


@router.get("/tenants/{tenant_id}/users", response_model=List[UserResponse])
async def list_tenant_users(
    tenant_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_super_admin),
):
    result = await db.execute(select(User).where(User.tenant_id == tenant_id).order_by(User.name))
    return result.scalars().all()


@router.post("/tenants/{tenant_id}/users", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def add_tenant_user(
    tenant_id: int,
    body: AdminUserCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_super_admin),
):
    tenant_result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    if not tenant_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Tenant not found")
    existing = await db.execute(select(User).where(User.email == body.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")
    user = User(
        tenant_id=tenant_id,
        name=body.name,
        email=body.email,
        password_hash=hash_password(body.password),
        role=body.role,
        is_active=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@router.patch("/tenants/{tenant_id}/users/{user_id}", response_model=UserResponse)
async def update_tenant_user(
    tenant_id: int,
    user_id: int,
    body: AdminUserUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_super_admin),
):
    result = await db.execute(select(User).where(User.id == user_id, User.tenant_id == tenant_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if body.email and body.email != user.email:
        existing = await db.execute(select(User).where(User.email == body.email))
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Email already registered")
    for k, v in body.model_dump(exclude_unset=True).items():
        if k == "password":
            user.password_hash = hash_password(v)
        else:
            setattr(user, k, v)
    await db.commit()
    await db.refresh(user)
    return user


@router.delete("/tenants/{tenant_id}/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_tenant_user(
    tenant_id: int,
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_super_admin),
):
    result = await db.execute(select(User).where(User.id == user_id, User.tenant_id == tenant_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    await db.delete(user)
    await db.commit()


@router.get("/stats")
async def platform_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_super_admin),
):
    tenant_count = await db.execute(select(func.count(Tenant.id)))
    active_count = await db.execute(select(func.count(Tenant.id)).where(Tenant.is_active == True))
    user_count = await db.execute(select(func.count(User.id)).where(User.is_super_admin == False))
    return {
        "total_tenants": tenant_count.scalar() or 0,
        "active_tenants": active_count.scalar() or 0,
        "total_users": user_count.scalar() or 0,
    }


@router.post("/switch-tenant/{tenant_id}")
async def switch_tenant(
    tenant_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_super_admin),
):
    """Issue tokens scoped to a specific tenant so super admin can view that tenant's data."""
    result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    payload = {"sub": str(current_user.id), "switched_tenant_id": tenant_id}
    access_token = create_access_token(payload)
    refresh_token = create_refresh_token(payload)
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "switched_tenant_id": tenant_id,
        "switched_tenant_name": tenant.name,
    }


@router.post("/exit-tenant")
async def exit_tenant(
    current_user: User = Depends(require_super_admin),
):
    """Restore super admin tokens without any tenant scoping."""
    payload = {"sub": str(current_user.id)}
    access_token = create_access_token(payload)
    refresh_token = create_refresh_token(payload)
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "switched_tenant_id": None,
        "switched_tenant_name": None,
    }
