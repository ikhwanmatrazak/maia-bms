"""Digital name card endpoints — multi-card support."""
import os, secrets, string
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from pydantic import BaseModel

from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.user import User

router = APIRouter(tags=["name-card"])

_SLUG_CHARS = string.ascii_lowercase + string.digits
_SLUG_LEN = 10


def _generate_slug() -> str:
    return "".join(secrets.choice(_SLUG_CHARS) for _ in range(_SLUG_LEN))


# ── Pydantic models ───────────────────────────────────────────────────────────

class CardData(BaseModel):
    card_slug: str
    name: str
    designation: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    photo_url: Optional[str] = None
    company_name: Optional[str] = None
    company_logo_url: Optional[str] = None
    company_address: Optional[str] = None
    company_phone: Optional[str] = None
    company_email: Optional[str] = None
    company_website: Optional[str] = None


class CardSummary(BaseModel):
    id: int
    slug: str
    title: Optional[str] = None
    is_default: bool
    name: Optional[str] = None
    designation: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    photo_url: Optional[str] = None


class CardCreate(BaseModel):
    title: Optional[str] = None
    name: Optional[str] = None
    designation: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    photo_url: Optional[str] = None


class CardUpdate(BaseModel):
    title: Optional[str] = None
    name: Optional[str] = None
    designation: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    photo_url: Optional[str] = None


# ── Public endpoint ───────────────────────────────────────────────────────────

@router.get("/public/card/{slug}", response_model=CardData)
async def get_public_card(slug: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        text("SELECT id, user_id, name, designation, phone, email, photo_url FROM name_cards WHERE slug = :slug"),
        {"slug": slug},
    )
    card_row = result.fetchone()
    if not card_row:
        raise HTTPException(status_code=404, detail="Card not found")

    card_id, user_id, card_name, card_designation, card_phone, card_email, card_photo = card_row

    user_result = await db.execute(
        text("SELECT name, email, tenant_id FROM users WHERE id = :uid AND is_active = 1"),
        {"uid": user_id},
    )
    user_row = user_result.fetchone()
    if not user_row:
        raise HTTPException(status_code=404, detail="Card not found")

    user_name, user_email, tenant_id = user_row

    emp = await db.execute(
        text("""
            SELECT e.full_name, e.phone, e.designation, e.photo_url
            FROM hr_employees e WHERE e.user_id = :uid LIMIT 1
        """),
        {"uid": user_id},
    )
    emp_row = emp.fetchone()

    cs = None
    if tenant_id:
        cs_result = await db.execute(
            text("SELECT name, logo_url, address, phone, email, website FROM company_settings WHERE tenant_id = :tid LIMIT 1"),
            {"tid": tenant_id},
        )
        cs = cs_result.fetchone()

    # Card fields override employee profile which overrides user defaults
    name = card_name or (emp_row[0] if emp_row else None) or user_name
    designation = card_designation or (emp_row[2] if emp_row else None)
    phone = card_phone or (emp_row[1] if emp_row else None)
    email = card_email or user_email
    photo_url = card_photo or (emp_row[3] if emp_row else None)

    return CardData(
        card_slug=slug,
        name=name,
        designation=designation,
        phone=phone,
        email=email,
        photo_url=photo_url,
        company_name=cs[0] if cs else None,
        company_logo_url=cs[1] if cs else None,
        company_address=cs[2] if cs else None,
        company_phone=cs[3] if cs else None,
        company_email=cs[4] if cs else None,
        company_website=cs[5] if cs else None,
    )


# ── Authenticated multi-card endpoints ───────────────────────────────────────

@router.get("/me/cards", response_model=List[CardSummary])
async def list_my_cards(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        text("""
            SELECT id, slug, title, is_default, name, designation, phone, email, photo_url
            FROM name_cards WHERE user_id = :uid ORDER BY is_default DESC, id ASC
        """),
        {"uid": current_user.id},
    )
    rows = result.fetchall()
    if not rows:
        await _create_default_card(db, current_user.id)
        result = await db.execute(
            text("""
                SELECT id, slug, title, is_default, name, designation, phone, email, photo_url
                FROM name_cards WHERE user_id = :uid ORDER BY is_default DESC, id ASC
            """),
            {"uid": current_user.id},
        )
        rows = result.fetchall()
    return [CardSummary(id=r[0], slug=r[1], title=r[2], is_default=bool(r[3]),
                        name=r[4], designation=r[5], phone=r[6], email=r[7], photo_url=r[8]) for r in rows]


