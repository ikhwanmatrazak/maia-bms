import logging
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, Form, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.user import User

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/calendar", tags=["calendar"])


# ── helpers ────────────────────────────────────────────────────────────────

async def _get_smtp(db: AsyncSession, tenant_id):
    r = await db.execute(
        text("SELECT * FROM company_settings WHERE (tenant_id = :tid OR (tenant_id IS NULL AND :tid IS NULL)) LIMIT 1"),
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
            SELECT u.email, u.name AS full_name
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

    # Build iCalendar (.ics) content for Outlook one-click add
    # Datetimes are stored as Malaysia local time (UTC+8 / Asia/Kuala_Lumpur).
    # Emit TZID so Outlook interprets them correctly instead of guessing UTC.
    TZID = "Asia/Kuala_Lumpur"

    def _dt(dt) -> str:
        if dt is None:
            return ""
        if isinstance(dt, datetime):
            return dt.strftime("%Y%m%dT%H%M%S")
        return datetime.fromisoformat(str(dt)).strftime("%Y%m%dT%H%M%S")

    dtstart = _dt(ev["start_at"])
    dtend = _dt(ev["end_at"]) if ev.get("end_at") else dtstart
    dtstamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    uid_val = f"{event_id}-{dtstamp}@maia-bms"
    organizer_email = company.get("smtp_from_email", "noreply@maia-bms.com")
    method = "REQUEST"
    sequence = "1" if is_update else "0"

    attendee_lines = "\r\n".join(
        f"ATTENDEE;CN={a['full_name'] or a['email']};RSVP=TRUE:mailto:{a['email']}"
        for a in attendees
    )
    desc_line = (ev.get("description") or "").replace("\n", "\\n")
    loc_line = (ev.get("location") or "")

    ics = (
        "BEGIN:VCALENDAR\r\n"
        "VERSION:2.0\r\n"
        "PRODID:-//MAIA BMS//Calendar//EN\r\n"
        f"METHOD:{method}\r\n"
        # VTIMEZONE block for Asia/Kuala_Lumpur (UTC+8, no DST)
        "BEGIN:VTIMEZONE\r\n"
        f"TZID:{TZID}\r\n"
        "BEGIN:STANDARD\r\n"
        "TZOFFSETFROM:+0800\r\n"
        "TZOFFSETTO:+0800\r\n"
        "TZNAME:MYT\r\n"
        "DTSTART:19700101T000000\r\n"
        "END:STANDARD\r\n"
        "END:VTIMEZONE\r\n"
        "BEGIN:VEVENT\r\n"
        f"UID:{uid_val}\r\n"
        f"SEQUENCE:{sequence}\r\n"
        f"DTSTAMP:{dtstamp}\r\n"
        f"DTSTART;TZID={TZID}:{dtstart}\r\n"
        f"DTEND;TZID={TZID}:{dtend}\r\n"
        f"SUMMARY:{ev['title']}\r\n"
        f"DESCRIPTION:{desc_line}\r\n"
        f"LOCATION:{loc_line}\r\n"
        f"ORGANIZER;CN={organizer_name}:mailto:{organizer_email}\r\n"
        f"{attendee_lines}\r\n"
        "STATUS:CONFIRMED\r\n"
        "TRANSP:OPAQUE\r\n"
        "X-MICROSOFT-CDO-BUSYSTATUS:BUSY\r\n"
        "X-MICROSOFT-CDO-INTENDEDSTATUS:BUSY\r\n"
        "X-MICROSOFT-CDO-ALLDAYEVENT:FALSE\r\n"
        "X-MICROSOFT-CDO-IMPORTANCE:1\r\n"
        "X-MS-OLK-FORCEINSPECTOROPEN:TRUE\r\n"
        "END:VEVENT\r\n"
        "END:VCALENDAR\r\n"
    )

    meeting_link_html = ""
    if ev.get("meeting_link"):
        meeting_link_html = f'<p><a href="{ev["meeting_link"]}" style="background:#006FEE;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block;margin-top:8px">Join Meeting</a></p>'

    location_html = ""
    if ev.get("location"):
        location_html = f'<p style="color:#555;">📍 {ev["location"]}</p>'

    notes_html = ""
    if ev.get("description"):
        notes_html = f'<p style="color:#555;margin-top:12px;">{ev["description"]}</p>'

    # Build a mini day-schedule visual for the email
    start_dt = ev["start_at"]
    end_dt = ev.get("end_at") or start_dt
    day_label = start_dt.strftime("%A, %d %B %Y") if start_dt else ""
    day_num = start_dt.strftime("%d") if start_dt else ""
    month_label = start_dt.strftime("%b").upper() if start_dt else ""
    time_range = f"{start_dt.strftime('%I:%M %p')} – {end_dt.strftime('%I:%M %p')}" if start_dt else ""

    # Generate hour slots from 2 hours before to 2 hours after the event
    schedule_rows = ""
    if start_dt:
        event_start_h = start_dt.hour
        event_end_h = end_dt.hour if end_dt else event_start_h + 1
        slot_start = max(0, event_start_h - 2)
        slot_end = min(23, event_end_h + 2)
        for h in range(slot_start, slot_end + 1):
            ampm = "AM" if h < 12 else "PM"
            hh = h if h <= 12 else h - 12
            hh = 12 if hh == 0 else hh
            label = f"{hh} {ampm}"
            in_event = event_start_h <= h < event_end_h or (h == event_start_h)
            if in_event:
                schedule_rows += f"""
                <tr>
                  <td style="padding:2px 10px 2px 0;font-size:11px;color:#888;white-space:nowrap;vertical-align:top;width:50px;">{label}</td>
                  <td style="padding:2px 0;">
                    <div style="background:#006FEE;color:#fff;padding:6px 10px;border-radius:6px;font-size:12px;font-weight:600;">
                      {ev['title']}{"  " + time_range if h == event_start_h else ""}
                    </div>
                  </td>
                </tr>"""
            else:
                schedule_rows += f"""
                <tr>
                  <td style="padding:4px 10px 4px 0;font-size:11px;color:#bbb;white-space:nowrap;border-top:1px dashed #f0f0f0;">{label}</td>
                  <td style="border-top:1px dashed #f0f0f0;"></td>
                </tr>"""

    for att in attendees:
        html = f"""<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:30px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">

  <!-- Header -->
  <tr><td style="background:#006FEE;padding:24px 30px;">
    <h2 style="color:#fff;margin:0;font-size:22px;">{'📅 Updated: ' if is_update else '📅 '}Meeting Invitation</h2>
  </td></tr>

  <!-- Greeting -->
  <tr><td style="padding:24px 30px 0;">
    <p style="margin:0;font-size:15px;color:#333;">Hi <strong>{att['full_name'] or att['email']}</strong>,</p>
    <p style="margin:8px 0 0;font-size:14px;color:#555;"><strong>{organizer_name}</strong> has {'updated a' if is_update else 'invited you to a'} meeting.</p>
  </td></tr>

  <!-- Event card -->
  <tr><td style="padding:20px 30px;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f5ff;border-radius:10px;overflow:hidden;">
      <tr>
        <!-- Date chip -->
        <td width="70" style="background:#006FEE;text-align:center;padding:16px 12px;vertical-align:top;">
          <div style="color:#fff;font-size:11px;font-weight:600;letter-spacing:1px;">{month_label}</div>
          <div style="color:#fff;font-size:32px;font-weight:700;line-height:1;">{day_num}</div>
          <div style="color:#c8dcff;font-size:10px;margin-top:4px;">{start_dt.strftime('%A') if start_dt else ''}</div>
        </td>
        <!-- Event info -->
        <td style="padding:16px 20px;vertical-align:top;">
          <h3 style="margin:0 0 6px;font-size:17px;color:#1a1a2e;">{ev['title']}</h3>
          <p style="margin:0;font-size:13px;color:#006FEE;font-weight:600;">🕐 {time_range}</p>
          {f'<p style="margin:6px 0 0;font-size:13px;color:#555;">📍 {ev["location"]}</p>' if ev.get("location") else ''}
          {f'<p style="margin:6px 0 0;font-size:13px;color:#666;">{ev["description"]}</p>' if ev.get("description") else ''}
        </td>
      </tr>
    </table>
  </td></tr>

  <!-- Mini schedule -->
  {'<tr><td style="padding:0 30px 20px;"><p style="font-size:11px;font-weight:700;color:#aaa;text-transform:uppercase;letter-spacing:1px;margin:0 0 10px;">Schedule</p><table cellpadding="0" cellspacing="0" width="100%">' + schedule_rows + '</table></td></tr>' if schedule_rows else ''}

  <!-- CTA -->
  {f'<tr><td style="padding:0 30px 24px;">{meeting_link_html}</td></tr>' if meeting_link_html else ''}

  <!-- Footer -->
  <tr><td style="padding:16px 30px;border-top:1px solid #f0f0f0;">
    <p style="margin:0;font-size:12px;color:#aaa;">You are receiving this because <strong>{organizer_name}</strong> added you as an attendee. The .ics file attached can be imported into your calendar app.</p>
  </td></tr>

</table>
</td></tr></table>
</body></html>"""
        try:
            await send_email(company, smtp_password, att["email"], subject, html,
                             ics_content=ics, ics_filename="invite.ics")
        except Exception as e:
            logger.error(f"Calendar invite email failed for {att['email']}: {e}")


# ── endpoints ──────────────────────────────────────────────────────────────

@router.get("/public/events")
async def list_public_events(
    year: Optional[int] = None,
    month: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
):
    where = "WHERE 1=1"
    params: dict = {}
    if year and month:
        where += " AND YEAR(e.start_at)=:yr AND MONTH(e.start_at)=:mo"
        params["yr"] = year
        params["mo"] = month

    rows = (await db.execute(text(f"""
        SELECT e.id, e.title, e.description, e.start_at, e.end_at, e.location, e.meeting_link, e.color,
               u.name AS organizer_name,
               (SELECT GROUP_CONCAT(user_id) FROM calendar_event_attendees WHERE event_id=e.id) AS attendee_ids
        FROM calendar_events e
        JOIN users u ON u.id = e.organizer_id
        {where}
        ORDER BY e.start_at
    """), params)).mappings().all()

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
            "color": r["color"],
            "organizer_name": r["organizer_name"],
            "attendee_ids": attendee_ids,
        })
    return result


