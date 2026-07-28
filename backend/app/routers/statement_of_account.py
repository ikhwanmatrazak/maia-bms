import io
from datetime import datetime, date, timezone, timedelta
from typing import Optional, List

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from app.database import get_db
from app.models.user import User
from app.middleware.auth import get_current_user
from app.middleware.rbac import require_admin_or_manager, get_effective_tenant_id

router = APIRouter(prefix="/finance/soa", tags=["statement-of-account"])


# ── Helpers ───────────────────────────────────────────────────────────────────

def _tid(u: User):
    return get_effective_tenant_id(u)


def _tf(tid):
    return "" if tid is None else "AND tenant_id = :tid"


def _fmt(v) -> str:
    try:
        return f"{float(v):,.2f}"
    except Exception:
        return "0.00"


def _aged(rows, today: date):
    """
    Given a list of dicts with 'due_date' and 'amount', bucket into aged brackets.
    due_date can be None (treated as current).
    """
    buckets = {"current": 0.0, "d1_30": 0.0, "d31_60": 0.0, "d61_90": 0.0, "d91_plus": 0.0}
    for r in rows:
        amt = float(r["amount"])
        dd = r.get("due_date")
        if dd is None:
            buckets["current"] += amt
            continue
        if isinstance(dd, str):
            try:
                dd = date.fromisoformat(dd[:10])
            except Exception:
                buckets["current"] += amt
                continue
        if hasattr(dd, "date"):
            dd = dd.date()
        days_past = (today - dd).days
        if days_past <= 0:
            buckets["current"] += amt
        elif days_past <= 30:
            buckets["d1_30"] += amt
        elif days_past <= 60:
            buckets["d31_60"] += amt
        elif days_past <= 90:
            buckets["d61_90"] += amt
        else:
            buckets["d91_plus"] += amt
    buckets["total"] = sum(buckets.values())
    return {k: round(v, 2) for k, v in buckets.items()}


async def _get_company(db: AsyncSession, tid):
    row = await db.execute(
        text("SELECT * FROM company_settings WHERE (tenant_id=:tid OR (tenant_id IS NULL AND :tid IS NULL)) LIMIT 1"),
        {"tid": tid},
    )
    return dict(row.mappings().first() or {})


# ── CLIENT endpoints ──────────────────────────────────────────────────────────

@router.get("/clients")
async def list_clients(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_manager()),
):
    tid = _tid(current_user)
    tf = _tf(tid)
    rows = await db.execute(
        text(f"SELECT id, company_name, email, phone FROM clients WHERE 1=1 {tf} ORDER BY company_name"),
        {"tid": tid},
    )
    return [dict(r._mapping) for r in rows.fetchall()]


