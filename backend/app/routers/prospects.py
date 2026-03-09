from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
from datetime import datetime, timezone

from app.database import get_db
from app.models.prospect import Prospect, ProspectStage
from app.models.client import Client
from app.models.user import User
from app.schemas.prospect import ProspectCreate, ProspectUpdate, ProspectResponse
from app.middleware.auth import get_current_user
from app.middleware.rbac import get_effective_tenant_id

router = APIRouter(prefix="/prospects", tags=["prospects"])


@router.get("", response_model=List[ProspectResponse])
async def list_prospects(
    stage: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    eff_tenant = get_effective_tenant_id(current_user)
    query = select(Prospect).order_by(Prospect.created_at.desc())
    if eff_tenant is not None:
        query = query.where(Prospect.tenant_id == eff_tenant)
    if stage:
        query = query.where(Prospect.stage == stage)
    if search:
        query = query.where(Prospect.company_name.ilike(f"%{search}%"))
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/summary")
async def prospects_summary(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    eff_tenant = get_effective_tenant_id(current_user)
    query = select(Prospect)
    if eff_tenant is not None:
        query = query.where(Prospect.tenant_id == eff_tenant)
    result = await db.execute(query)
    rows = result.scalars().all()

    by_stage = {}
    value_by_stage = {}
    for r in rows:
        s = r.stage.value if hasattr(r.stage, "value") else r.stage
        by_stage[s] = by_stage.get(s, 0) + 1
        v = float(r.expected_value or 0)
        value_by_stage[s] = value_by_stage.get(s, 0) + v

    total_pipeline = sum(
        float(r.expected_value or 0)
        for r in rows
        if (r.stage.value if hasattr(r.stage, "value") else r.stage) not in ("won", "lost")
    )
    return {
        "total": len(rows),
        "by_stage": by_stage,
        "value_by_stage": value_by_stage,
        "total_pipeline_value": total_pipeline,
    }


@router.post("", response_model=ProspectResponse, status_code=201)
async def create_prospect(
    data: ProspectCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    eff_tenant = get_effective_tenant_id(current_user)
    prospect = Prospect(**data.model_dump(), tenant_id=eff_tenant, created_by=current_user.id)
    db.add(prospect)
    await db.commit()
    await db.refresh(prospect)
    return prospect


@router.get("/{prospect_id}", response_model=ProspectResponse)
async def get_prospect(
    prospect_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    eff_tenant = get_effective_tenant_id(current_user)
    result = await db.execute(select(Prospect).where(Prospect.id == prospect_id))
    prospect = result.scalar_one_or_none()
    if not prospect:
        raise HTTPException(status_code=404, detail="Prospect not found")
    if eff_tenant is not None and prospect.tenant_id != eff_tenant:
        raise HTTPException(status_code=403, detail="Access denied")
    return prospect


@router.put("/{prospect_id}", response_model=ProspectResponse)
async def update_prospect(
    prospect_id: int,
    data: ProspectUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    eff_tenant = get_effective_tenant_id(current_user)
    result = await db.execute(select(Prospect).where(Prospect.id == prospect_id))
    prospect = result.scalar_one_or_none()
    if not prospect:
        raise HTTPException(status_code=404, detail="Prospect not found")
    if eff_tenant is not None and prospect.tenant_id != eff_tenant:
        raise HTTPException(status_code=403, detail="Access denied")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(prospect, field, value)
    await db.commit()
    await db.refresh(prospect)
    return prospect


@router.post("/{prospect_id}/convert", response_model=ProspectResponse)
async def convert_to_client(
    prospect_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Convert a won prospect into an active client."""
    eff_tenant = get_effective_tenant_id(current_user)
    result = await db.execute(select(Prospect).where(Prospect.id == prospect_id))
    prospect = result.scalar_one_or_none()
    if not prospect:
        raise HTTPException(status_code=404, detail="Prospect not found")
    if eff_tenant is not None and prospect.tenant_id != eff_tenant:
        raise HTTPException(status_code=403, detail="Access denied")
    if prospect.is_converted:
        raise HTTPException(status_code=400, detail="Already converted")

    client = Client(
        company_name=prospect.company_name,
        contact_person=prospect.contact_person,
        email=prospect.email,
        phone=prospect.phone,
        address=prospect.address,
        notes=prospect.notes,
        status="active",
        tenant_id=prospect.tenant_id,
        created_by=current_user.id,
    )
    db.add(client)
    await db.flush()

    prospect.stage = ProspectStage.won
    prospect.is_converted = True
    prospect.converted_client_id = client.id
    prospect.converted_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(prospect)
    return prospect


@router.delete("/{prospect_id}", status_code=204)
async def delete_prospect(
    prospect_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    eff_tenant = get_effective_tenant_id(current_user)
    result = await db.execute(select(Prospect).where(Prospect.id == prospect_id))
    prospect = result.scalar_one_or_none()
    if not prospect:
        raise HTTPException(status_code=404, detail="Prospect not found")
    if eff_tenant is not None and prospect.tenant_id != eff_tenant:
        raise HTTPException(status_code=403, detail="Access denied")
    await db.delete(prospect)
    await db.commit()
