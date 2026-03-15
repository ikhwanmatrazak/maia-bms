import os
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List

from app.database import get_db
from app.models.settings import CompanySettings, TaxRate, DocumentTemplate, EmailTemplate
from app.models.user import User
from app.schemas.settings import (
    CompanySettingsUpdate, CompanySettingsResponse,
    TaxRateCreate, TaxRateUpdate, TaxRateResponse,
    SMTPTestRequest, EmailTemplateUpsert, EmailTemplateResponse,
)
from app.middleware.auth import get_current_user
from app.middleware.rbac import require_admin, require_admin_or_manager, get_effective_tenant_id
from app.config import get_settings

router = APIRouter(prefix="/settings", tags=["settings"])
app_settings = get_settings()


def _encrypt(password: str) -> str:
    from cryptography.fernet import Fernet
    key = app_settings.encryption_key.encode()
    if len(key) == 44:  # Fernet key length
        f = Fernet(key)
    else:
        import base64
        key_bytes = key[:32].ljust(32, b'=')
        key_b64 = base64.urlsafe_b64encode(key_bytes)
        f = Fernet(key_b64)
    return f.encrypt(password.encode()).decode()


def _decrypt(encrypted: str) -> str:
    from cryptography.fernet import Fernet
    key = app_settings.encryption_key.encode()
    if len(key) == 44:
        f = Fernet(key)
    else:
        import base64
        key_bytes = key[:32].ljust(32, b'=')
        key_b64 = base64.urlsafe_b64encode(key_bytes)
        f = Fernet(key_b64)
    return f.decrypt(encrypted.encode()).decode()


async def _get_or_create_settings(db: AsyncSession, tenant_id=None) -> CompanySettings:
    query = select(CompanySettings)
    if tenant_id is not None:
        query = query.where(CompanySettings.tenant_id == tenant_id)
    result = await db.execute(query.limit(1))
    settings = result.scalar_one_or_none()
    if not settings:
        settings = CompanySettings(tenant_id=tenant_id)
        db.add(settings)
        await db.commit()
        await db.refresh(settings)
    return settings


@router.get("/company", response_model=CompanySettingsResponse)
async def get_company_settings(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await _get_or_create_settings(db, tenant_id=get_effective_tenant_id(current_user))


@router.put("/company", response_model=CompanySettingsResponse)
async def update_company_settings(
    body: CompanySettingsUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin()),
):
    settings = await _get_or_create_settings(db, tenant_id=get_effective_tenant_id(current_user))
    update_data = body.model_dump(exclude_unset=True)

    if "smtp_password" in update_data and update_data["smtp_password"]:
        settings.smtp_pass_encrypted = _encrypt(update_data.pop("smtp_password"))
    elif "smtp_password" in update_data:
        update_data.pop("smtp_password")

    for key, value in update_data.items():
        setattr(settings, key, value)

    await db.commit()
    await db.refresh(settings)
    return settings


@router.post("/company/logo", response_model=CompanySettingsResponse)
async def upload_logo(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin()),
):
    if file.content_type not in {"image/jpeg", "image/png", "image/webp", "image/svg+xml"}:
        raise HTTPException(status_code=400, detail="Invalid file type for logo")

    content = await file.read()
    if len(content) > app_settings.max_file_size_mb * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large")

    import base64
    import io
    from PIL import Image
    # Resize to max 400x150 and re-encode as PNG to keep DB size small (~20-40KB)
    try:
        img = Image.open(io.BytesIO(content)).convert("RGBA")
        img.thumbnail((400, 150), Image.LANCZOS)
        buf = io.BytesIO()
        img.save(buf, format="PNG", optimize=True)
        content = buf.getvalue()
    except Exception:
        pass  # fallback: use original content
    data_uri = f"data:image/png;base64,{base64.b64encode(content).decode()}"

    settings = await _get_or_create_settings(db, tenant_id=get_effective_tenant_id(current_user))
    settings.logo_url = data_uri
    await db.commit()
    await db.refresh(settings)
    return settings