@router.get("/client/{client_id}")
async def client_statement(
    client_id: int,
    date_from: Optional[str] = Query(None, description="YYYY-MM-DD"),
    date_to: Optional[str] = Query(None, description="YYYY-MM-DD"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_manager()),
):
    tid = _tid(current_user)
    today = date.today()
    df = date.fromisoformat(date_from) if date_from else date(today.year, today.month, 1)
    dt = date.fromisoformat(date_to) if date_to else today
    df_dt = datetime.combine(df, datetime.min.time())
    dt_dt = datetime.combine(dt, datetime.max.time())

    # Client info
    client_row = await db.execute(
        text("SELECT id, company_name, email, phone, address FROM clients WHERE id=:cid"),
        {"cid": client_id},
    )
    client = dict(client_row.mappings().first() or {})

    # Opening balance: outstanding invoice balance before date_from
    ob_row = await db.execute(
        text("""
            SELECT COALESCE(SUM(balance_due), 0)
            FROM invoices
            WHERE client_id = :cid
              AND issue_date < :df
              AND status IN ('sent', 'partial', 'overdue')
        """),
        {"cid": client_id, "df": df_dt},
    )
    opening_balance = float(ob_row.scalar() or 0)

    # Invoices in period (debit)
    inv_rows = await db.execute(
        text("""
            SELECT id, invoice_number, issue_date, due_date, total, balance_due, status,
                   'invoice' AS txn_type
            FROM invoices
            WHERE client_id = :cid
              AND issue_date BETWEEN :df AND :dt
              AND status != 'draft'
            ORDER BY issue_date
        """),
        {"cid": client_id, "df": df_dt, "dt": dt_dt},
    )
    invoices = [dict(r._mapping) for r in inv_rows.fetchall()]

    # Payments received in period (credit)
    pay_rows = await db.execute(
        text("""
            SELECT p.id, p.payment_date, p.amount, p.reference_number,
                   i.invoice_number, 'payment' AS txn_type
            FROM payments p
            JOIN invoices i ON p.invoice_id = i.id
            WHERE i.client_id = :cid
              AND p.payment_date BETWEEN :df AND :dt
            ORDER BY p.payment_date
        """),
        {"cid": client_id, "df": df_dt, "dt": dt_dt},
    )
    payments = [dict(r._mapping) for r in pay_rows.fetchall()]

    # Credit notes in period (credit)
    cn_rows = await db.execute(
        text("""
            SELECT id, credit_note_number, issue_date, total, status,
                   'credit_note' AS txn_type
            FROM credit_notes
            WHERE client_id = :cid
              AND issue_date BETWEEN :df AND :dt
              AND status != 'draft'
            ORDER BY issue_date
        """),
        {"cid": client_id, "df": df_dt, "dt": dt_dt},
    )
    credit_notes = [dict(r._mapping) for r in cn_rows.fetchall()]

    # Merge and sort all transactions by date
    txns = []
    for inv in invoices:
        txns.append({
            "date": inv["issue_date"].date().isoformat() if hasattr(inv["issue_date"], "date") else str(inv["issue_date"])[:10],
            "type": "Invoice",
            "reference": inv["invoice_number"],
            "description": f"Invoice {inv['invoice_number']}",
            "debit": float(inv["total"]),
            "credit": 0.0,
            "due_date": inv["due_date"].date().isoformat() if inv.get("due_date") and hasattr(inv["due_date"], "date") else None,
            "status": inv["status"],
        })
    for pay in payments:
        txns.append({
            "date": pay["payment_date"].date().isoformat() if hasattr(pay["payment_date"], "date") else str(pay["payment_date"])[:10],
            "type": "Payment",
            "reference": pay.get("reference_number") or f"Re: {pay['invoice_number']}",
            "description": f"Payment received — {pay['invoice_number']}",
            "debit": 0.0,
            "credit": float(pay["amount"]),
            "due_date": None,
            "status": "paid",
        })
    for cn in credit_notes:
        txns.append({
            "date": cn["issue_date"].date().isoformat() if hasattr(cn["issue_date"], "date") else str(cn["issue_date"])[:10],
            "type": "Credit Note",
            "reference": cn["credit_note_number"],
            "description": f"Credit Note {cn['credit_note_number']}",
            "debit": 0.0,
            "credit": float(cn["total"]),
            "due_date": None,
            "status": cn["status"],
        })

    txns.sort(key=lambda x: x["date"])

    # Running balance
    running = opening_balance
    for t in txns:
        running += t["debit"] - t["credit"]
        t["balance"] = round(running, 2)
    closing_balance = round(running, 2)

    # Aged analysis: outstanding invoices as of today
    outstanding_rows = await db.execute(
        text("""
            SELECT balance_due AS amount, due_date
            FROM invoices
            WHERE client_id = :cid
              AND status IN ('sent', 'partial', 'overdue')
              AND balance_due > 0
        """),
        {"cid": client_id},
    )
    aged = _aged([dict(r._mapping) for r in outstanding_rows.fetchall()], today)

    return {
        "mode": "client",
        "client": client,
        "date_from": df.isoformat(),
        "date_to": dt.isoformat(),
        "opening_balance": round(opening_balance, 2),
        "transactions": txns,
        "closing_balance": closing_balance,
        "aged": aged,
    }


