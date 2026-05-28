"""Bank accounts, statements, and cash-flow endpoints."""
import csv
import io
import os
import re
import secrets
from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional

import pdfplumber
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.user import User

router = APIRouter(prefix="/bank", tags=["bank"])


# ── Pydantic models ───────────────────────────────────────────────────────────

class AccountCreate(BaseModel):
    name: str
    bank_name: Optional[str] = None
    account_number: Optional[str] = None
    opening_balance: float = 0.0
    currency: str = "MYR"


class AccountOut(BaseModel):
    id: int
    name: str
    bank_name: Optional[str]
    account_number: Optional[str]
    opening_balance: float
    currency: str
    current_balance: float
    total_credit: float
    total_debit: float


class CategoryCreate(BaseModel):
    name: str
    type: str = "expense"  # income | expense
    color: str = "#6366f1"


class CategoryOut(BaseModel):
    id: int
    name: str
    type: str
    color: str


class TransactionCreate(BaseModel):
    txn_date: date
    description: str
    party_name: Optional[str] = None
    amount: float
    type: str  # credit | debit
    category_id: Optional[int] = None
    note: Optional[str] = None


class TransactionUpdate(BaseModel):
    txn_date: Optional[date] = None
    description: Optional[str] = None
    party_name: Optional[str] = None
    amount: Optional[float] = None
    type: Optional[str] = None
    category_id: Optional[int] = None
    invoice_id: Optional[int] = None
    bill_id: Optional[int] = None
    note: Optional[str] = None


class TransactionOut(BaseModel):
    id: int
    account_id: int
    statement_id: Optional[int]
    txn_date: str
    description: str
    party_name: Optional[str]
    amount: float
    type: str
    category_id: Optional[int]
    category_name: Optional[str]
    category_color: Optional[str]
    invoice_id: Optional[int]
    invoice_number: Optional[str]
    bill_id: Optional[int]
    bill_number: Optional[str]
    note: Optional[str]
    receipt_url: Optional[str] = None


class ParsedRow(BaseModel):
    txn_date: str
    description: str
    party_name: Optional[str] = None
    amount: float
    type: str  # credit | debit


# ── Helpers ───────────────────────────────────────────────────────────────────

def _tenant_id(user: User) -> Optional[int]:
    return user.tenant_id


async def _get_account(db: AsyncSession, account_id: int, tenant_id: Optional[int]):
    r = await db.execute(
        text("SELECT id, tenant_id FROM bank_accounts WHERE id = :id"),
        {"id": account_id},
    )
    row = r.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Account not found")
    if tenant_id and row[1] != tenant_id:
        raise HTTPException(status_code=403, detail="Access denied")
    return row


async def _account_balances(db: AsyncSession, account_id: int, opening: float):
    r = await db.execute(
        text("""
            SELECT
                COALESCE(SUM(CASE WHEN type='credit' THEN amount ELSE 0 END), 0) AS total_credit,
                COALESCE(SUM(CASE WHEN type='debit'  THEN amount ELSE 0 END), 0) AS total_debit
            FROM bank_transactions WHERE account_id = :aid
        """),
        {"aid": account_id},
    )
    row = r.fetchone()
    total_credit = float(row[0])
    total_debit = float(row[1])
    current_balance = opening + total_credit - total_debit
    return total_credit, total_debit, current_balance


_MAX_AMOUNT = Decimal("9999999999999.99")  # DECIMAL(15,2) upper bound


def _parse_amount(raw: str) -> Optional[float]:
    if not raw:
        return None
    raw = str(raw).strip()
    negative = raw.startswith("-") or (raw.startswith("(") and raw.endswith(")"))
    cleaned = re.sub(r"[^\d.]", "", raw)
    if not cleaned:
        return None
    # Multiple dots means ambiguous format — keep only last decimal group
    parts = cleaned.split(".")
    if len(parts) > 2:
        cleaned = "".join(parts[:-1]) + "." + parts[-1]
    try:
        val = float(cleaned)
        # Reject amounts that overflow DECIMAL(15,2)
        if val > float(_MAX_AMOUNT):
            return None
        return -val if negative else val
    except (ValueError, OverflowError):
        return None


def _parse_date(raw: str) -> Optional[date]:
    raw = str(raw).strip()
    for fmt in ("%d/%m/%Y", "%d-%m-%Y", "%Y-%m-%d", "%d/%m/%y", "%d %b %Y", "%d %B %Y", "%m/%d/%Y"):
        try:
            return datetime.strptime(raw, fmt).date()
        except ValueError:
            continue
    return None