@router.post("/company/signature", response_model=CompanySettingsResponse)
async def upload_signature(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin()),
):
    if file.content_type not in {"image/jpeg", "image/png", "image/webp"}:
        raise HTTPException(status_code=400, detail="Invalid file type for signature")

    content = await file.read()
    if len(content) > app_settings.max_file_size_mb * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large")

    import base64
    mime = file.content_type or "image/png"
    data_uri = f"data:{mime};base64,{base64.b64encode(content).decode()}"

    settings = await _get_or_create_settings(db, tenant_id=get_effective_tenant_id(current_user))
    settings.signature_image_url = data_uri
    await db.commit()
    await db.refresh(settings)
    return settings


@router.get("/tax-rates", response_model=List[TaxRateResponse])
async def list_tax_rates(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(TaxRate).where(TaxRate.is_active == True).order_by(TaxRate.rate))
    return result.scalars().all()


@router.post("/tax-rates", response_model=TaxRateResponse, status_code=status.HTTP_201_CREATED)
async def create_tax_rate(
    body: TaxRateCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_manager()),
):
    if body.is_default:
        result = await db.execute(select(TaxRate).where(TaxRate.is_default == True))
        existing = result.scalars().all()
        for t in existing:
            t.is_default = False

    tax_rate = TaxRate(name=body.name, rate=body.rate, is_default=body.is_default)
    db.add(tax_rate)
    await db.commit()
    await db.refresh(tax_rate)
    return tax_rate


@router.put("/tax-rates/{rate_id}", response_model=TaxRateResponse)
async def update_tax_rate(
    rate_id: int,
    body: TaxRateUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_manager()),
):
    result = await db.execute(select(TaxRate).where(TaxRate.id == rate_id))
    tax_rate = result.scalar_one_or_none()
    if not tax_rate:
        raise HTTPException(status_code=404, detail="Tax rate not found")

    if body.is_default:
        existing = await db.execute(select(TaxRate).where(TaxRate.is_default == True, TaxRate.id != rate_id))
        for t in existing.scalars().all():
            t.is_default = False

    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(tax_rate, key, value)
    await db.commit()
    await db.refresh(tax_rate)
    return tax_rate


def _tmpl_dict(t: DocumentTemplate) -> dict:
    import json as _json
    data = {}
    if t.template_json:
        try:
            data = _json.loads(t.template_json)
        except Exception:
            pass
    return {
        "id": t.id,
        "name": t.name,
        "type": t.type,
        "style": data.get("style", "professional"),
        "is_default": t.is_default,
        "items": data.get("items", []),
        "notes": data.get("notes", ""),
        "terms_conditions": data.get("terms_conditions", ""),
        "currency": data.get("currency", "MYR"),
        "exchange_rate": data.get("exchange_rate", 1),
        "discount_amount": data.get("discount_amount", 0),
        "expiry_days": data.get("expiry_days", 0),
        "due_days": data.get("due_days", 0),
    }


async def _seed_default_templates(db: AsyncSession, tenant_id=None):
    """Create built-in Professional + Minimal templates for this tenant if none exist."""
    import json as _json
    from app.models.settings import TemplateType
    for doc_type in TemplateType:
        result = await db.execute(
            select(DocumentTemplate).where(
                DocumentTemplate.type == doc_type,
                DocumentTemplate.tenant_id == tenant_id,
            )
        )
        if result.scalars().first() is None:
            for style, name in [("professional", "Professional"), ("minimal", "Minimal")]:
                db.add(DocumentTemplate(
                    name=name,
                    type=doc_type,
                    tenant_id=tenant_id,
                    template_json=_json.dumps({"style": style}),
                    is_default=(style == "professional"),
                ))
    await db.commit()