@router.get("/client/{client_id}/pdf")
async def client_statement_pdf(
    client_id: int,
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_manager()),
):
    from weasyprint import HTML
    from jinja2 import Environment, FileSystemLoader
    from pathlib import Path
    import asyncio

    tid = _tid(current_user)
    data = await client_statement(client_id, date_from, date_to, db, current_user)
    company = await _get_company(db, tid)

    from app.services.signature_service import get_logo_base64
    logo_data = get_logo_base64(company.get("logo_url"))

    TEMPLATES_DIR = Path(__file__).parent.parent / "templates" / "pdf"
    env = Environment(loader=FileSystemLoader(str(TEMPLATES_DIR)))
    env.filters["fmt"] = _fmt
    html = env.get_template("soa.html").render(
        data=data,
        company=company,
        logo_data=logo_data,
        now=datetime.now().strftime("%d %B %Y %H:%M"),
    )

    loop = asyncio.get_event_loop()
    pdf_bytes = await loop.run_in_executor(None, lambda: HTML(string=html).write_pdf())

    client_name = (data["client"].get("company_name") or "client").replace(" ", "_")
    fname = f"SOA_{client_name}_{data['date_from']}_{data['date_to']}.pdf"
    return Response(content=pdf_bytes, media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="{fname}"'})


# ── VENDOR endpoints ──────────────────────────────────────────────────────────

@router.get("/vendors")
async def list_vendors(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_manager()),
):
    tid = _tid(current_user)
    tf = _tf(tid)
    # Distinct vendor names from both POs and Bills
    rows = await db.execute(
        text(f"""
            SELECT DISTINCT vendor_name FROM (
                SELECT vendor_name FROM purchase_orders WHERE vendor_name IS NOT NULL AND is_deleted=0 {tf}
                UNION
                SELECT vendor_name FROM bills WHERE vendor_name IS NOT NULL AND is_deleted=0 {tf}
            ) v
            ORDER BY vendor_name
        """),
        {"tid": tid},
    )
    names = [r[0] for r in rows.fetchall() if r[0]]
    return [{"name": n} for n in names]


