from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, case
from typing import Optional
from datetime import datetime, timezone, timedelta
from decimal import Decimal

from app.database import get_db
from app.models.invoice import Invoice, InvoiceStatus, InvoiceItem
from app.models.payment import Payment
from app.models.expense import Expense
from app.models.receipt import Receipt
from app.models.client import Client, ClientStatus
from app.models.settings import TaxRate
from app.models.user import User
from app.middleware.auth import get_current_user
from app.middleware.rbac import require_admin_or_manager

router = APIRouter(prefix="/reports", tags=["reports"])


def _tenant_filter(query, model, current_user):
    if not current_user.is_super_admin and current_user.tenant_id is not None:
        query = query.where(model.tenant_id == current_user.tenant_id)
    return query


@router.get("/revenue")
async def revenue_report(
    start: Optional[datetime] = Query(None),
    end: Optional[datetime] = Query(None),
    group_by: str = Query("month", regex="^(month|client|currency)$"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_manager()),
):
    if not start:
        start = datetime.now(timezone.utc).replace(day=1, hour=0, minute=0, second=0)
    if not end:
        end = datetime.now(timezone.utc)

    query = select(Payment).join(Invoice, Payment.invoice_id == Invoice.id).where(
        Payment.payment_date >= start,
        Payment.payment_date <= end,
    )
    query = _tenant_filter(query, Invoice, current_user)
    result = await db.execute(query)
    payments = result.scalars().all()

    if group_by == "month":
        grouped = {}
        for p in payments:
            key = p.payment_date.strftime("%Y-%m")
            grouped[key] = grouped.get(key, Decimal("0")) + Decimal(str(p.amount))
        return {"group_by": "month", "data": [{"period": k, "total": float(v)} for k, v in sorted(grouped.items())]}

    elif group_by == "client":
        invoice_map = {}
        for p in payments:
            inv_result = await db.execute(select(Invoice).where(Invoice.id == p.invoice_id))
            inv = inv_result.scalar_one_or_none()
            if inv:
                client_result = await db.execute(select(Client).where(Client.id == inv.client_id))
                client = client_result.scalar_one_or_none()
                key = client.company_name if client else "Unknown"
                invoice_map[key] = invoice_map.get(key, Decimal("0")) + Decimal(str(p.amount))
        return {"group_by": "client", "data": [{"client": k, "total": float(v)} for k, v in sorted(invoice_map.items(), key=lambda x: x[1], reverse=True)]}

    elif group_by == "currency":
        grouped = {}
        for p in payments:
            key = p.currency
            grouped[key] = grouped.get(key, Decimal("0")) + Decimal(str(p.amount))
        return {"group_by": "currency", "data": [{"currency": k, "total": float(v)} for k, v in grouped.items()]}


@router.get("/overdue")
async def overdue_report(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_manager()),
):
    now = datetime.now(timezone.utc)
    query = select(Invoice).where(
        Invoice.status.in_([InvoiceStatus.sent, InvoiceStatus.partial, InvoiceStatus.overdue]),
        Invoice.due_date < now,
    ).order_by(Invoice.due_date)
    query = _tenant_filter(query, Invoice, current_user)
    result = await db.execute(query)
    invoices = result.scalars().all()

    data = []
    for inv in invoices:
        days_overdue = (now - inv.due_date.replace(tzinfo=timezone.utc)).days
        if days_overdue <= 30:
            bucket = "0-30"
        elif days_overdue <= 60:
            bucket = "31-60"
        elif days_overdue <= 90:
            bucket = "61-90"
        else:
            bucket = "90+"

        client_result = await db.execute(select(Client).where(Client.id == inv.client_id))
        client = client_result.scalar_one_or_none()

        data.append({
            "invoice_id": inv.id,
            "invoice_number": inv.invoice_number,
            "client": client.company_name if client else "Unknown",
            "due_date": inv.due_date.isoformat(),
            "days_overdue": days_overdue,
            "aging_bucket": bucket,
            "balance_due": float(inv.balance_due),
            "currency": inv.currency,
        })

    return {"total_overdue": len(data), "invoices": data}


