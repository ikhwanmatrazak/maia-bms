import os
from fastapi import APIRouter, Depends, HTTPException, status, Query, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional

from app.database import get_db
from app.models.expense import Expense, ExpenseCategory
from app.models.user import User
from app.schemas.expense import ExpenseCreate, ExpenseUpdate, ExpenseResponse, ExpenseCategoryCreate, ExpenseCategoryResponse
from app.middleware.auth import get_current_user
from app.middleware.rbac import require_admin, apply_tenant_filter, get_effective_tenant_id
from app.config import get_settings

router = APIRouter(tags=["expenses"])
settings = get_settings()


@router.get("/expense-categories", response_model=List[ExpenseCategoryResponse])
async def list_categories(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(ExpenseCategory).where(ExpenseCategory.is_active == True))
    return result.scalars().all()


@router.post("/expense-categories", response_model=ExpenseCategoryResponse, status_code=status.HTTP_201_CREATED)
async def create_category(
    body: ExpenseCategoryCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    category = ExpenseCategory(name=body.name, color=body.color)
    db.add(category)
    await db.commit()
    await db.refresh(category)
    return category


@router.get("/expenses", response_model=List[ExpenseResponse])
async def list_expenses(
    category_id: Optional[int] = Query(None),
    search: Optional[str] = Query(None),
    month: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from datetime import datetime as _dt
    query = select(Expense)
    query = apply_tenant_filter(query, Expense, current_user)
    if month:
        y, m_n = int(month.split("-")[0]), int(month.split("-")[1])
        _start = _dt(y, m_n, 1)
        _end = _dt(y + 1, 1, 1) if m_n == 12 else _dt(y, m_n + 1, 1)
        query = query.where(Expense.expense_date >= _start, Expense.expense_date < _end)
    if category_id:
        query = query.where(Expense.category_id == category_id)
    if search:
        query = query.where(
            Expense.description.ilike(f"%{search}%") |
            Expense.vendor.ilike(f"%{search}%")
        )
    query = query.order_by(Expense.expense_date.desc()).offset(skip).limit(limit)
    result = await db.execute(query)
    return result.scalars().all()


@router.post("/expenses", response_model=ExpenseResponse, status_code=status.HTTP_201_CREATED)
async def create_expense(
    body: ExpenseCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    data = body.model_dump()
    expense = Expense(**data, created_by=current_user.id, tenant_id=current_user.tenant_id)
    db.add(expense)
    await db.commit()
    await db.refresh(expense)
    return expense


@router.put("/expenses/{expense_id}", response_model=ExpenseResponse)
async def update_expense(
    expense_id: int,
    body: ExpenseUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Expense).where(Expense.id == expense_id))
    expense = result.scalar_one_or_none()
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    eff_tenant = get_effective_tenant_id(current_user)
    if eff_tenant is not None and expense.tenant_id != eff_tenant:
        raise HTTPException(status_code=403, detail="Access denied")
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(expense, key, value)
    await db.commit()
    await db.refresh(expense)
    return expense


@router.delete("/expenses/{expense_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_expense(
    expense_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin()),
):
    result = await db.execute(select(Expense).where(Expense.id == expense_id))
    expense = result.scalar_one_or_none()
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    eff_tenant = get_effective_tenant_id(current_user)
    if eff_tenant is not None and expense.tenant_id != eff_tenant:
        raise HTTPException(status_code=403, detail="Access denied")
    await db.delete(expense)
    await db.commit()


from decimal import Decimal as _Dec
from datetime import datetime as _dt, timezone as _tz


def _month_range(month):
    if month:
        y, m = int(month.split("-")[0]), int(month.split("-")[1])
    else:
        now = _dt.now(_tz.utc)
        y, m = now.year, now.month
    start = _dt(y, m, 1)
    end = _dt(y + 1, 1, 1) if m == 12 else _dt(y, m + 1, 1)
    return start, end


@router.get("/expenses/summary")
async def expenses_summary(
    month: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    start, end = _month_range(month)
    q = select(Expense).where(Expense.expense_date >= start, Expense.expense_date < end)
    q = apply_tenant_filter(q, Expense, current_user)
    result = await db.execute(q)
    rows = result.scalars().all()

    by_category = {}
    for r in rows:
        k = r.category or "Uncategorized"
        by_category[k] = round(by_category.get(k, 0) + float(_Dec(str(r.amount))), 2)

    return {
        "count": len(rows),
        "total_amount": float(sum(_Dec(str(r.amount)) for r in rows)),
        "by_category": by_category,
        "month": month or _dt.now(_tz.utc).strftime("%Y-%m"),
    }
