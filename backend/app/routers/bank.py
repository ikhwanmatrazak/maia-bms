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
from app.middleware.rbac import get_effective_tenant_id
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
    note: Optional[str] = None


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
    # DDMMYYYY — CIMB Portfolio/CASA format (e.g. 26052026)
    if re.fullmatch(r"\d{8}", raw):
        try:
            return datetime.strptime(raw, "%d%m%Y").date()
        except ValueError:
            pass
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


def _normalise_header(h: str) -> str:
    """Flatten multi-line pdfplumber cell values to single-line."""
    return re.sub(r"\s+", " ", str(h or "")).strip()


def _detect_type_col(headers: List[str]) -> Optional[int]:
    """Find a column whose header indicates credit/debit TYPE (not an amount)."""
    for idx, h in enumerate(headers):
        hn = _normalise_header(h).lower()
        if any(k in hn for k in ["amount type", "cr/dr", "dr/cr", "transaction type", "type"]):
            return idx
    return None


def _resolve_type(type_cell: str, debit_val: Optional[float], credit_val: Optional[float]) -> Optional[str]:
    """Determine 'credit' or 'debit' from a C/D type cell or separate debit/credit values."""
    if type_cell:
        t = type_cell.strip().upper()
        if t in ("C", "CR", "CREDIT"):
            return "credit"
        if t in ("D", "DR", "DEBIT"):
            return "debit"
    if credit_val and credit_val > 0:
        return "credit"
    if debit_val and debit_val > 0:
        return "debit"
    return None


def _parse_cimb_portfolio_text(raw: str) -> List[ParsedRow]:
    """
    Parse CIMB Portfolio / CASA account statement from raw PDF text.

    Each row follows: ACCT(10) SEQ(9) DATE(8,DDMMYYYY) CODE(3-4) DESCRIPTION BRANCH DOCREF
    MYR AMOUNT C/D MYR BALANCE BALTYPE TIME CUSTREF 1 RECIPREF OTHERREF SENDERNAME
    """
    # Fix hyphenated line-breaks ("MDN2605260-\n14801826" → "MDN2605260-14801826")
    text = re.sub(r"(\w)-\s+(\w)", r"\1-\2", raw)
    text = re.sub(r"\s+", " ", text)

    main_re = re.compile(
        r"\d{10}\s+"            # account number
        r"\d{9}\s+"             # record sequence
        r"(\d{8})\s+"           # date DDMMYYYY  [1]
        r"\d{3,4}\s+"           # transaction code
        r"([A-Z][A-Z ]+?)\s+"   # description (uppercase) [2]
        r"(?:-|\d{4})\s+"       # originating branch code
        r"(\S+)\s+"             # document reference [3]
        r"MYR\s*([\d,. ]+?)\s+" # transaction amount [4]
        r"([CD])\s+"            # amount type  [5]
        r"MYR"                  # balance start (anchor, not captured)
    )

    matches = list(main_re.finditer(text))
    results: List[ParsedRow] = []

    for i, m in enumerate(matches):
        parsed_date = _parse_date(m.group(1))
        if not parsed_date:
            continue

        amount = _parse_amount(re.sub(r"\s+", "", m.group(4)))
        if not amount:
            continue

        txn_type = "credit" if m.group(5) == "C" else "debit"
        description = m.group(2).strip()
        doc_ref = m.group(3)

        # ── Extract customer reference and sender name from the tail ──────────
        tail_end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        tail = text[m.end(): tail_end]

        # Customer reference: between "D time(6)" and filler "1 "
        cust_ref: Optional[str] = None
        cr_match = re.search(r"[CD]\s+\d{6}\s+(.*?)\s+1\s+", tail)
        if cr_match:
            cr_raw = cr_match.group(1).strip()
            if cr_raw and cr_raw != "-":
                cust_ref = cr_raw

        # Sender name: after filler "1 " — skip up to two reference tokens, then grab name
        sender: Optional[str] = None
        sn_match = re.search(r"\s1\s+\S+\s+(?:\S+\s+)?([A-Z][A-Z0-9\s\.\'/\-]+)", tail)
        if sn_match:
            raw_sn = re.sub(r"\d{8,}.*$", "", sn_match.group(1)).strip()
            if raw_sn:
                sender = raw_sn

        # note: prefer descriptive customer ref over raw doc ref
        if cust_ref and not re.fullmatch(r"[\dA-Za-z/\-]+", cust_ref):
            note: Optional[str] = cust_ref
        elif doc_ref and doc_ref != "-":
            note = doc_ref
        else:
            note = cust_ref  # may be None

        results.append(ParsedRow(
            txn_date=str(parsed_date),
            description=description,
            party_name=sender or None,
            amount=round(abs(amount), 2),
            type=txn_type,
            note=note,
        ))

    return results


