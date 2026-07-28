import io
from datetime import datetime, date, timezone
from typing import List, Optional
from decimal import Decimal

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from app.database import get_db
from app.models.user import User
from app.middleware.auth import get_current_user
from app.middleware.rbac import require_admin_or_manager, get_effective_tenant_id

router = APIRouter(prefix="/finance/balance-sheet", tags=["balance-sheet"])


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class BSItem(BaseModel):
    id: Optional[int] = None
    section: str
    label: str
    amount: float
    sort_order: int = 0


class SaveItemsIn(BaseModel):
    items: List[BSItem]


# ── Helpers ───────────────────────────────────────────────────────────────────

def _tid_filter(current_user: User):
    return get_effective_tenant_id(current_user)


async def _get_company(db: AsyncSession, tid):
    row = await db.execute(
        text("SELECT * FROM company_settings WHERE (tenant_id=:tid OR (tenant_id IS NULL AND :tid IS NULL)) LIMIT 1"),
        {"tid": tid},
    )
    return dict(row.mappings().first() or {})


def _fmt(v) -> str:
    try:
        return f"{float(v):,.2f}"
    except Exception:
        return "0.00"


# ── Balance sheet computation ─────────────────────────────────────────────────

async def _compute_balance_sheet(db: AsyncSession, tid, as_of: date):
    as_of_dt = datetime.combine(as_of, datetime.max.time())

    # ── Auto: cash at bank (sum of bank account balances as at the date) ──────
    bank_filter = "WHERE (tenant_id=:tid OR (tenant_id IS NULL AND :tid IS NULL))"
    bank_row = await db.execute(
        text(f"""
            SELECT COALESCE(SUM(
                ob.opening_balance + COALESCE(txn.net, 0)
            ), 0)
            FROM bank_accounts ob
            LEFT JOIN (
                SELECT account_id,
                       SUM(CASE WHEN type='credit' THEN amount ELSE -amount END) AS net
                FROM bank_transactions
                WHERE txn_date <= :as_of
                  AND account_id IN (SELECT id FROM bank_accounts WHERE tenant_id=:tid OR (tenant_id IS NULL AND :tid IS NULL))
                GROUP BY account_id
            ) txn ON txn.account_id = ob.id
            {bank_filter}
        """),
        {"tid": tid, "as_of": as_of_dt},
    )
    cash_at_bank = float(bank_row.scalar() or 0)

    # ── Auto: accounts receivable (outstanding invoice balance_due as at date) ─
    ar_filter = "" if tid is None else "AND tenant_id=:tid"
    ar_row = await db.execute(
        text(f"""
            SELECT COALESCE(SUM(balance_due), 0)
            FROM invoices
            WHERE status IN ('sent','partial','overdue')
              AND created_at <= :as_of
              {ar_filter}
        """),
        {"tid": tid, "as_of": as_of_dt},
    )
    accounts_receivable = float(ar_row.scalar() or 0)

    # ── Auto: accounts payable from POs ───────────────────────────────────────
    ap_filter = "" if tid is None else "AND tenant_id=:tid"
    ap_row = await db.execute(
        text(f"""
            SELECT COALESCE(SUM(total), 0)
            FROM purchase_orders
            WHERE status IN ('sent','received')
              AND created_at <= :as_of
              {ap_filter}
        """),
        {"tid": tid, "as_of": as_of_dt},
    )
    accounts_payable_po = float(ap_row.scalar() or 0)

    # ── Auto: retained earnings = cumulative invoiced income minus expenses ───
    income_row = await db.execute(
        text(f"""
            SELECT COALESCE(SUM(amount_paid), 0)
            FROM invoices
            WHERE status IN ('paid','partial')
              AND paid_at <= :as_of
              {ar_filter}
        """),
        {"tid": tid, "as_of": as_of_dt},
    )
    total_income = float(income_row.scalar() or 0)

    exp_filter = "" if tid is None else "AND tenant_id=:tid"
    exp_row = await db.execute(
        text(f"""
            SELECT COALESCE(SUM(amount), 0)
            FROM expenses
            WHERE expense_date <= :as_of
              {exp_filter}
        """),
        {"tid": tid, "as_of": as_of_dt},
    )
    total_expenses = float(exp_row.scalar() or 0)

    retained_earnings = round(total_income - total_expenses, 2)

    # ── Manual items from DB ──────────────────────────────────────────────────
    manual_filter = "" if tid is None else "WHERE tenant_id=:tid"
    rows = await db.execute(
        text(f"SELECT id, section, label, amount, sort_order FROM balance_sheet_items {manual_filter} ORDER BY section, sort_order, id"),
        {"tid": tid},
    )
    manual_items = [dict(r._mapping) for r in rows.fetchall()]

    def items_for(section):
        return [{"id": r["id"], "label": r["label"], "amount": float(r["amount"]), "sort_order": r["sort_order"]} for r in manual_items if r["section"] == section]

    # ── Build sections ────────────────────────────────────────────────────────
    non_current_assets = items_for("non_current_assets")
    nca_total = sum(i["amount"] for i in non_current_assets)

    ca_manual = items_for("current_assets")
    ca_auto = []
    if accounts_receivable > 0:
        ca_auto.append({"label": "Accounts Receivable", "amount": accounts_receivable, "auto": True})
    ca_auto.append({"label": "Cash at Bank", "amount": cash_at_bank, "auto": True})
    ca_total = sum(i["amount"] for i in ca_auto) + sum(i["amount"] for i in ca_manual)

    total_assets = nca_total + ca_total

    equity_manual = items_for("equity")
    eq_auto = [{"label": "Retained Earnings", "amount": retained_earnings, "auto": True}]
    eq_total = sum(i["amount"] for i in equity_manual) + retained_earnings

    cl_manual = items_for("current_liabilities")
    cl_auto = []
    if accounts_payable_po > 0:
        cl_auto.append({"label": "Accounts Payable (Purchase Orders)", "amount": accounts_payable_po, "auto": True})
    cl_total = sum(i["amount"] for i in cl_auto) + sum(i["amount"] for i in cl_manual)

    total_equity_liabilities = eq_total + cl_total

    return {
        "as_of": as_of.isoformat(),
        "non_current_assets": {
            "rows": non_current_assets,
            "total": round(nca_total, 2),
        },
        "current_assets": {
            "auto_rows": ca_auto,
            "manual_rows": ca_manual,
            "total": round(ca_total, 2),
        },
        "total_assets": round(total_assets, 2),
        "equity": {
            "auto_rows": eq_auto,
            "manual_rows": equity_manual,
            "total": round(eq_total, 2),
        },
        "current_liabilities": {
            "auto_rows": cl_auto,
            "manual_rows": cl_manual,
            "total": round(cl_total, 2),
        },
        "total_liabilities": round(cl_total, 2),
        "total_equity_liabilities": round(total_equity_liabilities, 2),
        "is_balanced": abs(total_assets - total_equity_liabilities) < 0.02,
        "difference": round(total_assets - total_equity_liabilities, 2),
    }


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("")
async def get_balance_sheet(
    as_of: Optional[str] = Query(None, description="YYYY-MM-DD, defaults to today"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_manager()),
):
    tid = _tid_filter(current_user)
    if as_of:
        try:
            as_of_date = date.fromisoformat(as_of)
        except ValueError:
            as_of_date = date.today()
    else:
        as_of_date = date.today()

    return await _compute_balance_sheet(db, tid, as_of_date)


