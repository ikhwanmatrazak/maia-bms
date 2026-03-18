import hmac
import hashlib
import httpx
from app.config import get_settings

BILLPLZ_API_URL = "https://www.billplz.com/api/v3"
BILLPLZ_SANDBOX_URL = "https://www.billplz-sandbox.com/api/v3"


def _base_url() -> str:
    cfg = get_settings()
    return BILLPLZ_SANDBOX_URL if cfg.billplz_sandbox else BILLPLZ_API_URL


async def create_bill(invoice, description: str | None = None) -> dict:
    """Create a Billplz bill for an invoice. Returns the bill dict with 'url'."""
    cfg = get_settings()
    if not cfg.billplz_api_key or not cfg.billplz_collection_id:
        raise ValueError("Billplz API key and collection ID are not configured.")

    client_name = (invoice.client.company_name if invoice.client else None) or "Customer"
    client_email = invoice.client.email if invoice.client else None
    client_phone = invoice.client.phone if invoice.client else None

    # Billplz requires email OR mobile
    if not client_email and not client_phone:
        raise ValueError("Client must have an email or phone number to generate a payment link.")

    amount_cents = int(round(float(invoice.balance_due) * 100))
    if amount_cents <= 0:
        raise ValueError("Invoice balance due must be greater than zero.")

    payload = {
        "collection_id": cfg.billplz_collection_id,
        "name": client_name,
        "amount": str(amount_cents),
        "callback_url": f"{cfg.backend_url}/api/v1/gateway/billplz/webhook",
        "description": description or f"Invoice {invoice.invoice_number}",
        "redirect_url": f"{cfg.frontend_url}/payment/result?invoice={invoice.invoice_number}",
        "reference_1_label": "Invoice No",
        "reference_1": invoice.invoice_number,
    }
    if client_email:
        payload["email"] = client_email
    if client_phone:
        payload["mobile"] = client_phone

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{_base_url()}/bills",
            auth=(cfg.billplz_api_key, ""),
            data=payload,
            timeout=15,
        )
        resp.raise_for_status()
        return resp.json()


async def get_bill(bill_id: str) -> dict:
    cfg = get_settings()
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{_base_url()}/bills/{bill_id}",
            auth=(cfg.billplz_api_key, ""),
            timeout=15,
        )
        resp.raise_for_status()
        return resp.json()


def verify_webhook_signature(params: dict) -> bool:
    """Verify Billplz X-Signature from webhook callback params."""
    cfg = get_settings()
    if not cfg.billplz_x_signature_key:
        return True  # skip verification if not configured

    received_sig = params.get("x_signature", "")
    data = {k: v for k, v in params.items() if k != "x_signature"}
    sorted_pairs = sorted(data.items())
    source = "|".join(f"{k}|{v}" for k, v in sorted_pairs)
    computed = hmac.new(
        cfg.billplz_x_signature_key.encode(),
        source.encode(),
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(computed, received_sig)


def verify_redirect_signature(params: dict) -> bool:
    """Verify Billplz X-Signature from redirect URL params (billplz[...] format)."""
    cfg = get_settings()
    if not cfg.billplz_x_signature_key:
        return True

    received_sig = params.get("billplz[x_signature]", "")
    data = {k: v for k, v in params.items() if k != "billplz[x_signature]"}
    sorted_pairs = sorted(data.items())
    source = "|".join(f"{k}|{v}" for k, v in sorted_pairs)
    computed = hmac.new(
        cfg.billplz_x_signature_key.encode(),
        source.encode(),
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(computed, received_sig)