@router.get("/expenses")
async def expenses_report(
    start: Optional[datetime] = Query(None),
    end: Optional[datetime] = Query(None),
    group_by: str = Query("category", regex="^(category|month)$"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_manager()),
):
    if not start:
        start = datetime.now(timezone.utc).replace(day=1, hour=0, minute=0, second=0)
    if not end:
        end = datetime.now(timezone.utc)

    query = select(Expense).where(Expense.expense_date >= start, Expense.expense_date <= end)
    query = _tenant_filter(query, Expense, current_user)
    result = await db.execute(query)
    expenses = result.scalars().all()

    grouped = {}
    for exp in expenses:
        if group_by == "category":
            key = exp.category or "Uncategorized"
        else:
            key = exp.expense_date.strftime("%Y-%m")
        grouped[key] = grouped.get(key, Decimal("0")) + Decimal(str(exp.amount))

    return {
        "group_by": group_by,
        "data": [{"label": k, "total": float(v)} for k, v in sorted(grouped.items())],
    }


@router.get("/pnl")
async def pnl_report(
    period: str = Query("monthly", regex="^(monthly|quarterly|yearly)$"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_manager()),
):
    now = datetime.now(timezone.utc)
    if period == "monthly":
        start = now - timedelta(days=365)
    elif period == "quarterly":
        start = now - timedelta(days=365 * 2)
    else:
        start = now - timedelta(days=365 * 5)

    payments_query = select(Payment).join(Invoice, Payment.invoice_id == Invoice.id).where(
        Payment.payment_date >= start
    )
    payments_query = _tenant_filter(payments_query, Invoice, current_user)
    payments_result = await db.execute(payments_query)
    payments = payments_result.scalars().all()

    expenses_query = select(Expense).where(Expense.expense_date >= start)
    expenses_query = _tenant_filter(expenses_query, Expense, current_user)
    expenses_result = await db.execute(expenses_query)
    expenses = expenses_result.scalars().all()

    def get_period_key(dt):
        if period == "monthly":
            return dt.strftime("%Y-%m")
        elif period == "quarterly":
            q = (dt.month - 1) // 3 + 1
            return f"{dt.year}-Q{q}"
        else:
            return str(dt.year)

    revenue_by_period = {}
    for p in payments:
        key = get_period_key(p.payment_date)
        revenue_by_period[key] = revenue_by_period.get(key, Decimal("0")) + Decimal(str(p.amount))

    expenses_by_period = {}
    for e in expenses:
        key = get_period_key(e.expense_date)
        expenses_by_period[key] = expenses_by_period.get(key, Decimal("0")) + Decimal(str(e.amount))

    all_periods = sorted(set(list(revenue_by_period.keys()) + list(expenses_by_period.keys())))
    data = []
    for period_key in all_periods:
        rev = float(revenue_by_period.get(period_key, Decimal("0")))
        exp = float(expenses_by_period.get(period_key, Decimal("0")))
        data.append({
            "period": period_key,
            "revenue": rev,
            "expenses": exp,
            "profit": rev - exp,
        })

    return {"period": period, "data": data}


@router.get("/tax-summary")
async def tax_summary(
    start: Optional[datetime] = Query(None),
    end: Optional[datetime] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_manager()),
):
    if not start:
        start = datetime.now(timezone.utc).replace(day=1, hour=0, minute=0, second=0)
    if not end:
        end = datetime.now(timezone.utc)

    query = select(Invoice).where(
        Invoice.status.in_([InvoiceStatus.paid, InvoiceStatus.partial]),
        Invoice.issue_date >= start,
        Invoice.issue_date <= end,
    )
    query = _tenant_filter(query, Invoice, current_user)
    result = await db.execute(query)
    invoices = result.scalars().all()

    tax_by_rate = {}
    for inv in invoices:
        items_result = await db.execute(
            select(InvoiceItem).where(InvoiceItem.invoice_id == inv.id)
        )
        items = items_result.scalars().all()
        for item in items:
            if item.tax_rate_id and Decimal(str(item.tax_amount)) > 0:
                tr_result = await db.execute(select(TaxRate).where(TaxRate.id == item.tax_rate_id))
                tr = tr_result.scalar_one_or_none()
                key = f"{tr.name} ({tr.rate}%)" if tr else f"Rate ID {item.tax_rate_id}"
                tax_by_rate[key] = tax_by_rate.get(key, Decimal("0")) + Decimal(str(item.tax_amount))

    return {
        "start": start.isoformat(),
        "end": end.isoformat(),
        "summary": [{"tax_rate": k, "total_collected": float(v)} for k, v in tax_by_rate.items()],
    }