@router.get("/public/events/{event_id}")
async def get_public_event(event_id: int, db: AsyncSession = Depends(get_db)):
    ev = (await db.execute(
        text("SELECT e.*, u.name AS organizer_name FROM calendar_events e JOIN users u ON u.id = e.organizer_id WHERE e.id=:id"),
        {"id": event_id}
    )).mappings().first()
    if not ev:
        raise HTTPException(404, "Event not found")

    attendees = (await db.execute(text("""
        SELECT a.user_id, a.status, u.name AS full_name, u.email
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


@router.get("/events")
async def list_events(
    year: Optional[int] = None,
    month: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tid = current_user.tenant_id
    uid = current_user.id

    where = "WHERE (e.tenant_id = :tid OR (e.tenant_id IS NULL AND :tid IS NULL))"
    params: dict = {"tid": tid}

    if year and month:
        where += " AND YEAR(e.start_at)=:yr AND MONTH(e.start_at)=:mo"
        params["yr"] = year
        params["mo"] = month

    rows = (await db.execute(text(f"""
        SELECT e.*,
               u.name AS organizer_name,
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
        await _send_invitations(db, event_id, tid, current_user.name or current_user.email)
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
        text("SELECT * FROM calendar_events WHERE id=:id AND (tenant_id = :tid OR (tenant_id IS NULL AND :tid IS NULL))"),
        {"id": event_id, "tid": current_user.tenant_id}
    )).mappings().first()
    if not ev:
        raise HTTPException(404, "Event not found")

    attendees = (await db.execute(text("""
        SELECT a.user_id, a.status, u.name AS full_name, u.email
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
        text("SELECT * FROM calendar_events WHERE id=:id AND (tenant_id = :tid OR (tenant_id IS NULL AND :tid IS NULL))"),
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
                                current_user.name or current_user.email, is_update=True)
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
        text("SELECT organizer_id FROM calendar_events WHERE id=:id AND (tenant_id = :tid OR (tenant_id IS NULL AND :tid IS NULL))"),
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
        SELECT id, name AS full_name, email, role FROM users
        WHERE (tenant_id = :tid OR (tenant_id IS NULL AND :tid IS NULL)) AND is_active=1
        ORDER BY name
    """), {"tid": current_user.tenant_id})).mappings().all()
    return [dict(r) for r in rows]
