import logging
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, Form, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from app.database import get_db
from app.routers.auth import get_current_user
from app.models.user import User

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/calendar", tags=["calendar"])


# ── helpers ────────────────────────────────────────────────────────────────

async def _get_smtp(db: AsyncSession, tenant_id):
    r = await db.execute(
        text("SELECT * FROM company_settings WHERE tenant_id IS NOT DISTINCT FROM :tid LIMIT 1"),
        {"tid": tenant_id},
    )
    return r.mappings().first()


async def _send_invitations(db: AsyncSession, event_id: int, tenant_id, organizer_name: str, is_update: bool = False):
    """Send invitation emails to all attendees of an event."""
    from app.services.email_service import send_email, decrypt_smtp_password

    # Fetch event + attendees with email
    ev = (await db.execute(
        text("SELECT * FROM calendar_events WHERE id=:id"), {"id": event_id}
    )).mappings().first()
    if not ev:
        return

    attendees = (await db.execute(
        text("""
            SELECT u.email, u.full_name
            FROM calendar_event_attendees a
            JOIN users u ON u.id = a.user_id
            WHERE a.event_id = :eid
        """), {"eid": event_id}
    )).mappings().all()

    if not attendees:
        return

    company = await _get_smtp(db, tenant_id)
    if not company or not company.get("smtp_host"):
        logger.warning("Calendar: SMTP not configured, skipping invitation emails")
        return

    smtp_password = decrypt_smtp_password(company)
    if not smtp_password:
        return

    start_fmt = ev["start_at"].strftime("%A, %d %B %Y at %I:%M %p") if ev["start_at"] else ""
    end_fmt = ev["end_at"].strftime("%I:%M %p") if ev["end_at"] else ""
    subject = f"{'Updated: ' if is_update else ''}Meeting Invitation: {ev['title']}"

    meeting_link_html = ""
    if ev.get("meeting_link"):
        meeting_link_html = f'<p><a href="{ev["meeting_link"]}" style="background:#006FEE;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block;margin-top:8px">Join Meeting</a></p>'

    location_html = ""
    if ev.get("location"):
        location_html = f'<p style="color:#555;">📍 {ev["location"]}</p>'

    notes_html = ""
    if ev.get("description"):
        notes_html = f'<p style="color:#555;margin-top:12px;">{ev["description"]}</p>'

    for att in attendees:
        html = f"""
        <html><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
        <div style="background:#006FEE;padding:20px;border-radius:8px 8px 0 0;">
            <h2 style="color:#fff;margin:0;">{'Updated: ' if is_update else ''}Meeting Invitation</h2>
        </div>
        <div style="border:1px solid #e0e0e0;border-top:none;padding:24px;border-radius:0 0 8px 8px;">
            <p>Hi {att['full_name'] or att['email']},</p>
            <p><strong>{organizer_name}</strong> has {'updated a' if is_update else 'invited you to a'} meeting:</p>
            <div style="background:#f5f7ff;border-left:4px solid #006FEE;padding:16px;border-radius:4px;margin:16px 0;">
                <h3 style="margin:0 0 8px 0;color:#1a1a2e;">{ev['title']}</h3>
                <p style="color:#555;margin:0;">🗓️ {start_fmt}{' – ' + end_fmt if end_fmt else ''}</p>
                {location_html}
                {notes_html}
            </div>
            {meeting_link_html}
            <p style="color:#888;font-size:13px;margin-top:24px;">You are receiving this because you were added as an attendee.</p>
        </div>
        </body></html>
        """
        try:
            await send_email(company, smtp_password, att["email"], subject, html)
        except Exception as e:
            logger.error(f"Calendar invite email failed for {att['email']}: {e}")


# ── endpoints ──────────────────────────────────────────────────────────────