@router.get("/invoices")
async def invoices_report(
    start: Optional[datetime] = Query(None),
    end: Optional[datetime] = Query(None),
    status: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_manager()),
):
    if not start:
        start = datetime.now(timezone.utc).replace(day=1, hour=0, minute=0, second=0)
    if not end:
        end = datetime.now(timezone.utc)

    query = select(Invoice).where(Invoice.issue_date >= start, Invoice.issue_date <= end)
    if status:
        try:
            query = query.where(Invoice.status == InvoiceStatus(status))
        except ValueError:
            pass
    query = _tenant_filter(query, Invoice, current_user)
    query = query.order_by(Invoice.issue_date.desc())
    result = await db.execute(query)
    invoices = result.scalars().all()

    rows = []
    for inv in invoices:
        client_result = await db.execute(select(Client).where(Client.id == inv.client_id))
        client = client_result.scalar_one_or_none()
        rows.append({
            "invoice_number": inv.invoice_number,
            "client": client.company_name if client else "Unknown",
            "issue_date": inv.issue_date.date().isoformat() if inv.issue_date else "",
            "due_date": inv.due_date.date().isoformat() if inv.due_date else "",
            "status": inv.status.value,
            "total_amount": float(inv.total_amount),
            "balance_due": float(inv.balance_due),
            "currency": inv.currency,
        })

    return {"count": len(rows), "invoices": rows}


@router.get("/payments")
async def payments_report(
    start: Optional[datetime] = Query(None),
    end: Optional[datetime] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_manager()),
):
    if not start:
        start = datetime.now(timezone.utc).replace(day=1, hour=0, minute=0, second=0)
    if not end:
        end = datetime.now(timezone.utc)

    query = select(Payment).join(Invoice, Payment.invoice_id == Invoice.id).where(
        Payment.payment_date >= start,
        Payment.payment_date <= end,
    )
    query = _tenant_filter(query, Invoice, current_user)
    query = query.order_by(Payment.payment_date.desc())
    result = await db.execute(query)
    payments = result.scalars().all()

    rows = []
    for p in payments:
        inv_result = await db.execute(select(Invoice).where(Invoice.id == p.invoice_id))
        inv = inv_result.scalar_one_or_none()
        client_name = ""
        if inv:
            c_result = await db.execute(select(Client).where(Client.id == inv.client_id))
            c = c_result.scalar_one_or_none()
            client_name = c.company_name if c else "Unknown"
        rows.append({
            "payment_date": p.payment_date.date().isoformat() if p.payment_date else "",
            "invoice_number": inv.invoice_number if inv else "",
            "client": client_name,
            "amount": float(p.amount),
            "currency": p.currency,
            "payment_method": p.payment_method.value if p.payment_method else "",
            "reference_number": p.reference_number or "",
        })

    total = sum(r["amount"] for r in rows)
    return {"count": len(rows), "total": total, "payments": rows}


@router.get("/client-summary")
async def client_summary_report(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_manager()),
):
    client_q = select(Client)
    client_q = _tenant_filter(client_q, Client, current_user)
    client_q = client_q.order_by(Client.company_name)
    client_result = await db.execute(client_q)
    clients = client_result.scalars().all()

    rows = []
    for c in clients:
        inv_q = select(Invoice).where(Invoice.client_id == c.id)
        inv_result = await db.execute(inv_q)
        invoices = inv_result.scalars().all()

        total_invoiced = sum(float(i.total_amount) for i in invoices)
        total_paid = sum(float(i.total_amount) - float(i.balance_due) for i in invoices)
        total_outstanding = sum(float(i.balance_due) for i in invoices if i.status.value in ["sent", "partial", "overdue"])

        rows.append({
            "client": c.company_name,
            "status": c.status.value if c.status else "",
            "total_invoices": len(invoices),
            "total_invoiced": total_invoiced,
            "total_paid": total_paid,
            "total_outstanding": total_outstanding,
        })

    return {"count": len(rows), "clients": rows}
