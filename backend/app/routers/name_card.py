"""Public digital name card endpoints — no auth required for GET."""
import secrets
import string
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from typing import Optional
from pydantic import BaseModel

from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.user import User

router = APIRouter(tags=["name-card"])

_SLUG_CHARS = string.ascii_lowercase + string.digits
_SLUG_LEN = 10


def _generate_slug() -> str:
    return "".join(secrets.choice(_SLUG_CHARS) for _ in range(_SLUG_LEN))


class CardData(BaseModel):
    card_slug: str
    name: str
    designation: Optional[str] = None
    department: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    photo_url: Optional[str] = None
    company_name: Optional[str] = None
    company_logo_url: Optional[str] = None
    company_address: Optional[str] = None
    company_phone: Optional[str] = None
    company_email: Optional[str] = None
    company_website: Optional[str] = None


class CardSlugResponse(BaseModel):
    card_slug: str


# ── Public endpoint ──────────────────────────────────────────────────────────

@router.get("/public/card/{slug}", response_model=CardData)
async def get_public_card(slug: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        text("SELECT id, name, email, tenant_id FROM users WHERE card_slug = :slug AND is_active = 1"),
        {"slug": slug},
    )
    user_row = result.fetchone()
    if not user_row:
        raise HTTPException(status_code=404, detail="Card not found")

    user_id, user_name, user_email, tenant_id = user_row

    # Employee profile (optional)
    emp = await db.execute(
        text("""
            SELECT e.full_name, e.phone, e.designation, e.photo_url,
                   d.name AS department_name
            FROM hr_employees e
            LEFT JOIN hr_departments d ON d.id = e.department_id
            WHERE e.user_id = :uid
            LIMIT 1
        """),
        {"uid": user_id},
    )
    emp_row = emp.fetchone()

    # Company settings (optional)
    cs = None
    if tenant_id:
        cs_result = await db.execute(
            text("""
                SELECT name, logo_url, address, phone, email, website
                FROM company_settings WHERE tenant_id = :tid LIMIT 1
            """),
            {"tid": tenant_id},
        )
        cs = cs_result.fetchone()

    name = (emp_row[0] if emp_row and emp_row[0] else user_name) or user_name

    return CardData(
        card_slug=slug,
        name=name,
        designation=emp_row[2] if emp_row else None,
        department=emp_row[4] if emp_row else None,
        phone=emp_row[1] if emp_row else None,
        email=user_email,
        photo_url=emp_row[3] if emp_row else None,
        company_name=cs[0] if cs else None,
        company_logo_url=cs[1] if cs else None,
        company_address=cs[2] if cs else None,
        company_phone=cs[3] if cs else None,
        company_email=cs[4] if cs else None,
        company_website=cs[5] if cs else None,
    )


# ── Authenticated endpoints ───────────────────────────────────────────────────

@router.get("/me/card", response_model=CardSlugResponse)
async def get_my_card_slug(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return the current user's card slug, generating one if they don't have one yet."""
    result = await db.execute(
        text("SELECT card_slug FROM users WHERE id = :uid"), {"uid": current_user.id}
    )
    row = result.fetchone()
    slug = row[0] if row else None

    if not slug:
        slug = await _assign_unique_slug(db, current_user.id)

    return CardSlugResponse(card_slug=slug)


@router.post("/me/card/regenerate", response_model=CardSlugResponse)
async def regenerate_my_card_slug(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Issue a brand-new slug (invalidates the old card link)."""
    slug = await _assign_unique_slug(db, current_user.id)
    return CardSlugResponse(card_slug=slug)


async def _assign_unique_slug(db: AsyncSession, user_id: int) -> str:
    for _ in range(10):
        candidate = _generate_slug()
        existing = await db.execute(
            text("SELECT id FROM users WHERE card_slug = :s"), {"s": candidate}
        )
        if not existing.fetchone():
            await db.execute(
                text("UPDATE users SET card_slug = :s WHERE id = :uid"),
                {"s": candidate, "uid": user_id},
            )
            await db.commit()
            return candidate
    raise HTTPException(status_code=500, detail="Could not generate unique slug")