def _detect_column(headers: List[str], candidates: List[str]) -> Optional[int]:
    """Match column headers using whole-word logic to avoid false positives.

    e.g. "cr" must not match "description" (des-cr-iption).
    """
    for idx, h in enumerate(headers):
        # Split header into individual words, stripping punctuation
        h_words = set(re.split(r"[^a-z0-9]+", h.lower()))
        h_words.discard("")
        for c in candidates:
            c_lower = c.lower()
            # Exact word match
            if c_lower in h_words:
                return idx
            # Prefix match: "deposit" matches "deposits", "withdrawal" matches "withdrawals"
            if any(w.startswith(c_lower) for w in h_words):
                return idx
            # Long-substring fallback (≥5 chars) — safe since short abbrevs handled above
            if len(c_lower) >= 5 and c_lower in h.lower():
                return idx
    return None


def _detect_delimiter(content: str) -> str:
    """Pick the delimiter that produces the most columns in the first data row."""
    first_line = content.split("\n")[0]
    best = ","
    best_count = 0
    for delim in [",", ";", "\t", "|"]:
        row = next(csv.reader([first_line], delimiter=delim), [])
        if len(row) > best_count:
            best_count = len(row)
            best = delim
    return best
    return None


def _parse_csv_content(content: str) -> List[ParsedRow]:
    delimiter = _detect_delimiter(content)
    reader = csv.reader(io.StringIO(content), delimiter=delimiter)
    rows = list(reader)
    if not rows:
        return []

    # Find header row (first row with recognisable column names)
    header_idx = 0
    headers = []
    for i, row in enumerate(rows[:10]):
        joined = " ".join(row).lower()
        if any(k in joined for k in ["date", "debit", "credit", "amount", "narration", "description"]):
            header_idx = i
            headers = [h.strip() for h in row]
            break

    if not headers:
        return []

    # Candidates use whole-word matching — short abbrevs ("cr","dr") are safe via _detect_column
    date_col   = _detect_column(headers, ["date"])
    desc_col   = _detect_column(headers, ["description", "narration", "particular", "detail", "remark", "reference", "transaction"])
    debit_col  = _detect_column(headers, ["debit", "withdrawal", "dr"])
    credit_col = _detect_column(headers, ["credit", "deposit", "cr"])
    amount_col = _detect_column(headers, ["amount"]) if (debit_col is None or credit_col is None) else None

    if date_col is None:
        return []

    results: List[ParsedRow] = []
    for row in rows[header_idx + 1:]:
        if not row or all(c.strip() == "" for c in row):
            continue
        try:
            raw_date = row[date_col].strip() if date_col < len(row) else ""
            parsed_date = _parse_date(raw_date)
            if not parsed_date:
                continue

            description = row[desc_col].strip() if desc_col is not None and desc_col < len(row) else ""

            if amount_col is not None and amount_col < len(row):
                amt = _parse_amount(row[amount_col])
                if amt is None:
                    continue
                txn_type = "credit" if amt >= 0 else "debit"
                amount = abs(amt)
            else:
                debit = _parse_amount(row[debit_col]) if debit_col is not None and debit_col < len(row) else None
                credit = _parse_amount(row[credit_col]) if credit_col is not None and credit_col < len(row) else None
                if debit and debit > 0:
                    txn_type = "debit"
                    amount = debit
                elif credit and credit > 0:
                    txn_type = "credit"
                    amount = credit
                else:
                    continue

            results.append(ParsedRow(
                txn_date=str(parsed_date),
                description=description,
                amount=round(amount, 2),
                type=txn_type,
            ))
        except (IndexError, Exception):
            continue

    return results