@router.get("/items")
async def get_manual_items(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_manager()),
):
    tid = _tid_filter(current_user)
    manual_filter = "" if tid is None else "WHERE tenant_id=:tid"
    rows = await db.execute(
        text(f"SELECT id, section, label, amount, sort_order FROM balance_sheet_items {manual_filter} ORDER BY section, sort_order, id"),
        {"tid": tid},
    )
    return [dict(r._mapping) for r in rows.fetchall()]


@router.put("/items")
async def save_manual_items(
    body: SaveItemsIn,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_manager()),
):
    tid = _tid_filter(current_user)

    # Delete all existing items for tenant, then re-insert
    if tid is None:
        await db.execute(text("DELETE FROM balance_sheet_items WHERE tenant_id IS NULL"))
    else:
        await db.execute(text("DELETE FROM balance_sheet_items WHERE tenant_id=:tid"), {"tid": tid})

    for i, item in enumerate(body.items):
        await db.execute(
            text("""
                INSERT INTO balance_sheet_items (tenant_id, section, label, amount, sort_order)
                VALUES (:tid, :section, :label, :amount, :sort_order)
            """),
            {
                "tid": tid,
                "section": item.section,
                "label": item.label,
                "amount": item.amount,
                "sort_order": item.sort_order if item.sort_order else i,
            },
        )
    await db.commit()
    return {"ok": True, "saved": len(body.items)}


@router.get("/pdf")
async def get_balance_sheet_pdf(
    as_of: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_manager()),
):
    from app.services.pdf_service import _render_pdf
    from jinja2 import Environment, FileSystemLoader, select_autoescape
    from pathlib import Path

    tid = _tid_filter(current_user)
    if as_of:
        try:
            as_of_date = date.fromisoformat(as_of)
        except ValueError:
            as_of_date = date.today()
    else:
        as_of_date = date.today()

    bs = await _compute_balance_sheet(db, tid, as_of_date)
    company = await _get_company(db, tid)

    # Load logo
    from app.services.signature_service import get_logo_base64
    logo_data = get_logo_base64(company.get("logo_url"))

    TEMPLATES_DIR = Path(__file__).parent.parent / "templates" / "pdf"
    env = Environment(loader=FileSystemLoader(str(TEMPLATES_DIR)), autoescape=select_autoescape(["html"]))
    env.filters["fmt"] = _fmt
    template = env.get_template("balance_sheet.html")

    now_str = datetime.now().strftime("%d %B %Y %H:%M")
    html = template.render(bs=bs, company=company, logo_data=logo_data, as_of=as_of_date.strftime("%d %B %Y"), now=now_str)

    import asyncio
    loop = asyncio.get_event_loop()
    pdf_bytes = await loop.run_in_executor(None, _render_pdf, html)

    filename = f"balance_sheet_{as_of_date.isoformat()}.pdf"
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