@router.get("/templates")
async def list_templates(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tenant_id = get_effective_tenant_id(current_user)
    await _seed_default_templates(db, tenant_id=tenant_id)
    result = await db.execute(
        select(DocumentTemplate)
        .where(DocumentTemplate.tenant_id == tenant_id)
        .order_by(DocumentTemplate.type, DocumentTemplate.name)
    )
    return [_tmpl_dict(t) for t in result.scalars().all()]


@router.post("/templates", status_code=201)
async def create_template(
    body: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_manager()),
):
    import json as _json
    from app.models.settings import TemplateType
    name = body.get("name", "").strip()
    doc_type = body.get("type")
    style = body.get("style", "professional")
    if not name:
        raise HTTPException(status_code=400, detail="Name is required")
    if doc_type not in [e.value for e in TemplateType]:
        raise HTTPException(status_code=400, detail="Invalid type")
    if style not in ("professional", "minimal"):
        raise HTTPException(status_code=400, detail="Style must be 'professional' or 'minimal'")
    template = DocumentTemplate(
        name=name, type=doc_type,
        tenant_id=get_effective_tenant_id(current_user),
        template_json=_json.dumps({
            "style": style,
            "items": body.get("items", []),
            "notes": body.get("notes", ""),
            "terms_conditions": body.get("terms_conditions", ""),
            "currency": body.get("currency", "MYR"),
            "exchange_rate": body.get("exchange_rate", 1),
            "discount_amount": body.get("discount_amount", 0),
            "expiry_days": body.get("expiry_days", 0),
            "due_days": body.get("due_days", 0),
        }),
        is_default=body.get("is_default", False),
    )
    db.add(template)
    await db.commit()
    await db.refresh(template)
    return _tmpl_dict(template)


@router.put("/templates/{template_id}")
async def update_template(
    template_id: int,
    body: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_manager()),
):
    result = await db.execute(select(DocumentTemplate).where(
        DocumentTemplate.id == template_id,
        DocumentTemplate.tenant_id == get_effective_tenant_id(current_user),
    ))
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    import json as _json
    if "name" in body and body["name"].strip():
        template.name = body["name"].strip()
    # Merge any content fields into template_json
    try:
        existing = _json.loads(template.template_json) if template.template_json else {}
    except Exception:
        existing = {}
    for field in ("style", "items", "notes", "terms_conditions", "currency", "exchange_rate", "discount_amount", "expiry_days", "due_days"):
        if field in body:
            existing[field] = body[field]
    template.template_json = _json.dumps(existing)
    if "is_default" in body:
        if body["is_default"]:
            others = await db.execute(
                select(DocumentTemplate).where(DocumentTemplate.type == template.type, DocumentTemplate.id != template_id)
            )
            for t in others.scalars().all():
                t.is_default = False
        template.is_default = body["is_default"]
    await db.commit()
    await db.refresh(template)
    return _tmpl_dict(template)


@router.delete("/templates/{template_id}", status_code=204)
async def delete_template(
    template_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_manager()),
):
    result = await db.execute(select(DocumentTemplate).where(
        DocumentTemplate.id == template_id,
        DocumentTemplate.tenant_id == get_effective_tenant_id(current_user),
    ))
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    await db.delete(template)
    await db.commit()


@router.post("/smtp/test")
async def test_smtp(
    body: SMTPTestRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin()),
):
    from app.services.email_service import send_test_email
    settings = await _get_or_create_settings(db, tenant_id=get_effective_tenant_id(current_user))
    if not settings.smtp_host:
        raise HTTPException(status_code=400, detail="SMTP not configured")

    smtp_password = None
    if settings.smtp_pass_encrypted:
        smtp_password = _decrypt(settings.smtp_pass_encrypted)

    await send_test_email(settings, smtp_password, body.to_email)
    return {"message": f"Test email sent to {body.to_email}"}