@router.post("/me/cards/upload-photo")
async def upload_card_photo(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in {".jpg", ".jpeg", ".png", ".webp", ".gif"}:
        raise HTTPException(status_code=400, detail="Invalid image type")
    upload_dir = os.environ.get("UPLOAD_DIR", "uploads")
    os.makedirs(f"{upload_dir}/card_photos", exist_ok=True)
    filename = f"{current_user.id}_{secrets.token_hex(8)}{ext}"
    path = f"{upload_dir}/card_photos/{filename}"
    with open(path, "wb") as f:
        f.write(await file.read())
    return {"photo_url": f"/uploads/card_photos/{filename}"}


@router.post("/me/cards", response_model=CardSummary)
async def create_card(
    payload: CardCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    slug = await _generate_unique_slug(db)
    await db.execute(
        text("""
            INSERT INTO name_cards (user_id, slug, title, is_default, name, designation, phone, email, photo_url)
            VALUES (:uid, :slug, :title, 0, :name, :designation, :phone, :email, :photo_url)
        """),
        {"uid": current_user.id, "slug": slug, "title": payload.title,
         "name": payload.name, "designation": payload.designation,
         "phone": payload.phone, "email": payload.email, "photo_url": payload.photo_url},
    )
    await db.commit()
    result = await db.execute(
        text("SELECT id, slug, title, is_default, name, designation, phone, email, photo_url FROM name_cards WHERE slug = :slug"),
        {"slug": slug},
    )
    r = result.fetchone()
    return CardSummary(id=r[0], slug=r[1], title=r[2], is_default=bool(r[3]),
                       name=r[4], designation=r[5], phone=r[6], email=r[7], photo_url=r[8])


@router.put("/me/cards/{card_id}", response_model=CardSummary)
async def update_card(
    card_id: int,
    payload: CardUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    check = await db.execute(
        text("SELECT id FROM name_cards WHERE id = :cid AND user_id = :uid"),
        {"cid": card_id, "uid": current_user.id},
    )
    if not check.fetchone():
        raise HTTPException(status_code=404, detail="Card not found")
    await db.execute(
        text("""
            UPDATE name_cards SET title=:title, name=:name, designation=:designation,
            phone=:phone, email=:email, photo_url=:photo_url, updated_at=NOW()
            WHERE id=:cid
        """),
        {"cid": card_id, "title": payload.title, "name": payload.name,
         "designation": payload.designation, "phone": payload.phone,
         "email": payload.email, "photo_url": payload.photo_url},
    )
    await db.commit()
    result = await db.execute(
        text("SELECT id, slug, title, is_default, name, designation, phone, email, photo_url FROM name_cards WHERE id = :cid"),
        {"cid": card_id},
    )
    r = result.fetchone()
    return CardSummary(id=r[0], slug=r[1], title=r[2], is_default=bool(r[3]),
                       name=r[4], designation=r[5], phone=r[6], email=r[7], photo_url=r[8])


@router.delete("/me/cards/{card_id}")
async def delete_card(
    card_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        text("SELECT is_default FROM name_cards WHERE id = :cid AND user_id = :uid"),
        {"cid": card_id, "uid": current_user.id},
    )
    row = result.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Card not found")
    if row[0]:
        raise HTTPException(status_code=400, detail="Cannot delete the default card")
    await db.execute(text("DELETE FROM name_cards WHERE id = :cid"), {"cid": card_id})
    await db.commit()
    return {"ok": True}


@router.post("/me/cards/{card_id}/regenerate", response_model=CardSummary)
async def regenerate_card_slug(
    card_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    check = await db.execute(
        text("SELECT id FROM name_cards WHERE id = :cid AND user_id = :uid"),
        {"cid": card_id, "uid": current_user.id},
    )
    if not check.fetchone():
        raise HTTPException(status_code=404, detail="Card not found")
    slug = await _generate_unique_slug(db)
    await db.execute(
        text("UPDATE name_cards SET slug=:slug, updated_at=NOW() WHERE id=:cid"),
        {"slug": slug, "cid": card_id},
    )
    await db.commit()
    result = await db.execute(
        text("SELECT id, slug, title, is_default, name, designation, phone, email, photo_url FROM name_cards WHERE id = :cid"),
        {"cid": card_id},
    )
    r = result.fetchone()
    return CardSummary(id=r[0], slug=r[1], title=r[2], is_default=bool(r[3]),
                       name=r[4], designation=r[5], phone=r[6], email=r[7], photo_url=r[8])


# ── Backward-compat single-card endpoints ────────────────────────────────────

@router.get("/me/card")
async def get_my_card_slug_compat(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        text("SELECT slug FROM name_cards WHERE user_id=:uid AND is_default=1 LIMIT 1"),
        {"uid": current_user.id},
    )
    row = result.fetchone()
    slug = row[0] if row else await _create_default_card(db, current_user.id)
    return {"card_slug": slug}


@router.post("/me/card/regenerate")
async def regenerate_compat(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        text("SELECT id FROM name_cards WHERE user_id=:uid AND is_default=1 LIMIT 1"),
        {"uid": current_user.id},
    )
    row = result.fetchone()
    if not row:
        slug = await _create_default_card(db, current_user.id)
    else:
        slug = await _generate_unique_slug(db)
        await db.execute(
            text("UPDATE name_cards SET slug=:slug WHERE id=:id"),
            {"slug": slug, "id": row[0]},
        )
        await db.commit()
    return {"card_slug": slug}


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _generate_unique_slug(db: AsyncSession) -> str:
    for _ in range(10):
        candidate = _generate_slug()
        existing = await db.execute(
            text("SELECT id FROM name_cards WHERE slug = :s"), {"s": candidate}
        )
        if not existing.fetchone():
            return candidate
    raise HTTPException(status_code=500, detail="Could not generate unique slug")


async def _create_default_card(db: AsyncSession, user_id: int) -> str:
    # Reuse existing slug from users table if available
    result = await db.execute(text("SELECT card_slug FROM users WHERE id=:uid"), {"uid": user_id})
    row = result.fetchone()
    old_slug = row[0] if row and row[0] else None

    if old_slug:
        existing = await db.execute(text("SELECT id FROM name_cards WHERE slug=:s"), {"s": old_slug})
        slug = old_slug if not existing.fetchone() else await _generate_unique_slug(db)
    else:
        slug = await _generate_unique_slug(db)

    await db.execute(
        text("INSERT INTO name_cards (user_id, slug, is_default) VALUES (:uid, :slug, 1)"),
        {"uid": user_id, "slug": slug},
    )
    await db.commit()
    return slug