def _parse_cimb_portfolio_page(page) -> List[ParsedRow]:
    """
    Parse a single CIMB Portfolio/CASA statement page.

    Each logical table row spans multiple physical lines (cells wrap: "DUITNOW TO" /
    "ACCOUNT", "MYR 16,000." / "00", etc.).  The fix: find every occurrence of the
    10-digit account number in the leftmost column — each marks exactly one transaction.
    Collect ALL words between consecutive account-number y-positions, sort by (y, x),
    then apply the transaction regex.  This reconstructs rows correctly regardless of
    column-major text ordering or wrapped cells.
    """
    try:
        words = page.extract_words(x_tolerance=5, y_tolerance=3)
    except Exception:
        return _parse_cimb_portfolio_text(page.extract_text() or "")

    if not words:
        return _parse_cimb_portfolio_text(page.extract_text() or "")

    # ── 1. Find account-number words (10-digit integers) in the leftmost column ──
    acct_words = [w for w in words if re.fullmatch(r"\d{10}", w["text"])]
    if not acct_words:
        return _parse_cimb_portfolio_text(page.extract_text() or "")

    # Keep only the leftmost column (real acct-no column), skip any that appear
    # further right (shouldn't happen, but guards against edge cases).
    min_x0 = min(w["x0"] for w in acct_words)
    row_anchors = sorted(
        [w for w in acct_words if w["x0"] <= min_x0 + 15],
        key=lambda w: w["top"],
    )

    if not row_anchors:
        return _parse_cimb_portfolio_text(page.extract_text() or "")

    # ── 2. For each transaction (anchor → next anchor), collect & sort words ────
    row_re = re.compile(
        r"\d{10}\s+"            # account number
        r"\d{9}\s+"             # record sequence
        r"(\d{8})\s+"           # date DDMMYYYY  [1]
        r"\d{3,4}\s+"           # transaction code
        r"([A-Z][A-Z ]+?)\s+"   # description (uppercase, lazy) [2]
        r"(?:-|\d{4})\s+"       # originating branch code
        r"(\S+?)\s+"            # document reference (lazy) [3]
        r"MYR\s*([\d,. ]+?)\s+" # transaction amount (allows split like "16,000. ") [4]
        r"([CD])\s+"            # amount type  [5]
        r"MYR"                  # balance start anchor (not captured)
    )

    results: List[ParsedRow] = []

    for i, anchor in enumerate(row_anchors):
        y_start = anchor["top"] - 3
        y_end   = row_anchors[i + 1]["top"] - 3 if i + 1 < len(row_anchors) else float("inf")

        row_words = [w for w in words if y_start <= w["top"] < y_end]
        # Sort by (y-band, x) so the primary "first line" of each column comes first,
        # followed by wrapped second-line content.
        row_words = sorted(row_words, key=lambda w: (round(w["top"]), w["x0"]))
        row_text  = " ".join(w["text"] for w in row_words)

        m = row_re.search(row_text)
        if not m:
            continue

        parsed_date = _parse_date(m.group(1))
        if not parsed_date:
            continue

        amount = _parse_amount(re.sub(r"\s+", "", m.group(4)))
        if not amount:
            continue

        txn_type    = "credit" if m.group(5) == "C" else "debit"
        description = m.group(2).strip()
        doc_ref     = m.group(3).rstrip("-")   # strip trailing hyphen from split refs
        tail        = row_text[m.end():]

        # Customer reference: after time(6 digits) up to filler "1 "
        cust_ref: Optional[str] = None
        cr_match = re.search(r"[CD]\s+\d{6}\s+(.*?)\s+1\s+", tail)
        if cr_match:
            cr_raw = cr_match.group(1).strip()
            if cr_raw and cr_raw != "-":
                cust_ref = cr_raw

        # Sender name: last block of UPPER-CASE words in the tail (after filler "1 ")
        sender: Optional[str] = None
        # Look for the filler "1" then skip two reference tokens, then grab the name
        sn_match = re.search(
            r"\b1\b\s+\S.*?([A-Z]{2}[A-Z0-9\s\.\'/\-]+?)(?:\s+\d{6,}|\s*$)", tail
        )
        if sn_match:
            raw_sn = sn_match.group(1).strip()
            # Filter out short or purely numeric fragments
            if raw_sn and not re.fullmatch(r"[\d\-/]+", raw_sn) and len(raw_sn) >= 3:
                sender = raw_sn

        if cust_ref and not re.fullmatch(r"[\dA-Za-z/\-]+", cust_ref):
            note: Optional[str] = cust_ref
        elif doc_ref and doc_ref != "-":
            note = doc_ref
        else:
            note = cust_ref

        results.append(ParsedRow(
            txn_date=str(parsed_date),
            description=description,
            party_name=sender or None,
            amount=round(abs(amount), 2),
            type=txn_type,
            note=note,
        ))

    return results


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
    headers: List[str] = []
    for i, row in enumerate(rows[:15]):
        joined = " ".join(row).lower()
        if any(k in joined for k in ["date", "debit", "credit", "amount", "narration", "description", "transaction"]):
            header_idx = i
            headers = [_normalise_header(h) for h in row]
            break

    if not headers:
        return []

    date_col   = _detect_column(headers, ["date", "transaction date", "value date"])
    desc_col   = _detect_column(headers, ["description", "narration", "particular", "detail", "remark",
                                          "transaction code description", "code description"])
    debit_col  = _detect_column(headers, ["debit", "withdrawal", "dr"])
    credit_col = _detect_column(headers, ["credit", "deposit", "cr"])
    amount_col = _detect_column(headers, ["transaction amount", "amount"]) if (debit_col is None or credit_col is None) else None
    type_col   = _detect_type_col(headers)
    party_col  = _detect_column(headers, ["sender name", "sender", "party", "beneficiary", "payee", "remitter"])
    doc_col    = _detect_column(headers, ["document reference", "doc ref", "document ref"])
    cust_ref_col = _detect_column(headers, ["customer reference", "cust ref", "customer ref"])

    if date_col is None:
        return []

    def _cell(row: List[str], idx: Optional[int]) -> str:
        return row[idx].strip() if idx is not None and idx < len(row) else ""

    results: List[ParsedRow] = []
    for row in rows[header_idx + 1:]:
        if not row or all(c.strip() == "" for c in row):
            continue
        try:
            raw_date = _cell(row, date_col)
            parsed_date = _parse_date(raw_date)
            if not parsed_date:
                continue

            description = _cell(row, desc_col)
            party_name  = _cell(row, party_col) or None
            doc_ref     = _cell(row, doc_col)
            cust_ref    = _cell(row, cust_ref_col)
            note_parts  = [p for p in [doc_ref, cust_ref] if p]
            note        = " | ".join(note_parts) or None

            if type_col is not None and amount_col is not None:
                # CIMB-style: single amount column + C/D type column
                type_cell = _cell(row, type_col)
                amt = _parse_amount(_cell(row, amount_col))
                if amt is None or amt == 0:
                    continue
                txn_type = _resolve_type(type_cell, None, None)
                if txn_type is None:
                    continue
                amount = abs(amt)
            elif amount_col is not None:
                amt = _parse_amount(_cell(row, amount_col))
                if amt is None:
                    continue
                txn_type = "credit" if amt >= 0 else "debit"
                amount = abs(amt)
            else:
                debit  = _parse_amount(_cell(row, debit_col))  if debit_col  is not None else None
                credit = _parse_amount(_cell(row, credit_col)) if credit_col is not None else None
                txn_type = _resolve_type("", debit, credit)
                if txn_type is None:
                    continue
                amount = abs(debit) if txn_type == "debit" else abs(credit)  # type: ignore[arg-type]

            results.append(ParsedRow(
                txn_date=str(parsed_date),
                description=description,
                party_name=party_name,
                amount=round(amount, 2),
                type=txn_type,
                note=note,
            ))
        except (IndexError, Exception):
            continue

    return results


