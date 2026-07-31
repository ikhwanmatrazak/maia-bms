import io
import csv
from calendar import monthrange
from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from app.database import get_db
from app.models.user import User
from app.middleware.auth import get_current_user
from app.middleware.rbac import require_admin_or_manager, get_effective_tenant_id

router = APIRouter(prefix="/finance/monthly-payables", tags=["monthly-payables"])

MONTHS = ["January","February","March","April","May","June",
          "July","August","September","October","November","December"]


def _fmt(v) -> str:
    try:
        return f"{float(v):,.2f}"
    except Exception:
        return "0.00"


async def _compute(db: AsyncSession, tid, month: int, year: int) -> dict:
    last_day = monthrange(year, month)[1]
    m_start = date(year, month, 1)
    m_end   = date(year, month, last_day)

    tf     = "AND (tenant_id=:tid OR (tenant_id IS NULL AND :tid IS NULL))"
    tf_pr  = "AND (pr.tenant_id=:tid OR (pr.tenant_id IS NULL AND :tid IS NULL))"
    p  = {"tid": tid, "month": month, "year": year,
          "m_start": m_start, "m_end": m_end}

    # ── 1. Salaries ───────────────────────────────────────────────────────────
    sal_rows = await db.execute(text(f"""
        SELECT pl.id AS line_id,
               e.full_name, e.employee_no,
               pl.basic_salary, pl.transport_allowance, pl.housing_allowance,
               pl.phone_allowance, pl.other_allowance, pl.overtime_pay,
               pl.claims_reimbursement, pl.gross_pay, pl.net_pay,
               e.bank_name, e.bank_account_no, e.designation,
               pr.id AS run_id, pr.status AS run_status
        FROM hr_payslip_lines pl
        JOIN hr_employees e  ON e.id  = pl.employee_id
        JOIN hr_payroll_runs pr ON pr.id = pl.payroll_run_id
        WHERE pr.month=:month AND pr.year=:year {tf_pr}
        ORDER BY e.full_name
    """), p)
    salary_items = [dict(r._mapping) for r in sal_rows.fetchall()]
    salary_total = sum(float(r["net_pay"] or 0) for r in salary_items)

    # Payroll run id (first one found)
    payroll_run_id = salary_items[0]["run_id"] if salary_items else None
    payroll_run_status = salary_items[0]["run_status"] if salary_items else None

    # ── 2. Statutory ──────────────────────────────────────────────────────────
    stat_row = await db.execute(text(f"""
        SELECT
          COALESCE(SUM(pl.epf_employee),  0) AS epf_emp,
          COALESCE(SUM(pl.epf_employer),  0) AS epf_er,
          COALESCE(SUM(pl.socso_employee),0) AS socso_emp,
          COALESCE(SUM(pl.socso_employer),0) AS socso_er,
          COALESCE(SUM(pl.eis_employee),  0) AS eis_emp,
          COALESCE(SUM(pl.eis_employer),  0) AS eis_er,
          COALESCE(SUM(pl.pcb),           0) AS pcb
        FROM hr_payslip_lines pl
        JOIN hr_payroll_runs pr ON pr.id = pl.payroll_run_id
        WHERE pr.month=:month AND pr.year=:year {tf_pr}
    """), p)
    s = dict(stat_row.mappings().first() or {})
    epf_total   = float(s.get("epf_emp", 0))   + float(s.get("epf_er", 0))
    socso_total = float(s.get("socso_emp", 0))  + float(s.get("socso_er", 0))
    eis_total   = float(s.get("eis_emp", 0))    + float(s.get("eis_er", 0))
    pcb_total   = float(s.get("pcb", 0))
    statutory_total = epf_total + socso_total + eis_total + pcb_total

    statutory = {
        "epf_employee":  float(s.get("epf_emp", 0)),
        "epf_employer":  float(s.get("epf_er", 0)),
        "epf_total":     round(epf_total, 2),
        "socso_employee": float(s.get("socso_emp", 0)),
        "socso_employer": float(s.get("socso_er", 0)),
        "socso_total":   round(socso_total, 2),
        "eis_employee":  float(s.get("eis_emp", 0)),
        "eis_employer":  float(s.get("eis_er", 0)),
        "eis_total":     round(eis_total, 2),
        "pcb":           round(pcb_total, 2),
        "total":         round(statutory_total, 2),
        "payroll_run_id": payroll_run_id,
    }

    # ── 3. Bills (pending / overdue, due by end of month) ────────────────────
    bills_rows = await db.execute(text(f"""
        SELECT id, vendor_name, bill_number, description, amount,
               due_date, issue_date, bank_name, bank_account_no,
               bank_account_name, status, currency
        FROM bills
        WHERE status IN ('pending','overdue')
          AND is_deleted=0
          AND (due_date <= :m_end OR (due_date IS NULL AND issue_date <= :m_end))
          {tf}
        ORDER BY due_date, vendor_name
    """), p)
    bill_items = [dict(r._mapping) for r in bills_rows.fetchall()]
    bills_total = sum(float(r["amount"] or 0) for r in bill_items)

    # ── 4. Purchase Orders (confirmed but unpaid) ─────────────────────────────
    po_rows = await db.execute(text(f"""
        SELECT id, po_number, vendor_name, total, status, issue_date
        FROM purchase_orders
        WHERE status IN ('sent','received')
          AND is_deleted=0
          AND issue_date <= :m_end
          {tf}
        ORDER BY issue_date, vendor_name
    """), p)
    po_items = [dict(r._mapping) for r in po_rows.fetchall()]
    po_total = sum(float(r["total"] or 0) for r in po_items)

    # ── 5. Expense Claims (approved, not yet in a payroll run) ────────────────
    claims_rows = await db.execute(text(f"""
        SELECT c.id, e.full_name AS employee_name, c.claim_type,
               c.description, c.amount, c.claim_date
        FROM hr_claims c
        JOIN hr_employees e ON e.id = c.employee_id
        WHERE c.status='approved'
          AND c.payroll_run_id IS NULL
          AND c.claim_date <= :m_end
          AND (c.tenant_id=:tid OR (c.tenant_id IS NULL AND :tid IS NULL))
        ORDER BY c.claim_date, e.full_name
    """), p)
    claim_items = [dict(r._mapping) for r in claims_rows.fetchall()]
    claims_total = sum(float(r["amount"] or 0) for r in claim_items)

    grand_total = round(salary_total + statutory_total + bills_total + po_total + claims_total, 2)

    return {
        "month":       month,
        "year":        year,
        "month_name":  MONTHS[month - 1],
        "as_of":       m_end.isoformat(),
        "payroll_run_id":     payroll_run_id,
        "payroll_run_status": payroll_run_status,
        "salaries":    {"items": salary_items,  "total": round(salary_total, 2)},
        "statutory":   statutory,
        "bills":       {"items": bill_items,    "total": round(bills_total, 2)},
        "purchase_orders": {"items": po_items,  "total": round(po_total, 2)},
        "claims":      {"items": claim_items,   "total": round(claims_total, 2)},
        "grand_total": grand_total,
    }