def _parse_pdf_content(file_bytes: bytes) -> List[ParsedRow]:
    results: List[ParsedRow] = []
    try:
        with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
            for page in pdf.pages:
                # Try table extraction first (works well for CIMB digital PDFs)
                tables = page.extract_tables()
                for table in tables:
                    if not table:
                        continue
                    # Find header row
                    header_row_idx = None
                    headers = []
                    for i, row in enumerate(table[:5]):
                        if row is None:
                            continue
                        cells = [str(c or "").lower() for c in row]
                        joined = " ".join(cells)
                        if any(k in joined for k in ["date", "debit", "credit", "amount", "narration", "description"]):
                            header_row_idx = i
                            headers = [str(c or "").strip() for c in row]
                            break

                    if header_row_idx is None or not headers:
                        continue

                    date_col   = _detect_column(headers, ["date"])
                    desc_col   = _detect_column(headers, ["description", "narration", "particular", "detail", "transaction", "reference"])
                    debit_col  = _detect_column(headers, ["debit", "withdrawal", "dr"])
                    credit_col = _detect_column(headers, ["credit", "deposit", "cr"])
                    amount_col = _detect_column(headers, ["amount"]) if (debit_col is None or credit_col is None) else None

                    if date_col is None:
                        continue

                    for row in table[header_row_idx + 1:]:
                        if not row:
                            continue
                        try:
                            raw_date = str(row[date_col] or "").strip() if date_col < len(row) else ""
                            parsed_date = _parse_date(raw_date)
                            if not parsed_date:
                                continue

                            description = str(row[desc_col] or "").strip() if desc_col is not None and desc_col < len(row) else ""

                            if amount_col is not None and amount_col < len(row):
                                amt = _parse_amount(str(row[amount_col] or ""))
                                if amt is None:
                                    continue
                                txn_type = "credit" if amt >= 0 else "debit"
                                amount = abs(amt)
                            else:
                                debit = _parse_amount(str(row[debit_col] or "")) if debit_col is not None and debit_col < len(row) else None
                                credit = _parse_amount(str(row[credit_col] or "")) if credit_col is not None and credit_col < len(row) else None
                                if debit and debit > 0:
                                    txn_type = "debit"
                                    amount = debit
                                elif credit and credit > 0:
                                    txn_type = "credit"
                                    amount = credit
                                else:
                                    continue

                            results.append(ParsedRow(
                                txn_date=str(parsed_date),
                                description=description,
                                amount=round(amount, 2),
                                type=txn_type,
                            ))
                        except Exception:
                            continue

                # If no tables found on this page, try text extraction with regex
                if not results:
                    text_content = page.extract_text() or ""
                    # Generic pattern: date followed by description and amounts
                    # Matches: DD/MM/YYYY or DD-MM-YYYY
                    pattern = re.compile(
                        r"(\d{2}[\/\-]\d{2}[\/\-]\d{4})\s+([\w\s\-\/\*]+?)\s+([\d,]+\.\d{2})(?:\s+([\d,]+\.\d{2}))?",
                        re.MULTILINE,
                    )
                    for m in pattern.finditer(text_content):
                        raw_date = m.group(1)
                        parsed_date = _parse_date(raw_date)
                        if not parsed_date:
                            continue
                        description = m.group(2).strip()
                        amt1 = _parse_amount(m.group(3))
                        amt2 = _parse_amount(m.group(4)) if m.group(4) else None
                        # Heuristic: if two amounts, first is debit, second is credit (CIMB style)
                        if amt2 is not None:
                            if amt1 and amt1 > 0:
                                results.append(ParsedRow(txn_date=str(parsed_date), description=description, amount=round(amt1, 2), type="debit"))
                            if amt2 and amt2 > 0:
                                results.append(ParsedRow(txn_date=str(parsed_date), description=description, amount=round(amt2, 2), type="credit"))
                        elif amt1:
                            results.append(ParsedRow(txn_date=str(parsed_date), description=description, amount=round(amt1, 2), type="debit"))
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Could not parse PDF: {e}")

    return results


# ── Category endpoints ────────────────────────────────────────────────────────