def _parse_pdf_content(file_bytes: bytes) -> List[ParsedRow]:
    results: List[ParsedRow] = []
    try:
        with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
            for page in pdf.pages:
                tables = page.extract_tables()
                page_had_table = False

                for table in tables:
                    if not table:
                        continue

                    # Find header row (search first 8 rows to handle multi-row headers)
                    header_row_idx = None
                    headers: List[str] = []
                    for i, row in enumerate(table[:8]):
                        if row is None:
                            continue
                        cells = [_normalise_header(c) for c in row]
                        joined = " ".join(cells).lower()
                        if any(k in joined for k in ["date", "debit", "credit", "amount", "narration",
                                                      "description", "transaction"]):
                            header_row_idx = i
                            headers = cells
                            break

                    if header_row_idx is None or not headers:
                        continue

                    date_col     = _detect_column(headers, ["transaction date", "date", "value date"])
                    desc_col     = _detect_column(headers, ["transaction code description", "code description",
                                                            "description", "narration", "particular", "detail"])
                    debit_col    = _detect_column(headers, ["debit", "withdrawal", "dr"])
                    credit_col   = _detect_column(headers, ["credit", "deposit", "cr"])
                    amount_col   = _detect_column(headers, ["transaction amount", "amount"]) \
                                   if (debit_col is None or credit_col is None) else None
                    type_col     = _detect_type_col(headers)
                    party_col    = _detect_column(headers, ["sender name", "sender", "beneficiary", "payee", "remitter"])
                    doc_col      = _detect_column(headers, ["document reference", "doc reference", "doc ref"])
                    cust_ref_col = _detect_column(headers, ["customer reference", "cust reference", "cust ref"])

                    if date_col is None:
                        continue

                    def _cell(row: List, idx: Optional[int]) -> str:
                        return _normalise_header(row[idx]) if idx is not None and idx < len(row) else ""

                    for row in table[header_row_idx + 1:]:
                        if not row or all((c is None or str(c).strip() == "") for c in row):
                            continue
                        try:
                            raw_date = _cell(row, date_col)
                            parsed_date = _parse_date(raw_date)
                            if not parsed_date:
                                continue

                            description  = _cell(row, desc_col)
                            party_name   = _cell(row, party_col) or None
                            doc_ref      = _cell(row, doc_col)
                            cust_ref     = _cell(row, cust_ref_col)
                            note_parts   = [p for p in [doc_ref, cust_ref] if p]
                            note         = " | ".join(note_parts) or None

                            if type_col is not None and amount_col is not None:
                                # CIMB Portfolio/CASA: single amount + C/D type column
                                type_cell = _cell(row, type_col)
                                amt = _parse_amount(_cell(row, amount_col))
                                if amt is None or amt == 0:
                                    continue
                                txn_type = _resolve_type(type_cell, None, None)
                                if txn_type is None:
                                    continue
                                amount = abs(amt)
                            elif amount_col is not None:
                                amt = _parse_amount(_cell(row, amount_col))
                                if amt is None:
                                    continue
                                txn_type = "credit" if amt >= 0 else "debit"
                                amount = abs(amt)
                            else:
                                debit  = _parse_amount(_cell(row, debit_col))  if debit_col  is not None else None
                                credit = _parse_amount(_cell(row, credit_col)) if credit_col is not None else None
                                txn_type = _resolve_type("", debit, credit)
                                if txn_type is None:
                                    continue
                                amount = abs(debit) if txn_type == "debit" else abs(credit)  # type: ignore[arg-type]

                            page_had_table = True
                            results.append(ParsedRow(
                                txn_date=str(parsed_date),
                                description=description,
                                party_name=party_name,
                                amount=round(amount, 2),
                                type=txn_type,
                                note=note,
                            ))
                        except Exception:
                            continue

                # Fallback: text-based parsing for statements without detectable table borders
                if not page_had_table:
                    text_content = page.extract_text() or ""

                    # CIMB Portfolio/CASA detection: statement has 10-digit account numbers and "Amount Type" column.
                    # Use the word-coordinate parser so rows are reconstructed left-to-right, not column-major.
                    if re.search(r"\d{10}", text_content) and re.search(r"Amount\s*Type|MYR\s+[\d,]+\.\d{2}\s+[CD]", text_content):
                        cimb_rows = _parse_cimb_portfolio_page(page)
                        if cimb_rows:
                            results.extend(cimb_rows)
                            continue  # skip generic regex for this page

                    # Generic regex for DD/MM/YYYY or DD-MM-YYYY statements
                    pattern = re.compile(
                        r"(\d{2}[\/\-]\d{2}[\/\-]\d{4})\s+([\w\s\-\/\*]+?)\s+([\d,]+\.\d{2})(?:\s+([\d,]+\.\d{2}))?",
                        re.MULTILINE,
                    )
                    for m in pattern.finditer(text_content):
                        parsed_date = _parse_date(m.group(1))
                        if not parsed_date:
                            continue
                        description = m.group(2).strip()
                        amt1 = _parse_amount(m.group(3))
                        amt2 = _parse_amount(m.group(4)) if m.group(4) else None
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

