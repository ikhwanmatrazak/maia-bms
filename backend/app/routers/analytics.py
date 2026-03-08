from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime, timezone, timedelta
from decimal import Decimal

from app.database import get_db
from app.models.user import User
from app.models.invoice import Invoice, InvoiceStatus
from app.models.payment import Payment
from app.models.expense import Expense
from app.models.client import Client, ClientStatus
from app.models.product import ProductSubscription, SubscriptionStatus, BillingCycle
from app.middleware.auth import get_current_user

router = APIRouter(prefix="/analytics", tags=["analytics"])


def _in_range(dt, start, end):
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    if end.tzinfo is None:
        end = end.replace(tzinfo=timezone.utc)
    return start <= dt < end


def _tenant_filter(query, model, current_user):
    if not current_user.is_super_admin and current_user.tenant_id is not None:
        query = query.where(model.tenant_id == current_user.tenant_id)
    return query


def _to_mrr(amount: Decimal, cycle: BillingCycle) -> Decimal:
    if cycle == BillingCycle.monthly:
        return amount
    elif cycle == BillingCycle.quarterly:
        return amount / Decimal("3")
    elif cycle == BillingCycle.annually:
        return amount / Decimal("12")
    return Decimal("0")


@router.get("/summary")
async def analytics_summary(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    last_month_start = (month_start - timedelta(days=1)).replace(day=1)

    # --- MRR / ARR from active subscriptions ---
    sub_query = select(ProductSubscription).where(ProductSubscription.status == SubscriptionStatus.active)
    sub_query = _tenant_filter(sub_query, ProductSubscription, current_user)
    sub_result = await db.execute(sub_query)
    subscriptions = sub_result.scalars().all()

    mrr = sum(_to_mrr(Decimal(str(s.amount)), s.billing_cycle) for s in subscriptions)
    arr = mrr * Decimal("12")

    active_subs = len(subscriptions)
    subs_by_cycle = {}
    for s in subscriptions:
        key = s.billing_cycle.value
        subs_by_cycle[key] = subs_by_cycle.get(key, {"count": 0, "mrr": Decimal("0")})
        subs_by_cycle[key]["count"] += 1
        subs_by_cycle[key]["mrr"] += _to_mrr(Decimal(str(s.amount)), s.billing_cycle)

    # --- Revenue this month & last month ---
    pay_q = select(Payment).join(Invoice, Payment.invoice_id == Invoice.id)
    pay_q = _tenant_filter(pay_q, Invoice, current_user)
    pay_result = await db.execute(pay_q)
    all_payments = pay_result.scalars().all()

    revenue_this_month = sum(
        Decimal(str(p.amount)) for p in all_payments
        if _in_range(p.payment_date, month_start, now + timedelta(days=1))
    )
    revenue_last_month = sum(
        Decimal(str(p.amount)) for p in all_payments
        if _in_range(p.payment_date, last_month_start, month_start)
    )

    # --- Revenue last 12 months ---
    twelve_months_ago = now - timedelta(days=365)
    monthly_revenue: dict[str, Decimal] = {}
    for p in all_payments:
        pd = p.payment_date
        if pd.tzinfo is None:
            pd = pd.replace(tzinfo=timezone.utc)
        if pd >= twelve_months_ago:
            key = pd.strftime("%Y-%m")
            monthly_revenue[key] = monthly_revenue.get(key, Decimal("0")) + Decimal(str(p.amount))

    # --- Expenses last 12 months ---
    exp_q = select(Expense).where(Expense.expense_date >= twelve_months_ago.replace(tzinfo=None))
    exp_q = _tenant_filter(exp_q, Expense, current_user)
    exp_result = await db.execute(exp_q)
    expenses = exp_result.scalars().all()

    monthly_expenses: dict[str, Decimal] = {}
    for e in expenses:
        key = e.expense_date.strftime("%Y-%m")
        monthly_expenses[key] = monthly_expenses.get(key, Decimal("0")) + Decimal(str(e.amount))

    all_months = sorted(set(list(monthly_revenue.keys()) + list(monthly_expenses.keys())))
    trend = [
        {
            "month": m,
            "revenue": float(monthly_revenue.get(m, Decimal("0"))),
            "expenses": float(monthly_expenses.get(m, Decimal("0"))),
            "profit": float(monthly_revenue.get(m, Decimal("0")) - monthly_expenses.get(m, Decimal("0"))),
        }
        for m in all_months
    ]

    # --- Outstanding invoices ---
    inv_q = select(Invoice).where(Invoice.status.in_([InvoiceStatus.sent, InvoiceStatus.partial, InvoiceStatus.overdue]))
    inv_q = _tenant_filter(inv_q, Invoice, current_user)
    inv_result = await db.execute(inv_q)
    outstanding_invoices = inv_result.scalars().all()
    outstanding_total = sum(Decimal(str(i.balance_due)) for i in outstanding_invoices)
    overdue_invoices = [i for i in outstanding_invoices if i.due_date and i.due_date < now.replace(tzinfo=None)]
    overdue_total = sum(Decimal(str(i.balance_due)) for i in overdue_invoices)

    # --- Expenses this month ---
    exp_this_month_q = select(Expense).where(
        Expense.expense_date >= month_start.replace(tzinfo=None),
        Expense.expense_date < (now + timedelta(days=1)).replace(tzinfo=None),
    )
    exp_this_month_q = _tenant_filter(exp_this_month_q, Expense, current_user)
    exp_this_month_result = await db.execute(exp_this_month_q)
    expenses_this_month = sum(Decimal(str(e.amount)) for e in exp_this_month_result.scalars().all())

    ebitda_this_month = revenue_this_month - expenses_this_month
    ebitda_margin = float((ebitda_this_month / revenue_this_month * 100) if revenue_this_month > 0 else Decimal("0"))

    # --- Active clients ---
    client_q = select(Client).where(Client.status == ClientStatus.active)
    client_q = _tenant_filter(client_q, Client, current_user)
    client_result = await db.execute(client_q)
    active_clients = len(client_result.scalars().all())

    # --- MRR trend (last 6 months based on subscription start dates) ---
    mrr_trend = []
    for i in range(5, -1, -1):
        month = (now - timedelta(days=30 * i)).strftime("%Y-%m")
        mrr_trend.append({"month": month, "mrr": float(mrr)})

    return {
        "mrr": float(mrr),
        "arr": float(arr),
        "active_subscriptions": active_subs,
        "subscriptions_by_cycle": {
            k: {"count": v["count"], "mrr": float(v["mrr"])}
            for k, v in subs_by_cycle.items()
        },
        "revenue_this_month": float(revenue_this_month),
        "revenue_last_month": float(revenue_last_month),
        "outstanding_total": float(outstanding_total),
        "overdue_total": float(overdue_total),
        "overdue_count": len(overdue_invoices),
        "active_clients": active_clients,
        "expenses_this_month": float(expenses_this_month),
        "ebitda_this_month": float(ebitda_this_month),
        "ebitda_margin": ebitda_margin,
        "trend": trend,
        "mrr_trend": mrr_trend,
    }
