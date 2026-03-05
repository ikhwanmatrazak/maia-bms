from decimal import Decimal, ROUND_HALF_UP
from typing import List, Optional


def calculate_line_total(
    quantity: Decimal,
    unit_price: Decimal,
    tax_rate: Optional[Decimal] = None,
) -> dict:
    subtotal = (quantity * unit_price).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    tax_amount = Decimal("0.00")
    if tax_rate:
        tax_amount = (subtotal * tax_rate / 100).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    line_total = subtotal + tax_amount
    return {
        "subtotal": subtotal,
        "tax_amount": tax_amount,
        "line_total": line_total,
    }


def calculate_document_totals(
    items: List[dict],
    discount_amount: Decimal = Decimal("0.00"),
) -> dict:
    subtotal = sum(
        (Decimal(str(item.get("subtotal", 0))) for item in items),
        Decimal("0.00"),
    ).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    tax_total = sum(
        (Decimal(str(item.get("tax_amount", 0))) for item in items),
        Decimal("0.00"),
    ).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    total = (subtotal + tax_total - discount_amount).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )

    return {
        "subtotal": subtotal,
        "tax_total": tax_total,
        "discount_amount": discount_amount,
        "total": max(total, Decimal("0.00")),
    }
