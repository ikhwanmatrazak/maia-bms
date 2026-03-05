import os
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List

from app.database import get_db
from app.models.settings import CompanySettings, TaxRate, DocumentTemplate
from app.models.user import User
from app.schemas.settings import (
    CompanySettingsUpdate, CompanySettingsResponse,
    TaxRateCreate, TaxRateUpdate, TaxRateResponse,
    SMTPTestRequest,
)
from app.middleware.auth import get_current_user
from app.middleware.rbac import require_admin, require_admin_or_manager
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


async def _get_or_create_settings(db: AsyncSession) -> CompanySettings:
    result = await db.execute(select(CompanySettings).limit(1))
    settings = result.scalar_one_or_none()
    if not settings:
        settings = CompanySettings()
        db.add(settings)
        await db.commit()
        await db.refresh(settings)
    return settings


@router.get("/company", response_model=CompanySettingsResponse)
async def get_company_settings(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await _get_or_create_settings(db)


@router.put("/company", response_model=CompanySettingsResponse)
async def update_company_settings(
    body: CompanySettingsUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin()),
):
    settings = await _get_or_create_settings(db)
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

    upload_dir = os.path.join(app_settings.upload_dir, "logos")
    os.makedirs(upload_dir, exist_ok=True)
    ext = os.path.splitext(file.filename or "logo")[1] or ".png"
    filename = f"company_logo{ext}"
    file_path = os.path.join(upload_dir, filename)
    with open(file_path, "wb") as f:
        f.write(content)

    settings = await _get_or_create_settings(db)
    settings.logo_url = f"/uploads/logos/{filename}"
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

    upload_dir = os.path.join(app_settings.upload_dir, "signatures")
    os.makedirs(upload_dir, exist_ok=True)
    filename = "company_signature.png"
    with open(os.path.join(upload_dir, filename), "wb") as f:
        f.write(content)

    settings = await _get_or_create_settings(db)
    settings.signature_image_url = f"/uploads/signatures/{filename}"
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


@router.get("/templates")
async def list_templates(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(DocumentTemplate))
    templates = result.scalars().all()
    return [{"id": t.id, "name": t.name, "type": t.type, "is_default": t.is_default} for t in templates]


@router.post("/smtp/test")
async def test_smtp(
    body: SMTPTestRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin()),
):
    from app.services.email_service import send_test_email
    settings = await _get_or_create_settings(db)
    if not settings.smtp_host:
        raise HTTPException(status_code=400, detail="SMTP not configured")

    smtp_password = None
    if settings.smtp_pass_encrypted:
        smtp_password = _decrypt(settings.smtp_pass_encrypted)

    await send_test_email(settings, smtp_password, body.to_email)
    return {"message": f"Test email sent to {body.to_email}"}