@router.get("/categories", response_model=List[CategoryOut])
async def list_categories(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tid = _tenant_id(current_user)
    r = await db.execute(
        text("SELECT id, name, type, color FROM transaction_categories WHERE tenant_id = :tid ORDER BY type, name"),
        {"tid": tid},
    )
    return [CategoryOut(id=row[0], name=row[1], type=row[2], color=row[3]) for row in r.fetchall()]


@router.post("/categories", response_model=CategoryOut)
async def create_category(
    payload: CategoryCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tid = _tenant_id(current_user)
    r = await db.execute(
        text("INSERT INTO transaction_categories (tenant_id, name, type, color) VALUES (:tid, :name, :type, :color)"),
        {"tid": tid, "name": payload.name, "type": payload.type, "color": payload.color},
    )
    await db.commit()
    cat_id = r.lastrowid
    return CategoryOut(id=cat_id, name=payload.name, type=payload.type, color=payload.color)


@router.put("/categories/{cat_id}", response_model=CategoryOut)
async def update_category(
    cat_id: int,
    payload: CategoryCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tid = _tenant_id(current_user)
    check = await db.execute(
        text("SELECT id FROM transaction_categories WHERE id = :id AND tenant_id = :tid"),
        {"id": cat_id, "tid": tid},
    )
    if not check.fetchone():
        raise HTTPException(status_code=404, detail="Category not found")
    await db.execute(
        text("UPDATE transaction_categories SET name=:name, type=:type, color=:color WHERE id=:id"),
        {"name": payload.name, "type": payload.type, "color": payload.color, "id": cat_id},
    )
    await db.commit()
    return CategoryOut(id=cat_id, name=payload.name, type=payload.type, color=payload.color)


@router.delete("/categories/{cat_id}")
async def delete_category(
    cat_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tid = _tenant_id(current_user)
    check = await db.execute(
        text("SELECT id FROM transaction_categories WHERE id = :id AND tenant_id = :tid"),
        {"id": cat_id, "tid": tid},
    )
    if not check.fetchone():
        raise HTTPException(status_code=404, detail="Category not found")
    await db.execute(text("DELETE FROM transaction_categories WHERE id = :id"), {"id": cat_id})
    await db.commit()
    return {"ok": True}


# ── Bank account endpoints ────────────────────────────────────────────────────

@router.get("/accounts", response_model=List[AccountOut])
async def list_accounts(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tid = _tenant_id(current_user)
    r = await db.execute(
        text("SELECT id, name, bank_name, account_number, opening_balance, currency FROM bank_accounts WHERE tenant_id = :tid ORDER BY id"),
        {"tid": tid},
    )
    out = []
    for row in r.fetchall():
        acc_id, name, bank_name, acc_no, opening, currency = row
        tc, td, cb = await _account_balances(db, acc_id, float(opening))
        out.append(AccountOut(
            id=acc_id, name=name, bank_name=bank_name, account_number=acc_no,
            opening_balance=float(opening), currency=currency,
            current_balance=round(cb, 2), total_credit=round(tc, 2), total_debit=round(td, 2),
        ))
    return out


@router.post("/accounts", response_model=AccountOut)
async def create_account(
    payload: AccountCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tid = _tenant_id(current_user)
    r = await db.execute(
        text("""
            INSERT INTO bank_accounts (tenant_id, name, bank_name, account_number, opening_balance, currency)
            VALUES (:tid, :name, :bank_name, :acc_no, :opening, :currency)
        """),
        {"tid": tid, "name": payload.name, "bank_name": payload.bank_name,
         "acc_no": payload.account_number, "opening": payload.opening_balance, "currency": payload.currency},
    )
    await db.commit()
    acc_id = r.lastrowid
    return AccountOut(
        id=acc_id, name=payload.name, bank_name=payload.bank_name,
        account_number=payload.account_number, opening_balance=payload.opening_balance,
        currency=payload.currency, current_balance=payload.opening_balance,
        total_credit=0.0, total_debit=0.0,
    )


@router.put("/accounts/{account_id}", response_model=AccountOut)
async def update_account(
    account_id: int,
    payload: AccountCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tid = _tenant_id(current_user)
    await _get_account(db, account_id, tid)
    await db.execute(
        text("""
            UPDATE bank_accounts SET name=:name, bank_name=:bank_name,
            account_number=:acc_no, opening_balance=:opening, currency=:currency
            WHERE id=:id
        """),
        {"name": payload.name, "bank_name": payload.bank_name, "acc_no": payload.account_number,
         "opening": payload.opening_balance, "currency": payload.currency, "id": account_id},
    )
    await db.commit()
    tc, td, cb = await _account_balances(db, account_id, payload.opening_balance)
    return AccountOut(
        id=account_id, name=payload.name, bank_name=payload.bank_name,
        account_number=payload.account_number, opening_balance=payload.opening_balance,
        currency=payload.currency, current_balance=round(cb, 2),
        total_credit=round(tc, 2), total_debit=round(td, 2),
    )


@router.delete("/accounts/{account_id}")
async def delete_account(
    account_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tid = _tenant_id(current_user)
    await _get_account(db, account_id, tid)
    await db.execute(text("DELETE FROM bank_accounts WHERE id = :id"), {"id": account_id})
    await db.commit()
    return {"ok": True}


# ── Statement upload & parse ──────────────────────────────────────────────────

@router.post("/accounts/{account_id}/upload/preview")
async def preview_statement(
    account_id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Parse a PDF or CSV and return extracted rows for user review — nothing saved yet."""
    tid = _tenant_id(current_user)
    await _get_account(db, account_id, tid)

    content = await file.read()
    filename = file.filename or ""

    if filename.lower().endswith(".pdf"):
        rows = _parse_pdf_content(content)
    elif filename.lower().endswith((".csv", ".txt")):
        rows = _parse_csv_content(content.decode("utf-8", errors="replace"))
    else:
        raise HTTPException(status_code=400, detail="Only PDF or CSV files are supported")

    if not rows:
        raise HTTPException(status_code=422, detail="No transactions could be extracted from this file. Try CSV export instead.")

    return {"rows": [r.dict() for r in rows], "count": len(rows)}


@router.post("/accounts/{account_id}/upload/confirm")
async def confirm_statement(
    account_id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Save uploaded file + all extracted transactions to the database."""
    tid = _tenant_id(current_user)
    await _get_account(db, account_id, tid)

    content = await file.read()
    filename = file.filename or "statement"

    if filename.lower().endswith(".pdf"):
        rows = _parse_pdf_content(content)
    elif filename.lower().endswith((".csv", ".txt")):
        rows = _parse_csv_content(content.decode("utf-8", errors="replace"))
    else:
        raise HTTPException(status_code=400, detail="Only PDF or CSV files are supported")

    # Save file
    upload_dir = os.environ.get("UPLOAD_DIR", "uploads")
    safe_name = f"{account_id}_{secrets.token_hex(6)}_{filename}"
    file_path = f"{upload_dir}/bank_statements/{safe_name}"
    with open(file_path, "wb") as f:
        f.write(content)

    # Detect period
    dates = [_parse_date(r.txn_date) for r in rows if r.txn_date]
    dates = [d for d in dates if d]
    period_start = min(dates) if dates else None
    period_end = max(dates) if dates else None

    # Create statement record
    r = await db.execute(
        text("""
            INSERT INTO bank_statements (account_id, filename, file_url, period_start, period_end, status, row_count)
            VALUES (:aid, :fname, :furl, :pstart, :pend, 'done', :rcount)
        """),
        {"aid": account_id, "fname": filename, "furl": f"/uploads/bank_statements/{safe_name}",
         "pstart": period_start, "pend": period_end, "rcount": len(rows)},
    )
    await db.commit()
    stmt_id = r.lastrowid

    # Insert transactions
    for row in rows:
        await db.execute(
            text("""
                INSERT INTO bank_transactions
                (account_id, statement_id, txn_date, description, party_name, amount, type)
                VALUES (:aid, :sid, :d, :desc, :party, :amt, :type)
            """),
            {"aid": account_id, "sid": stmt_id, "d": row.txn_date,
             "desc": row.description, "party": row.party_name,
             "amt": row.amount, "type": row.type},
        )
    await db.commit()

    return {"ok": True, "statement_id": stmt_id, "imported": len(rows)}


# ── Transaction endpoints ─────────────────────────────────────────────────────

@router.get("/accounts/{account_id}/transactions", response_model=List[TransactionOut])
async def list_transactions(
    account_id: int,
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    type: Optional[str] = Query(None),
    category_id: Optional[int] = Query(None),
    search: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tid = _tenant_id(current_user)
    await _get_account(db, account_id, tid)

    where = ["bt.account_id = :aid"]
    params: dict = {"aid": account_id}

    if date_from:
        where.append("bt.txn_date >= :date_from")
        params["date_from"] = date_from
    if date_to:
        where.append("bt.txn_date <= :date_to")
        params["date_to"] = date_to
    if type:
        where.append("bt.type = :type")
        params["type"] = type
    if category_id:
        where.append("bt.category_id = :cat_id")
        params["cat_id"] = category_id
    if search:
        where.append("(bt.description LIKE :s OR bt.party_name LIKE :s)")
        params["s"] = f"%{search}%"

    sql = f"""
        SELECT bt.id, bt.account_id, bt.statement_id, bt.txn_date, bt.description,
               bt.party_name, bt.amount, bt.type, bt.category_id,
               tc.name AS cat_name, tc.color AS cat_color,
               bt.invoice_id, i.invoice_number,
               bt.bill_id, b.bill_number,
               bt.note, bt.receipt_url
        FROM bank_transactions bt
        LEFT JOIN transaction_categories tc ON tc.id = bt.category_id
        LEFT JOIN invoices i ON i.id = bt.invoice_id
        LEFT JOIN bills b ON b.id = bt.bill_id
        WHERE {' AND '.join(where)}
        ORDER BY bt.txn_date DESC, bt.id DESC
    """
    r = await db.execute(text(sql), params)
    rows = r.fetchall()
    return [
        TransactionOut(
            id=row[0], account_id=row[1], statement_id=row[2],
            txn_date=str(row[3]), description=row[4], party_name=row[5],
            amount=float(row[6]), type=row[7], category_id=row[8],
            category_name=row[9], category_color=row[10],
            invoice_id=row[11], invoice_number=row[12],
            bill_id=row[13], bill_number=row[14],
            note=row[15], receipt_url=row[16],
        )
        for row in rows
    ]


@router.post("/accounts/{account_id}/transactions", response_model=TransactionOut)
async def create_transaction(
    account_id: int,
    payload: TransactionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tid = _tenant_id(current_user)
    await _get_account(db, account_id, tid)
    r = await db.execute(
        text("""
            INSERT INTO bank_transactions
            (account_id, txn_date, description, party_name, amount, type, category_id, note)
            VALUES (:aid, :d, :desc, :party, :amt, :type, :cat, :note)
        """),
        {"aid": account_id, "d": payload.txn_date, "desc": payload.description,
         "party": payload.party_name, "amt": payload.amount, "type": payload.type,
         "cat": payload.category_id, "note": payload.note},
    )
    await db.commit()
    txn_id = r.lastrowid

    cat_name = cat_color = None
    if payload.category_id:
        cr = await db.execute(
            text("SELECT name, color FROM transaction_categories WHERE id = :id"),
            {"id": payload.category_id},
        )
        cat_row = cr.fetchone()
        if cat_row:
            cat_name, cat_color = cat_row

    return TransactionOut(
        id=txn_id, account_id=account_id, statement_id=None,
        txn_date=str(payload.txn_date), description=payload.description,
        party_name=payload.party_name, amount=payload.amount, type=payload.type,
        category_id=payload.category_id, category_name=cat_name, category_color=cat_color,
        invoice_id=None, invoice_number=None, bill_id=None, bill_number=None,
        note=payload.note,
    )


@router.put("/transactions/{txn_id}", response_model=TransactionOut)
async def update_transaction(
    txn_id: int,
    payload: TransactionUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tid = _tenant_id(current_user)
    # Verify ownership via account
    r = await db.execute(
        text("""
            SELECT bt.id, bt.account_id, bt.statement_id, bt.txn_date, bt.description,
                   bt.party_name, bt.amount, bt.type, bt.category_id,
                   bt.invoice_id, bt.bill_id, bt.note
            FROM bank_transactions bt
            JOIN bank_accounts ba ON ba.id = bt.account_id
            WHERE bt.id = :id AND ba.tenant_id = :tid
        """),
        {"id": txn_id, "tid": tid},
    )
    row = r.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Transaction not found")

    old = {
        "txn_date": row[3], "description": row[4], "party_name": row[5],
        "amount": row[6], "type": row[7], "category_id": row[8],
        "invoice_id": row[9], "bill_id": row[10], "note": row[11],
    }
    new_invoice_id = payload.invoice_id if payload.invoice_id is not None else old["invoice_id"]
    new_bill_id = payload.bill_id if payload.bill_id is not None else old["bill_id"]
    new_amount = payload.amount if payload.amount is not None else float(old["amount"])
    new_type = payload.type if payload.type is not None else old["type"]

    await db.execute(
        text("""
            UPDATE bank_transactions
            SET txn_date    = :d,
                description = :desc,
                party_name  = :party,
                amount      = :amt,
                type        = :type,
                category_id = :cat,
                invoice_id  = :inv,
                bill_id     = :bill,
                note        = :note
            WHERE id = :id
        """),
        {
            "d": payload.txn_date or old["txn_date"],
            "desc": payload.description or old["description"],
            "party": payload.party_name if payload.party_name is not None else old["party_name"],
            "amt": new_amount,
            "type": new_type,
            "cat": payload.category_id if payload.category_id is not None else old["category_id"],
            "inv": new_invoice_id,
            "bill": new_bill_id,
            "note": payload.note if payload.note is not None else old["note"],
            "id": txn_id,
        },
    )

    # Auto-mark invoice as paid when linked
    if new_invoice_id and new_invoice_id != old["invoice_id"] and new_type == "credit":
        await db.execute(
            text("""
                UPDATE invoices
                SET status = 'paid',
                    amount_paid = total,
                    balance_due = 0,
                    paid_at = NOW()
                WHERE id = :inv_id
            """),
            {"inv_id": new_invoice_id},
        )

    # Auto-mark bill as paid when linked
    if new_bill_id and new_bill_id != old["bill_id"] and new_type == "debit":
        await db.execute(
            text("""
                UPDATE bills
                SET status = 'paid', paid_at = NOW()
                WHERE id = :bill_id
            """),
            {"bill_id": new_bill_id},
        )

    await db.commit()

    # Fetch updated row with joins
    r2 = await db.execute(
        text("""
            SELECT bt.id, bt.account_id, bt.statement_id, bt.txn_date, bt.description,
                   bt.party_name, bt.amount, bt.type, bt.category_id,
                   tc.name, tc.color,
                   bt.invoice_id, i.invoice_number,
                   bt.bill_id, b.bill_number,
                   bt.note, bt.receipt_url
            FROM bank_transactions bt
            LEFT JOIN transaction_categories tc ON tc.id = bt.category_id
            LEFT JOIN invoices i ON i.id = bt.invoice_id
            LEFT JOIN bills b ON b.id = bt.bill_id
            WHERE bt.id = :id
        """),
        {"id": txn_id},
    )
    row2 = r2.fetchone()
    return TransactionOut(
        id=row2[0], account_id=row2[1], statement_id=row2[2],
        txn_date=str(row2[3]), description=row2[4], party_name=row2[5],
        amount=float(row2[6]), type=row2[7], category_id=row2[8],
        category_name=row2[9], category_color=row2[10],
        invoice_id=row2[11], invoice_number=row2[12],
        bill_id=row2[13], bill_number=row2[14],
        note=row2[15], receipt_url=row2[16],
    )


@router.delete("/transactions/{txn_id}")
async def delete_transaction(
    txn_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tid = _tenant_id(current_user)
    r = await db.execute(
        text("""
            SELECT bt.id FROM bank_transactions bt
            JOIN bank_accounts ba ON ba.id = bt.account_id
            WHERE bt.id = :id AND ba.tenant_id = :tid
        """),
        {"id": txn_id, "tid": tid},
    )
    if not r.fetchone():
        raise HTTPException(status_code=404, detail="Transaction not found")
    await db.execute(text("DELETE FROM bank_transactions WHERE id = :id"), {"id": txn_id})
    await db.commit()
    return {"ok": True}


# ── Receipt upload ────────────────────────────────────────────────────────────

@router.post("/transactions/{txn_id}/receipt")
async def upload_receipt(
    txn_id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload a receipt/invoice document for a debit transaction."""
    tid = _tenant_id(current_user)
    r = await db.execute(
        text("""
            SELECT bt.id FROM bank_transactions bt
            JOIN bank_accounts ba ON ba.id = bt.account_id
            WHERE bt.id = :id AND ba.tenant_id = :tid
        """),
        {"id": txn_id, "tid": tid},
    )
    if not r.fetchone():
        raise HTTPException(status_code=404, detail="Transaction not found")

    content = await file.read()
    filename = file.filename or "receipt"
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "bin"
    if ext not in {"pdf", "jpg", "jpeg", "png", "gif", "webp"}:
        raise HTTPException(status_code=400, detail="Only PDF or image files are supported")

    upload_dir = os.environ.get("UPLOAD_DIR", "uploads")
    safe_name = f"{txn_id}_{secrets.token_hex(6)}.{ext}"
    file_path = f"{upload_dir}/bank_receipts/{safe_name}"
    with open(file_path, "wb") as f:
        f.write(content)

    receipt_url = f"/uploads/bank_receipts/{safe_name}"
    await db.execute(
        text("UPDATE bank_transactions SET receipt_url = :url WHERE id = :id"),
        {"url": receipt_url, "id": txn_id},
    )
    await db.commit()
    return {"receipt_url": receipt_url}


# ── Cash-flow summary ─────────────────────────────────────────────────────────

@router.get("/accounts/{account_id}/summary")
async def get_summary(
    account_id: int,
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tid = _tenant_id(current_user)
    row = await _get_account(db, account_id, tid)

    # Opening balance
    opening_r = await db.execute(
        text("SELECT opening_balance, currency FROM bank_accounts WHERE id = :id"),
        {"id": account_id},
    )
    acc_row = opening_r.fetchone()
    opening_balance = float(acc_row[0])
    currency = acc_row[1]

    where = ["account_id = :aid"]
    params: dict = {"aid": account_id}
    if date_from:
        where.append("txn_date >= :df")
        params["df"] = date_from
    if date_to:
        where.append("txn_date <= :dt")
        params["dt"] = date_to

    # Overall totals
    totals_r = await db.execute(
        text(f"""
            SELECT
                COALESCE(SUM(CASE WHEN type='credit' THEN amount ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN type='debit'  THEN amount ELSE 0 END), 0)
            FROM bank_transactions WHERE {' AND '.join(where)}
        """),
        params,
    )
    tot = totals_r.fetchone()
    total_credit = float(tot[0])
    total_debit = float(tot[1])
    net = total_credit - total_debit

    # Full running balance uses all transactions (not filtered by date)
    _, _, current_balance = await _account_balances(db, account_id, opening_balance)

    # Monthly breakdown
    monthly_r = await db.execute(
        text(f"""
            SELECT
                DATE_FORMAT(txn_date, '%Y-%m') AS month,
                COALESCE(SUM(CASE WHEN type='credit' THEN amount ELSE 0 END), 0) AS credit,
                COALESCE(SUM(CASE WHEN type='debit'  THEN amount ELSE 0 END), 0) AS debit
            FROM bank_transactions
            WHERE {' AND '.join(where)}
            GROUP BY month
            ORDER BY month
        """),
        params,
    )
    monthly = [
        {"month": r[0], "credit": float(r[1]), "debit": float(r[2]), "net": float(r[1]) - float(r[2])}
        for r in monthly_r.fetchall()
    ]

    # Category breakdown
    cat_r = await db.execute(
        text(f"""
            SELECT tc.name, tc.color, bt.type,
                   COALESCE(SUM(bt.amount), 0) AS total
            FROM bank_transactions bt
            LEFT JOIN transaction_categories tc ON tc.id = bt.category_id
            WHERE {' AND '.join(where)}
            GROUP BY bt.category_id, tc.name, tc.color, bt.type
            ORDER BY total DESC
        """),
        params,
    )
    categories = [
        {"name": r[0] or "Uncategorised", "color": r[1] or "#94a3b8", "type": r[2], "total": float(r[3])}
        for r in cat_r.fetchall()
    ]

    return {
        "currency": currency,
        "opening_balance": opening_balance,
        "current_balance": round(current_balance, 2),
        "total_credit": round(total_credit, 2),
        "total_debit": round(total_debit, 2),
        "net": round(net, 2),
        "monthly": monthly,
        "categories": categories,
    }


# ── Invoice/Bill lookup helpers for reconciliation ───────────────────────────

@router.get("/invoices/unpaid")
async def list_unpaid_invoices(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tid = _tenant_id(current_user)
    r = await db.execute(
        text("""
            SELECT i.id, i.invoice_number, i.total, i.balance_due, i.status, c.name AS client_name
            FROM invoices i
            LEFT JOIN clients c ON c.id = i.client_id
            WHERE i.tenant_id = :tid AND i.status != 'cancelled'
            ORDER BY i.issue_date DESC
            LIMIT 500
        """),
        {"tid": tid},
    )
    return [
        {"id": row[0], "invoice_number": row[1], "total": float(row[2]),
         "balance_due": float(row[3]), "client_name": row[5], "status": row[4]}
        for row in r.fetchall()
    ]


@router.get("/bills/unpaid")
async def list_unpaid_bills(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tid = _tenant_id(current_user)
    r = await db.execute(
        text("""
            SELECT id, bill_number, amount, vendor_name
            FROM bills
            WHERE tenant_id = :tid AND status = 'pending' AND is_deleted = 0
            ORDER BY issue_date DESC
            LIMIT 200
        """),
        {"tid": tid},
    )
    return [
        {"id": row[0], "bill_number": row[1], "amount": float(row[2]), "vendor_name": row[3]}
        for row in r.fetchall()
    ]