@router.get("/vendor")
async def vendor_statement(
    vendor_name: str = Query(..., description="Exact vendor name"),
    date_from: Optional[str] = Query(None, description="YYYY-MM-DD"),
    date_to: Optional[str] = Query(None, description="YYYY-MM-DD"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_manager()),
):
    tid = _tid(current_user)
    tf = _tf(tid)
    today = date.today()
    df = date.fromisoformat(date_from) if date_from else date(today.year, today.month, 1)
    dt = date.fromisoformat(date_to) if date_to else today
    df_dt = datetime.combine(df, datetime.min.time())
    dt_dt = datetime.combine(dt, datetime.max.time())

    # Opening balance: unpaid bills before date_from
    ob_params: dict = {"vname": vendor_name, "df": df_dt, "tid": tid}
    ob_row = await db.execute(
        text(f"""
            SELECT COALESCE(SUM(amount), 0)
            FROM bills
            WHERE vendor_name = :vname
              AND issue_date < :df
              AND status IN ('pending', 'overdue')
              AND is_deleted = 0
              {tf}
        """),
        ob_params,
    )
    opening_balance = float(ob_row.scalar() or 0)

    # Bills in period (debit — new obligations)
    params: dict = {"vname": vendor_name, "df": df_dt, "dt": dt_dt, "tid": tid}
    bill_rows = await db.execute(
        text(f"""
            SELECT id, bill_number, issue_date, due_date, amount, status,
                   'bill' AS txn_type
            FROM bills
            WHERE vendor_name = :vname
              AND issue_date BETWEEN :df AND :dt
              AND is_deleted = 0
              {tf}
            ORDER BY issue_date
        """),
        params,
    )
    bills = [dict(r._mapping) for r in bill_rows.fetchall()]

    # Bills paid in period (credit — payments made)
    paid_rows = await db.execute(
        text(f"""
            SELECT id, bill_number, paid_at, amount, payment_reference,
                   'payment' AS txn_type
            FROM bills
            WHERE vendor_name = :vname
              AND status = 'paid'
              AND paid_at BETWEEN :df AND :dt
              AND is_deleted = 0
              {tf}
            ORDER BY paid_at
        """),
        params,
    )
    paid_bills = [dict(r._mapping) for r in paid_rows.fetchall()]

    # POs in period (informational — no financial impact until billed)
    po_rows = await db.execute(
        text(f"""
            SELECT id, po_number, issue_date, total, status,
                   'po' AS txn_type
            FROM purchase_orders
            WHERE vendor_name = :vname
              AND issue_date BETWEEN :df AND :dt
              AND is_deleted = 0
              {tf}
              AND status != 'cancelled'
            ORDER BY issue_date
        """),
        params,
    )
    pos = [dict(r._mapping) for r in po_rows.fetchall()]

    # Build transaction list
    txns = []
    for b in bills:
        txns.append({
            "date": b["issue_date"].date().isoformat() if hasattr(b["issue_date"], "date") else str(b["issue_date"])[:10] if b["issue_date"] else "",
            "type": "Bill",
            "reference": b.get("bill_number") or f"Bill #{b['id']}",
            "description": f"Bill from {vendor_name}",
            "debit": float(b["amount"] or 0),
            "credit": 0.0,
            "due_date": b["due_date"].date().isoformat() if b.get("due_date") and hasattr(b["due_date"], "date") else None,
            "status": b["status"],
        })
    for pb in paid_bills:
        txns.append({
            "date": pb["paid_at"].date().isoformat() if hasattr(pb["paid_at"], "date") else str(pb["paid_at"])[:10] if pb["paid_at"] else "",
            "type": "Payment",
            "reference": pb.get("payment_reference") or f"Re: {pb.get('bill_number', pb['id'])}",
            "description": f"Payment made — {pb.get('bill_number', '')}",
            "debit": 0.0,
            "credit": float(pb["amount"] or 0),
            "due_date": None,
            "status": "paid",
        })
    for po in pos:
        txns.append({
            "date": po["issue_date"].date().isoformat() if hasattr(po["issue_date"], "date") else str(po["issue_date"])[:10] if po["issue_date"] else "",
            "type": "Purchase Order",
            "reference": po["po_number"],
            "description": f"PO {po['po_number']} — {po['status']}",
            "debit": 0.0,
            "credit": 0.0,
            "due_date": None,
            "status": po["status"],
            "info_only": True,
        })

    txns.sort(key=lambda x: x["date"])

    # Running balance (only bills and payments affect balance)
    running = opening_balance
    for t in txns:
        if not t.get("info_only"):
            running += t["debit"] - t["credit"]
        t["balance"] = round(running, 2) if not t.get("info_only") else None
    closing_balance = round(running, 2)

    # Aged: outstanding bills as of today
    aged_params: dict = {"vname": vendor_name, "tid": tid}
    aged_rows = await db.execute(
        text(f"""
            SELECT amount, due_date
            FROM bills
            WHERE vendor_name = :vname
              AND status IN ('pending', 'overdue')
              AND is_deleted = 0
              {tf}
        """),
        aged_params,
    )
    aged = _aged([dict(r._mapping) for r in aged_rows.fetchall()], today)

    return {
        "mode": "vendor",
        "vendor_name": vendor_name,
        "date_from": df.isoformat(),
        "date_to": dt.isoformat(),
        "opening_balance": round(opening_balance, 2),
        "transactions": txns,
        "closing_balance": closing_balance,
        "aged": aged,
    }


@router.get("/vendor/pdf")
async def vendor_statement_pdf(
    vendor_name: str = Query(...),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_manager()),
):
    from weasyprint import HTML
    from jinja2 import Environment, FileSystemLoader
    from pathlib import Path
    import asyncio

    tid = _tid(current_user)
    data = await vendor_statement(vendor_name, date_from, date_to, db, current_user)
    company = await _get_company(db, tid)

    from app.services.signature_service import get_logo_base64
    logo_data = get_logo_base64(company.get("logo_url"))

    TEMPLATES_DIR = Path(__file__).parent.parent / "templates" / "pdf"
    env = Environment(loader=FileSystemLoader(str(TEMPLATES_DIR)))
    env.filters["fmt"] = _fmt
    html = env.get_template("soa.html").render(
        data=data,
        company=company,
        logo_data=logo_data,
        now=datetime.now().strftime("%d %B %Y %H:%M"),
    )

    loop = asyncio.get_event_loop()
    pdf_bytes = await loop.run_in_executor(None, lambda: HTML(string=html).write_pdf())

    safe_name = vendor_name.replace(" ", "_")[:30]
    fname = f"SOA_{safe_name}_{data['date_from']}_{data['date_to']}.pdf"
    return Response(content=pdf_bytes, media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="{fname}"'})