_DEFAULT_EMAIL_TEMPLATES = {
    "quotation": {
        "subject": "Quotation {{quotation_number}} from {{company_name}}",
        "body": "Dear {{client_name}},\n\nPlease find attached your quotation {{quotation_number}} dated {{issue_date}}.\n\nTotal Amount: {{currency}} {{total}}\nValid Until: {{expiry_date}}\n\nIf you have any questions, please do not hesitate to contact us.\n\nThank you for your business.\n\nBest regards,\n{{company_name}}",
    },
    "invoice": {
        "subject": "Invoice {{invoice_number}} from {{company_name}}",
        "body": "Dear {{client_name}},\n\nPlease find attached invoice {{invoice_number}} dated {{issue_date}}.\n\nTotal Amount: {{currency}} {{total}}\nAmount Due: {{currency}} {{balance_due}}\nDue Date: {{due_date}}\n\nPlease make payment by the due date. Thank you.\n\nBest regards,\n{{company_name}}",
    },
    "receipt": {
        "subject": "Payment Receipt {{receipt_number}} from {{company_name}}",
        "body": "Dear {{client_name}},\n\nThank you for your payment. Please find attached your payment receipt {{receipt_number}}.\n\nAmount Received: {{currency}} {{amount}}\nPayment Date: {{payment_date}}\nPayment Method: {{payment_method}}\n\nBest regards,\n{{company_name}}",
    },
    "reminder": {
        "subject": "Payment Reminder — Invoice {{invoice_number}}",
        "body": "Dear {{client_name}},\n\nThis is a friendly reminder that invoice {{invoice_number}} for {{currency}} {{balance_due}} was due on {{due_date}}.\n\nPlease arrange payment at your earliest convenience.\n\nIf you have already made payment, please disregard this notice.\n\nBest regards,\n{{company_name}}",
    },
    "renewal": {
        "subject": "Renewal Notice — {{product_name}}",
        "body": "Dear {{client_name}},\n\nThis is a reminder that your subscription to {{product_name}} is due for renewal on {{next_renewal_date}}.\n\nRenewal Amount: {{currency}} {{amount}}\nBilling Cycle: {{billing_cycle}}\n\nPlease contact us if you have any questions or wish to make changes to your subscription.\n\nThank you for your continued support.\n\nBest regards,\n{{company_name}}",
    },
}


@router.get("/email-templates", response_model=List[EmailTemplateResponse])
async def list_email_templates(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tenant_id = get_effective_tenant_id(current_user)
    result = await db.execute(
        select(EmailTemplate)
        .where(EmailTemplate.tenant_id == tenant_id)
        .order_by(EmailTemplate.doc_type)
    )
    existing = {t.doc_type: t for t in result.scalars().all()}

    # Seed defaults per tenant for any missing doc types
    seeded = False
    for doc_type, defaults in _DEFAULT_EMAIL_TEMPLATES.items():
        if doc_type not in existing:
            tmpl = EmailTemplate(doc_type=doc_type, tenant_id=tenant_id, **defaults)
            db.add(tmpl)
            existing[doc_type] = tmpl
            seeded = True
    if seeded:
        await db.commit()
        result = await db.execute(
            select(EmailTemplate)
            .where(EmailTemplate.tenant_id == tenant_id)
            .order_by(EmailTemplate.doc_type)
        )
        existing = {t.doc_type: t for t in result.scalars().all()}

    return list(existing.values())


@router.put("/email-templates/{doc_type}", response_model=EmailTemplateResponse)
async def upsert_email_template(
    doc_type: str,
    body: EmailTemplateUpsert,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_manager()),
):
    if doc_type not in _DEFAULT_EMAIL_TEMPLATES:
        raise HTTPException(status_code=400, detail="Invalid doc_type")
    tenant_id = get_effective_tenant_id(current_user)
    result = await db.execute(
        select(EmailTemplate).where(
            EmailTemplate.doc_type == doc_type,
            EmailTemplate.tenant_id == tenant_id,
        )
    )
    tmpl = result.scalar_one_or_none()
    if tmpl:
        tmpl.subject = body.subject
        tmpl.body = body.body
        tmpl.is_active = body.is_active
    else:
        tmpl = EmailTemplate(doc_type=doc_type, tenant_id=tenant_id, subject=body.subject, body=body.body, is_active=body.is_active)
        db.add(tmpl)
    await db.commit()
    await db.refresh(tmpl)
    return tmpl
