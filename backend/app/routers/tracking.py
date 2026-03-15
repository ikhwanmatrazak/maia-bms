import secrets
from datetime import datetime, timezone
from fastapi import APIRouter, Depends
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.models.email_tracking import EmailTracking

router = APIRouter(prefix="/track", tags=["tracking"])

PIXEL = bytes([
    0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00,
    0xFF, 0xFF, 0xFF, 0x00, 0x00, 0x00, 0x21, 0xF9, 0x04, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x2C, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02,
    0x44, 0x01, 0x00, 0x3B,
])


@router.get("/{token}.gif")
async def track_open(token: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(EmailTracking).where(EmailTracking.token == token))
    tracking = result.scalar_one_or_none()
    if tracking:
        if not tracking.opened_at:
            tracking.opened_at = datetime.now(timezone.utc)
        tracking.open_count = (tracking.open_count or 0) + 1
        await db.commit()
    return Response(content=PIXEL, media_type="image/gif", headers={"Cache-Control": "no-cache, no-store"})


async def create_tracking(db: AsyncSession, doc_type: str, doc_id: int, recipient_email: str, tenant_id=None) -> str:
    token = secrets.token_urlsafe(32)
    tracking = EmailTracking(
        token=token,
        doc_type=doc_type,
        doc_id=doc_id,
        recipient_email=recipient_email,
        tenant_id=tenant_id,
    )
    db.add(tracking)
    await db.flush()
    return token