async def _get_company(db: AsyncSession, tid):
    row = await db.execute(
        text("SELECT * FROM company_settings WHERE (tenant_id=:tid OR (tenant_id IS NULL AND :tid IS NULL)) LIMIT 1"),
        {"tid": tid},
    )
    return dict(row.mappings().first() or {})


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("")
async def get_monthly_payables(
    month: Optional[int] = Query(None),
    year:  Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_admin_or_manager(current_user)
    today = date.today()
    m = month or today.month
    y = year  or today.year
    tid = get_effective_tenant_id(current_user)
    return await _compute(db, tid, m, y)


@router.get("/pdf")
async def get_monthly_payables_pdf(
    month: Optional[int] = Query(None),
    year:  Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from jinja2 import Environment, FileSystemLoader, select_autoescape
    from pathlib import Path
    from app.services.pdf_service import _render_pdf
    from app.services.signature_service import get_logo_base64
    import asyncio

    require_admin_or_manager(current_user)
    today = date.today()
    m = month or today.month
    y = year  or today.year
    tid = get_effective_tenant_id(current_user)

    data    = await _compute(db, tid, m, y)
    company = await _get_company(db, tid)
    logo    = get_logo_base64(company.get("logo_url"))

    TEMPLATES_DIR = Path(__file__).parent.parent / "templates" / "pdf"
    env = Environment(loader=FileSystemLoader(str(TEMPLATES_DIR)), autoescape=select_autoescape(["html"]))
    env.filters["fmt"] = _fmt
    html = env.get_template("monthly_payables.html").render(
        data=data, company=company, logo_data=logo,
        now=datetime.now().strftime("%d %B %Y %H:%M"),
    )

    loop = asyncio.get_event_loop()
    pdf_bytes = await loop.run_in_executor(None, _render_pdf, html)
    filename  = f"monthly_payables_{MONTHS[m-1]}_{y}.pdf"
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/csv")
async def get_monthly_payables_csv(
    month: Optional[int] = Query(None),
    year:  Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_admin_or_manager(current_user)
    today = date.today()
    m = month or today.month
    y = year  or today.year
    tid = get_effective_tenant_id(current_user)
    data = await _compute(db, tid, m, y)

    output = io.StringIO()
    w = csv.writer(output)

    def section(title):
        w.writerow([])
        w.writerow([title])

    w.writerow([f"Monthly Payables — {data['month_name']} {data['year']}"])
    w.writerow([f"Generated: {datetime.now().strftime('%d %b %Y %H:%M')}"])

    # Salaries
    section("EMPLOYEE SALARIES")
    w.writerow(["Employee Name", "Employee No.", "Designation", "Gross Pay (RM)", "Net Pay (RM)", "Bank", "Account No."])
    for r in data["salaries"]["items"]:
        w.writerow([r["full_name"], r["employee_no"], r.get("designation",""),
                    _fmt(r["gross_pay"]), _fmt(r["net_pay"]),
                    r.get("bank_name",""), r.get("bank_account_no","")])
    w.writerow(["", "", "", "", f'Total: {_fmt(data["salaries"]["total"])}'])

    # Statutory
    section("STATUTORY CONTRIBUTIONS")
    s = data["statutory"]
    w.writerow(["Item", "Employee (RM)", "Employer (RM)", "Total (RM)"])
    w.writerow(["EPF",   _fmt(s["epf_employee"]),   _fmt(s["epf_employer"]),   _fmt(s["epf_total"])])
    w.writerow(["SOCSO", _fmt(s["socso_employee"]),  _fmt(s["socso_employer"]),  _fmt(s["socso_total"])])
    w.writerow(["EIS",   _fmt(s["eis_employee"]),    _fmt(s["eis_employer"]),    _fmt(s["eis_total"])])
    w.writerow(["PCB / Income Tax", _fmt(s["pcb"]), "—", _fmt(s["pcb"])])
    w.writerow(["", "", f'Total: {_fmt(s["total"])}'])

    # Bills
    section("VENDOR BILLS")
    w.writerow(["Vendor", "Bill No.", "Description", "Amount (RM)", "Due Date", "Status"])
    for r in data["bills"]["items"]:
        dd = str(r.get("due_date",""))[:10] if r.get("due_date") else "—"
        w.writerow([r.get("vendor_name",""), r.get("bill_number",""),
                    r.get("description",""), _fmt(r["amount"]), dd, r.get("status","")])
    w.writerow(["", "", "", f'Total: {_fmt(data["bills"]["total"])}'])

    # POs
    section("PURCHASE ORDERS")
    w.writerow(["PO Number", "Vendor", "Total (RM)", "Status", "Issue Date"])
    for r in data["purchase_orders"]["items"]:
        d = str(r.get("issue_date",""))[:10] if r.get("issue_date") else "—"
        w.writerow([r.get("po_number",""), r.get("vendor_name",""),
                    _fmt(r["total"]), r.get("status",""), d])
    w.writerow(["", "", f'Total: {_fmt(data["purchase_orders"]["total"])}'])

    # Claims
    section("EXPENSE CLAIMS")
    w.writerow(["Employee", "Claim Type", "Description", "Amount (RM)", "Claim Date"])
    for r in data["claims"]["items"]:
        d = str(r.get("claim_date",""))[:10] if r.get("claim_date") else "—"
        w.writerow([r.get("employee_name",""), r.get("claim_type",""),
                    r.get("description",""), _fmt(r["amount"]), d])
    w.writerow(["", "", "", f'Total: {_fmt(data["claims"]["total"])}'])

    # Grand total
    w.writerow([])
    w.writerow(["GRAND TOTAL (RM)", _fmt(data["grand_total"])])

    content = output.getvalue()
    filename = f"monthly_payables_{MONTHS[m-1]}_{y}.csv"
    return StreamingResponse(
        io.BytesIO(content.encode("utf-8-sig")),  # utf-8-sig for Excel compatibility
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