@router.get("/events")
async def list_events(
    year: Optional[int] = None,
    month: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tid = current_user.tenant_id
    uid = current_user.id

    where = "WHERE e.tenant_id IS NOT DISTINCT FROM :tid"
    params: dict = {"tid": tid}

    if year and month:
        where += " AND YEAR(e.start_at)=:yr AND MONTH(e.start_at)=:mo"
        params["yr"] = year
        params["mo"] = month

    rows = (await db.execute(text(f"""
        SELECT e.*,
               u.full_name AS organizer_name,
               (SELECT GROUP_CONCAT(user_id) FROM calendar_event_attendees WHERE event_id=e.id) AS attendee_ids,
               (SELECT status FROM calendar_event_attendees WHERE event_id=e.id AND user_id=:uid) AS my_rsvp
        FROM calendar_events e
        JOIN users u ON u.id = e.organizer_id
        {where}
        ORDER BY e.start_at
    """), {**params, "uid": uid})).mappings().all()

    result = []
    for r in rows:
        attendee_ids = [int(x) for x in r["attendee_ids"].split(",")] if r.get("attendee_ids") else []
        result.append({
            "id": r["id"],
            "title": r["title"],
            "description": r["description"],
            "start_at": r["start_at"].isoformat() if r["start_at"] else None,
            "end_at": r["end_at"].isoformat() if r["end_at"] else None,
            "location": r["location"],
            "meeting_link": r["meeting_link"],
            "organizer_id": r["organizer_id"],
            "organizer_name": r["organizer_name"],
            "color": r["color"],
            "attendee_ids": attendee_ids,
            "my_rsvp": r["my_rsvp"],
        })
    return result


@router.post("/events")
async def create_event(
    title: str = Form(...),
    start_at: str = Form(...),
    end_at: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    location: Optional[str] = Form(None),
    meeting_link: Optional[str] = Form(None),
    color: str = Form("#006FEE"),
    attendee_ids: str = Form(""),   # comma-separated user IDs
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tid = current_user.tenant_id
    r = await db.execute(text("""
        INSERT INTO calendar_events (title, description, start_at, end_at, location, meeting_link, color, organizer_id, tenant_id)
        VALUES (:title, :desc, :start, :end, :loc, :link, :color, :org, :tid)
    """), {
        "title": title, "desc": description,
        "start": start_at, "end": end_at or None,
        "loc": location, "link": meeting_link,
        "color": color, "org": current_user.id, "tid": tid,
    })
    await db.commit()
    event_id = r.lastrowid

    # Add attendees (always include organizer)
    ids_to_add = set()
    ids_to_add.add(current_user.id)
    for part in attendee_ids.split(","):
        part = part.strip()
        if part.isdigit():
            ids_to_add.add(int(part))

    for uid in ids_to_add:
        status = "accepted" if uid == current_user.id else "invited"
        try:
            await db.execute(text(
                "INSERT IGNORE INTO calendar_event_attendees (event_id, user_id, status) VALUES (:eid, :uid, :st)"
            ), {"eid": event_id, "uid": uid, "st": status})
        except Exception:
            pass
    await db.commit()

    # Send invitations (fire-and-forget — don't fail the request)
    try:
        await _send_invitations(db, event_id, tid, current_user.full_name or current_user.email)
    except Exception as e:
        logger.error(f"Invitation send error: {e}")

    return {"id": event_id, "message": "Event created"}


@router.get("/events/{event_id}")
async def get_event(
    event_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ev = (await db.execute(
        text("SELECT * FROM calendar_events WHERE id=:id AND tenant_id IS NOT DISTINCT FROM :tid"),
        {"id": event_id, "tid": current_user.tenant_id}
    )).mappings().first()
    if not ev:
        raise HTTPException(404, "Event not found")

    attendees = (await db.execute(text("""
        SELECT a.user_id, a.status, u.full_name, u.email
        FROM calendar_event_attendees a
        JOIN users u ON u.id = a.user_id
        WHERE a.event_id = :eid
    """), {"eid": event_id})).mappings().all()

    return {
        **dict(ev),
        "start_at": ev["start_at"].isoformat() if ev["start_at"] else None,
        "end_at": ev["end_at"].isoformat() if ev["end_at"] else None,
        "attendees": [dict(a) for a in attendees],
    }


@router.patch("/events/{event_id}")
async def update_event(
    event_id: int,
    title: Optional[str] = Form(None),
    start_at: Optional[str] = Form(None),
    end_at: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    location: Optional[str] = Form(None),
    meeting_link: Optional[str] = Form(None),
    color: Optional[str] = Form(None),
    attendee_ids: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ev = (await db.execute(
        text("SELECT * FROM calendar_events WHERE id=:id AND tenant_id IS NOT DISTINCT FROM :tid"),
        {"id": event_id, "tid": current_user.tenant_id}
    )).mappings().first()
    if not ev:
        raise HTTPException(404, "Event not found")
    if ev["organizer_id"] != current_user.id and current_user.role not in ("admin", "manager"):
        raise HTTPException(403, "Only organizer can edit")

    sets, params = [], {"id": event_id}
    for field, val in [("title", title), ("description", description), ("start_at", start_at),
                       ("end_at", end_at), ("location", location), ("meeting_link", meeting_link), ("color", color)]:
        if val is not None:
            sets.append(f"{field}=:{field}")
            params[field] = val
    if sets:
        await db.execute(text(f"UPDATE calendar_events SET {', '.join(sets)} WHERE id=:id"), params)

    if attendee_ids is not None:
        await db.execute(text("DELETE FROM calendar_event_attendees WHERE event_id=:eid AND user_id != :org"),
                         {"eid": event_id, "org": ev["organizer_id"]})
        for part in attendee_ids.split(","):
            part = part.strip()
            if part.isdigit():
                try:
                    await db.execute(text(
                        "INSERT IGNORE INTO calendar_event_attendees (event_id, user_id, status) VALUES (:eid, :uid, 'invited')"
                    ), {"eid": event_id, "uid": int(part)})
                except Exception:
                    pass

    await db.commit()

    try:
        await _send_invitations(db, event_id, current_user.tenant_id,
                                current_user.full_name or current_user.email, is_update=True)
    except Exception as e:
        logger.error(f"Update invitation error: {e}")

    return {"message": "Updated"}


@router.delete("/events/{event_id}")
async def delete_event(
    event_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ev = (await db.execute(
        text("SELECT organizer_id FROM calendar_events WHERE id=:id AND tenant_id IS NOT DISTINCT FROM :tid"),
        {"id": event_id, "tid": current_user.tenant_id}
    )).mappings().first()
    if not ev:
        raise HTTPException(404)
    if ev["organizer_id"] != current_user.id and current_user.role not in ("admin", "manager"):
        raise HTTPException(403, "Only organizer can delete")
    await db.execute(text("DELETE FROM calendar_event_attendees WHERE event_id=:id"), {"id": event_id})
    await db.execute(text("DELETE FROM calendar_events WHERE id=:id"), {"id": event_id})
    await db.commit()
    return {"message": "Deleted"}


@router.post("/events/{event_id}/rsvp")
async def rsvp_event(
    event_id: int,
    status: str = Form(...),   # accepted / declined
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if status not in ("accepted", "declined"):
        raise HTTPException(400, "status must be accepted or declined")
    await db.execute(text("""
        UPDATE calendar_event_attendees SET status=:st
        WHERE event_id=:eid AND user_id=:uid
    """), {"st": status, "eid": event_id, "uid": current_user.id})
    await db.commit()
    return {"message": "RSVP saved"}


@router.get("/users")
async def list_users_for_calendar(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rows = (await db.execute(text("""
        SELECT id, full_name, email, role FROM users
        WHERE tenant_id IS NOT DISTINCT FROM :tid AND is_active=1
        ORDER BY full_name
    """), {"tid": current_user.tenant_id})).mappings().all()
    return [dict(r) for r in rows]
