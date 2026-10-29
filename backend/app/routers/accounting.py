from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text, func
from typing import Optional, List
from decimal import Decimal
from pydantic import BaseModel
from datetime import datetime, timezone, date

from app.database import get_db
from app.models.accounting import Account, AccountType, JournalEntry, JournalEntryLine
from app.models.invoice import Invoice, InvoiceStatus
from app.models.payment_voucher import PaymentVoucher, PVStatus
from app.middleware.auth import get_current_user
from app.middleware.rbac import apply_tenant_filter, get_effective_tenant_id

router = APIRouter(prefix="/accounting", tags=["accounting"])

# ── Default Chart of Accounts (Malaysian) ─────────────────────────────────────

DEFAULT_ACCOUNTS = [
    # Assets
    ("1100", "Cash & Bank",           AccountType.asset),
    ("1200", "Accounts Receivable",   AccountType.asset),
    ("1300", "Inventory",             AccountType.asset),
    ("1400", "Prepaid Expenses",      AccountType.asset),
    ("1500", "Fixed Assets",          AccountType.asset),
    # Liabilities
    ("2100", "Accounts Payable",      AccountType.liability),
    ("2200", "Tax Payable (SST)",     AccountType.liability),
    ("2300", "Short-term Loans",      AccountType.liability),
    ("2400", "Long-term Loans",       AccountType.liability),
    # Equity
    ("3100", "Owner's Capital",       AccountType.equity),
    ("3200", "Retained Earnings",     AccountType.equity),
    ("3300", "Drawings",              AccountType.equity),
    # Revenue
    ("4100", "Sales Revenue",         AccountType.revenue),
    ("4200", "Service Revenue",       AccountType.revenue),
    ("4300", "Other Income",          AccountType.revenue),
    # Expenses
    ("5100", "Cost of Goods Sold",    AccountType.expense),
    ("5200", "Salaries & Wages",      AccountType.expense),
    ("5300", "Rent & Utilities",      AccountType.expense),
    ("5400", "Office & Administration", AccountType.expense),
    ("5500", "Marketing & Advertising", AccountType.expense),
    ("5600", "Transportation",        AccountType.expense),
    ("5700", "Professional Fees",     AccountType.expense),
    ("5800", "Bank Charges",          AccountType.expense),
    ("5900", "Depreciation",          AccountType.expense),
    ("5950", "Other Expenses",        AccountType.expense),
]


async def _seed_default_accounts(db: AsyncSession, tenant_id):
    result = await db.execute(
        select(Account).where(Account.tenant_id == tenant_id, Account.is_deleted == 0).limit(1)
    )
    if result.scalar_one_or_none():
        return  # already seeded
    for code, name, atype in DEFAULT_ACCOUNTS:
        db.add(Account(
            tenant_id=tenant_id,
            code=code,
            name=name,
            account_type=atype,
            is_system=1,
        ))
    await db.commit()


async def _next_entry_number(db: AsyncSession, tenant_id) -> str:
    year = datetime.now().year
    pattern = f"JE-{year}-%"
    result = await db.execute(
        select(JournalEntry.entry_number)
        .where(JournalEntry.tenant_id == tenant_id, JournalEntry.entry_number.like(pattern))
        .order_by(JournalEntry.entry_number.desc())
        .limit(1)
    )
    last = result.scalar_one_or_none()
    seq = 1
    if last:
        try:
            seq = int(last.split("-")[-1]) + 1
        except (ValueError, IndexError):
            seq = 1
    return f"JE-{year}-{seq:04d}"


def _entry_to_dict(e: JournalEntry) -> dict:
    return {
        "id": e.id,
        "entry_number": e.entry_number,
        "date": e.date.isoformat() if e.date else None,
        "description": e.description,
        "reference_type": e.reference_type,
        "reference_id": e.reference_id,
        "created_at": e.created_at.isoformat() if e.created_at else None,
        "lines": [
            {
                "id": l.id,
                "account_id": l.account_id,
                "account_code": l.account.code if l.account else None,
                "account_name": l.account.name if l.account else None,
                "debit": float(l.debit),
                "credit": float(l.credit),
                "description": l.description,
            }
            for l in (e.lines or [])
        ],
        "total": float(sum(l.debit for l in (e.lines or []))),
    }