@router.post("/debug/parse-pdf")
async def debug_parse_pdf(file: UploadFile = File(...)):
    """Temporary debug endpoint — returns raw pdfplumber extraction info."""
    import pdfplumber, io as _io
    content = await file.read()
    result: dict = {"pages": []}
    with pdfplumber.open(_io.BytesIO(content)) as pdf:
        for pg_num, page in enumerate(pdf.pages):
            text = page.extract_text() or ""
            words = page.extract_words(x_tolerance=5, y_tolerance=3)
            acct_words = [w for w in words if __import__("re").fullmatch(r"\d{10}", w["text"])]
            cimb_rows = _parse_cimb_portfolio_page(page)
            result["pages"].append({
                "page": pg_num + 1,
                "text_preview": text[:500],
                "word_count": len(words),
                "acct_number_hits": [{"text": w["text"], "x0": w["x0"], "top": w["top"]} for w in acct_words],
                "cimb_rows_found": len(cimb_rows),
                "cimb_rows": [r.dict() for r in cimb_rows],
            })
    return result


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
                (account_id, statement_id, txn_date, description, party_name, amount, type, note)
                VALUES (:aid, :sid, :d, :desc, :party, :amt, :type, :note)
            """),
            {"aid": account_id, "sid": stmt_id, "d": row.txn_date,
             "desc": row.description, "party": row.party_name,
             "amt": row.amount, "type": row.type, "note": row.note},
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
    tid = get_effective_tenant_id(current_user)
    where = "i.status != 'cancelled' AND (i.is_deleted = 0 OR i.is_deleted IS NULL)"
    params: dict = {}
    if tid is not None:
        where += " AND i.tenant_id = :tid"
        params["tid"] = tid
    r = await db.execute(
        text(f"""
            SELECT i.id, i.invoice_number, i.total, i.balance_due, i.status, c.company_name AS client_name
            FROM invoices i
            LEFT JOIN clients c ON c.id = i.client_id
            WHERE {where}
            ORDER BY i.issue_date DESC
            LIMIT 500
        """),
        params,
    )
    return [
        {"id": row[0], "invoice_number": row[1], "total": float(row[2]),
         "balance_due": float(row[3]), "client_name": row[5] or "—", "status": row[4]}
        for row in r.fetchall()
    ]


@router.get("/bills/unpaid")
async def list_unpaid_bills(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tid = get_effective_tenant_id(current_user)
    where = "is_deleted = 0"
    params: dict = {}
    if tid is not None:
        where += " AND tenant_id = :tid"
        params["tid"] = tid
    r = await db.execute(
        text(f"""
            SELECT id, bill_number, amount, vendor_name, status
            FROM bills
            WHERE {where}
            ORDER BY issue_date DESC
            LIMIT 200
        """),
        params,
    )
    return [
        {"id": row[0], "bill_number": row[1], "amount": float(row[2]),
         "vendor_name": row[3] or "—", "status": row[4]}
        for row in r.fetchall()
    ]