def _account_to_dict(a: Account) -> dict:
    return {
        "id": a.id,
        "code": a.code,
        "name": a.name,
        "account_type": a.account_type,
        "description": a.description,
        "is_system": bool(a.is_system),
    }


# ── Schemas ────────────────────────────────────────────────────────────────────

class AccountCreate(BaseModel):
    code: str
    name: str
    account_type: AccountType
    description: Optional[str] = None


class AccountUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


class EntryLineIn(BaseModel):
    account_id: int
    debit: float = 0
    credit: float = 0
    description: Optional[str] = None


class EntryCreate(BaseModel):
    date: str
    description: str
    lines: List[EntryLineIn]


# ── Accounts ───────────────────────────────────────────────────────────────────

@router.get("/accounts")
async def list_accounts(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    tid = get_effective_tenant_id(current_user)
    await _seed_default_accounts(db, tid)
    result = await db.execute(
        select(Account)
        .where(Account.tenant_id == tid, Account.is_deleted == 0)
        .order_by(Account.code)
    )
    return [_account_to_dict(a) for a in result.scalars().all()]


@router.post("/accounts", status_code=status.HTTP_201_CREATED)
async def create_account(
    body: AccountCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    tid = get_effective_tenant_id(current_user)
    acc = Account(tenant_id=tid, code=body.code, name=body.name,
                  account_type=body.account_type, description=body.description)
    db.add(acc)
    await db.commit()
    await db.refresh(acc)
    return _account_to_dict(acc)


@router.put("/accounts/{acc_id}")
async def update_account(
    acc_id: int,
    body: AccountUpdate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    tid = get_effective_tenant_id(current_user)
    result = await db.execute(
        select(Account).where(Account.id == acc_id, Account.tenant_id == tid, Account.is_deleted == 0)
    )
    acc = result.scalar_one_or_none()
    if not acc:
        raise HTTPException(404, "Account not found")
    if body.name:
        acc.name = body.name
    if body.description is not None:
        acc.description = body.description
    await db.commit()
    await db.refresh(acc)
    return _account_to_dict(acc)


@router.delete("/accounts/{acc_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_account(
    acc_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    tid = get_effective_tenant_id(current_user)
    result = await db.execute(
        select(Account).where(Account.id == acc_id, Account.tenant_id == tid, Account.is_deleted == 0)
    )
    acc = result.scalar_one_or_none()
    if not acc:
        raise HTTPException(404, "Account not found")
    if acc.is_system:
        raise HTTPException(400, "Cannot delete a system account")
    acc.is_deleted = 1
    await db.commit()


# ── Journal Entries ────────────────────────────────────────────────────────────

@router.get("/entries")
async def list_entries(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    tid = get_effective_tenant_id(current_user)
    q = (
        select(JournalEntry)
        .where(JournalEntry.tenant_id == tid, JournalEntry.is_deleted == 0)
    )
    if start_date:
        q = q.where(JournalEntry.date >= datetime.fromisoformat(start_date))
    if end_date:
        q = q.where(JournalEntry.date <= datetime.fromisoformat(end_date + "T23:59:59"))
    total_r = await db.execute(q.with_only_columns(JournalEntry.id))
    total = len(total_r.all())
    q = q.order_by(JournalEntry.date.desc(), JournalEntry.id.desc()).offset(skip).limit(limit)
    result = await db.execute(q)
    entries = result.scalars().all()
    # eager load lines+accounts
    from sqlalchemy.orm import selectinload
    ids = [e.id for e in entries]
    if ids:
        lined = await db.execute(
            select(JournalEntry)
            .options(selectinload(JournalEntry.lines).selectinload(JournalEntryLine.account))
            .where(JournalEntry.id.in_(ids))
            .order_by(JournalEntry.date.desc(), JournalEntry.id.desc())
        )
        entries = lined.scalars().all()
    return {"total": total, "items": [_entry_to_dict(e) for e in entries]}


@router.post("/entries", status_code=status.HTTP_201_CREATED)
async def create_entry(
    body: EntryCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    tid = get_effective_tenant_id(current_user)
    total_debit = sum(l.debit for l in body.lines)
    total_credit = sum(l.credit for l in body.lines)
    if round(total_debit, 2) != round(total_credit, 2):
        raise HTTPException(400, f"Debits ({total_debit:.2f}) must equal credits ({total_credit:.2f})")

    number = await _next_entry_number(db, tid)
    entry = JournalEntry(
        tenant_id=tid,
        entry_number=number,
        date=datetime.fromisoformat(body.date),
        description=body.description,
        reference_type="manual",
        created_by=current_user.id,
    )
    db.add(entry)
    await db.flush()
    for l in body.lines:
        db.add(JournalEntryLine(
            journal_entry_id=entry.id,
            account_id=l.account_id,
            debit=Decimal(str(l.debit)),
            credit=Decimal(str(l.credit)),
            description=l.description,
        ))
    await db.commit()

    from sqlalchemy.orm import selectinload
    r = await db.execute(
        select(JournalEntry)
        .options(selectinload(JournalEntry.lines).selectinload(JournalEntryLine.account))
        .where(JournalEntry.id == entry.id)
    )
    return _entry_to_dict(r.scalar_one())


@router.delete("/entries/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_entry(
    entry_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    tid = get_effective_tenant_id(current_user)
    result = await db.execute(
        select(JournalEntry).where(
            JournalEntry.id == entry_id,
            JournalEntry.tenant_id == tid,
            JournalEntry.is_deleted == 0,
        )
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(404, "Entry not found")
    if entry.reference_type in ("invoice", "payment_voucher"):
        raise HTTPException(400, "Cannot delete auto-synced entries. Remove via source document.")
    entry.is_deleted = 1
    await db.commit()


# ── Auto-sync ──────────────────────────────────────────────────────────────────

@router.post("/sync")
async def sync_from_documents(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    tid = get_effective_tenant_id(current_user)
    await _seed_default_accounts(db, tid)

    # Get account ids
    async def get_account(code: str) -> int:
        r = await db.execute(
            select(Account.id).where(Account.tenant_id == tid, Account.code == code, Account.is_deleted == 0)
        )
        acc_id = r.scalar_one_or_none()
        if not acc_id:
            raise HTTPException(500, f"Account {code} not found — please check Chart of Accounts")
        return acc_id

    cash_id = await get_account("1100")
    ar_id = await get_account("1200")
    revenue_id = await get_account("4100")
    expense_id = await get_account("5950")

    created = 0

    # ── Sync paid invoices ─────────────────────────────────────────────────────
    synced_inv = await db.execute(
        select(JournalEntry.reference_id)
        .where(JournalEntry.tenant_id == tid, JournalEntry.reference_type == "invoice", JournalEntry.is_deleted == 0)
    )
    already_inv = set(synced_inv.scalars().all())

    inv_result = await db.execute(
        select(Invoice).where(
            Invoice.tenant_id == tid,
            Invoice.status == InvoiceStatus.paid,
            Invoice.is_deleted == False,
        )
    )
    invoices = inv_result.scalars().all()

    for inv in invoices:
        if inv.id in already_inv:
            continue
        amount = Decimal(str(inv.total or 0))
        if amount <= 0:
            continue
        number = await _next_entry_number(db, tid)
        entry = JournalEntry(
            tenant_id=tid,
            entry_number=number,
            date=inv.paid_at or inv.created_at or datetime.now(timezone.utc),
            description=f"Invoice {inv.invoice_number} — {inv.client_name or ''}",
            reference_type="invoice",
            reference_id=inv.id,
            created_by=current_user.id,
        )
        db.add(entry)
        await db.flush()
        db.add(JournalEntryLine(journal_entry_id=entry.id, account_id=cash_id, debit=amount, credit=Decimal("0")))
        db.add(JournalEntryLine(journal_entry_id=entry.id, account_id=revenue_id, debit=Decimal("0"), credit=amount))
        created += 1

    # ── Sync approved payment vouchers ────────────────────────────────────────
    synced_pv = await db.execute(
        select(JournalEntry.reference_id)
        .where(JournalEntry.tenant_id == tid, JournalEntry.reference_type == "payment_voucher", JournalEntry.is_deleted == 0)
    )
    already_pv = set(synced_pv.scalars().all())

    pv_result = await db.execute(
        select(PaymentVoucher).where(
            PaymentVoucher.tenant_id == tid,
            PaymentVoucher.status == PVStatus.approved,
            PaymentVoucher.is_deleted == False,
        )
    )
    pvs = pv_result.scalars().all()

    for pv in pvs:
        if pv.id in already_pv:
            continue
        amount = Decimal(str(pv.amount or 0))
        if amount <= 0:
            continue
        number = await _next_entry_number(db, tid)
        entry = JournalEntry(
            tenant_id=tid,
            entry_number=number,
            date=pv.date or datetime.now(timezone.utc),
            description=f"Payment Voucher {pv.voucher_number} — {pv.payee_name}",
            reference_type="payment_voucher",
            reference_id=pv.id,
            created_by=current_user.id,
        )
        db.add(entry)
        await db.flush()
        db.add(JournalEntryLine(journal_entry_id=entry.id, account_id=expense_id, debit=amount, credit=Decimal("0")))
        db.add(JournalEntryLine(journal_entry_id=entry.id, account_id=cash_id, debit=Decimal("0"), credit=amount))
        created += 1

    await db.commit()
    return {"synced": created, "message": f"Synced {created} new entries"}


# ── Reports ────────────────────────────────────────────────────────────────────

async def _get_balances(db: AsyncSession, tenant_id, start=None, end=None):
    """Returns {account_id: {debit_total, credit_total, account}} for the period."""
    from sqlalchemy.orm import selectinload
    q = (
        select(JournalEntryLine)
        .join(JournalEntry, JournalEntryLine.journal_entry_id == JournalEntry.id)
        .options(selectinload(JournalEntryLine.account))
        .where(
            JournalEntry.tenant_id == tenant_id,
            JournalEntry.is_deleted == 0,
        )
    )
    if start:
        q = q.where(JournalEntry.date >= start)
    if end:
        q = q.where(JournalEntry.date <= end)
    result = await db.execute(q)
    lines = result.scalars().all()

    balances = {}
    for l in lines:
        if not l.account or l.account.is_deleted:
            continue
        aid = l.account_id
        if aid not in balances:
            balances[aid] = {"debit": Decimal("0"), "credit": Decimal("0"), "account": l.account}
        balances[aid]["debit"] += l.debit
        balances[aid]["credit"] += l.credit
    return balances


@router.get("/reports/pl")
async def report_pl(
    start_date: str = Query(...),
    end_date: str = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    tid = get_effective_tenant_id(current_user)
    start = datetime.fromisoformat(start_date)
    end = datetime.fromisoformat(end_date + "T23:59:59")
    balances = await _get_balances(db, tid, start, end)

    revenue_rows = []
    expense_rows = []
    total_revenue = Decimal("0")
    total_expense = Decimal("0")

    for aid, b in balances.items():
        acc = b["account"]
        # Revenue: normal credit balance → net = credit - debit
        if acc.account_type == AccountType.revenue:
            net = b["credit"] - b["debit"]
            revenue_rows.append({"code": acc.code, "name": acc.name, "amount": float(net)})
            total_revenue += net
        elif acc.account_type == AccountType.expense:
            net = b["debit"] - b["credit"]
            expense_rows.append({"code": acc.code, "name": acc.name, "amount": float(net)})
            total_expense += net

    revenue_rows.sort(key=lambda x: x["code"])
    expense_rows.sort(key=lambda x: x["code"])

    return {
        "start_date": start_date,
        "end_date": end_date,
        "revenue": revenue_rows,
        "expenses": expense_rows,
        "total_revenue": float(total_revenue),
        "total_expenses": float(total_expense),
        "net_profit": float(total_revenue - total_expense),
    }


@router.get("/reports/balance-sheet")
async def report_balance_sheet(
    as_of: str = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    tid = get_effective_tenant_id(current_user)
    end = datetime.fromisoformat(as_of + "T23:59:59")
    balances = await _get_balances(db, tid, end=end)

    assets, liabilities, equity = [], [], []
    total_assets = total_liabilities = total_equity = Decimal("0")

    for aid, b in balances.items():
        acc = b["account"]
        net_debit = b["debit"] - b["credit"]
        net_credit = b["credit"] - b["debit"]
        row = {"code": acc.code, "name": acc.name}

        if acc.account_type == AccountType.asset:
            row["amount"] = float(net_debit)
            assets.append(row)
            total_assets += net_debit
        elif acc.account_type == AccountType.liability:
            row["amount"] = float(net_credit)
            liabilities.append(row)
            total_liabilities += net_credit
        elif acc.account_type in (AccountType.equity, AccountType.revenue, AccountType.expense):
            # Retained earnings = revenue - expense; equity accounts use credit balance
            if acc.account_type == AccountType.revenue:
                row["amount"] = float(net_credit)
                total_equity += net_credit
            elif acc.account_type == AccountType.expense:
                row["amount"] = float(-net_debit)
                total_equity -= net_debit
            else:
                row["amount"] = float(net_credit)
                total_equity += net_credit
            equity.append(row)

    for lst in (assets, liabilities, equity):
        lst.sort(key=lambda x: x["code"])

    return {
        "as_of": as_of,
        "assets": assets,
        "liabilities": liabilities,
        "equity": equity,
        "total_assets": float(total_assets),
        "total_liabilities": float(total_liabilities),
        "total_equity": float(total_equity),
    }


@router.get("/reports/cash-flow")
async def report_cash_flow(
    year: int = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    tid = get_effective_tenant_id(current_user)
    start = datetime(year, 1, 1)
    end = datetime(year, 12, 31, 23, 59, 59)
    balances = await _get_balances(db, tid, start, end)

    # Monthly cash flow via Cash & Bank account (1100)
    from sqlalchemy.orm import selectinload
    q = (
        select(JournalEntryLine)
        .join(JournalEntry, JournalEntryLine.journal_entry_id == JournalEntry.id)
        .join(Account, JournalEntryLine.account_id == Account.id)
        .options(selectinload(JournalEntryLine.entry))
        .where(
            JournalEntry.tenant_id == tid,
            JournalEntry.is_deleted == 0,
            Account.code == "1100",
            JournalEntry.date >= start,
            JournalEntry.date <= end,
        )
    )
    result = await db.execute(q)
    lines = result.scalars().all()

    monthly: dict[int, dict] = {m: {"month": m, "cash_in": 0.0, "cash_out": 0.0, "net": 0.0} for m in range(1, 13)}
    for l in lines:
        m = l.entry.date.month
        monthly[m]["cash_in"] += float(l.debit)
        monthly[m]["cash_out"] += float(l.credit)
        monthly[m]["net"] = monthly[m]["cash_in"] - monthly[m]["cash_out"]

    return {"year": year, "months": list(monthly.values())}


@router.get("/reports/trial-balance")
async def report_trial_balance(
    as_of: str = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    tid = get_effective_tenant_id(current_user)
    end = datetime.fromisoformat(as_of + "T23:59:59")
    balances = await _get_balances(db, tid, end=end)

    rows = []
    total_debit = total_credit = Decimal("0")
    for aid, b in balances.items():
        acc = b["account"]
        rows.append({
            "code": acc.code,
            "name": acc.name,
            "account_type": acc.account_type,
            "debit": float(b["debit"]),
            "credit": float(b["credit"]),
        })
        total_debit += b["debit"]
        total_credit += b["credit"]

    rows.sort(key=lambda x: x["code"])
    return {
        "as_of": as_of,
        "rows": rows,
        "total_debit": float(total_debit),
        "total_credit": float(total_credit),
        "balanced": round(total_debit, 2) == round(total_credit, 2),
    }


@router.get("/summary")
async def summary(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Quick summary for the dashboard — current year P&L."""
    tid = get_effective_tenant_id(current_user)
    year = datetime.now().year
    start = datetime(year, 1, 1)
    end = datetime(year, 12, 31, 23, 59, 59)
    balances = await _get_balances(db, tid, start, end)

    total_revenue = total_expense = Decimal("0")
    for b in balances.values():
        acc = b["account"]
        if acc.account_type == AccountType.revenue:
            total_revenue += b["credit"] - b["debit"]
        elif acc.account_type == AccountType.expense:
            total_expense += b["debit"] - b["credit"]

    # count entries
    count_r = await db.execute(
        select(func.count(JournalEntry.id)).where(
            JournalEntry.tenant_id == tid, JournalEntry.is_deleted == 0
        )
    )
    entry_count = count_r.scalar() or 0

    return {
        "year": year,
        "total_revenue": float(total_revenue),
        "total_expenses": float(total_expense),
        "net_profit": float(total_revenue - total_expense),
        "entry_count": entry_count,
    }
