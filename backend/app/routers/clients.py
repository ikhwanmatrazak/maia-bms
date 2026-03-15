from fastapi import APIRouter, Depends, HTTPException, status, Query, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, update
from sqlalchemy.orm import selectinload
from typing import List, Optional
from decimal import Decimal
import os
import uuid
from datetime import datetime as dt

from app.database import get_db
from app.models.client import Client, ClientStatus
from app.models.invoice import Invoice, InvoiceStatus
from app.models.activity import Activity, ActivityType
from app.models.reminder import Reminder
from app.models.user import User, UserRole
from app.models.contact import ClientContact
from app.schemas.client import ClientCreate, ClientUpdate, ClientResponse, ClientListResponse
from app.schemas.activity import ActivityCreate, ActivityResponse
from app.schemas.reminder import ReminderCreate, ReminderResponse
from app.schemas.contact import ContactCreate, ContactUpdate, ContactResponse
from app.middleware.auth import get_current_user
from app.middleware.rbac import require_admin, require_admin_or_manager, OwnershipChecker, apply_tenant_filter, get_effective_tenant_id
from app.config import get_settings
from datetime import datetime, timezone

router = APIRouter(prefix="/clients", tags=["clients"])


@router.get("", response_model=List[ClientListResponse])
async def list_clients(
    search: Optional[str] = Query(None),
    status: Optional[ClientStatus] = Query(None),
    industry: Optional[str] = Query(None),
    tags: Optional[str] = Query(None),
    region: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = select(Client)
    query = apply_tenant_filter(query, Client, current_user)
    if search:
        query = query.where(
            Client.company_name.ilike(f"%{search}%") |
            Client.contact_person.ilike(f"%{search}%") |
            Client.email.ilike(f"%{search}%")
        )
    if status:
        query = query.where(Client.status == status)
    if industry:
        query = query.where(Client.industry.ilike(f"%{industry}%"))
    if tags:
        query = query.where(Client.tags.ilike(f"%{tags}%"))
    if region:
        query = query.where(Client.region.ilike(f"%{region}%"))
    query = query.order_by(Client.company_name).offset(skip).limit(limit)
    result = await db.execute(query)
    clients = result.scalars().all()

    # Get outstanding balances in one query
    if clients:
        client_ids = [c.id for c in clients]
        inv_query = (
            select(Invoice.client_id, func.sum(Invoice.balance_due).label("outstanding"))
            .where(Invoice.client_id.in_(client_ids))
            .where(Invoice.is_deleted != True)
            .where(Invoice.status.notin_([InvoiceStatus.paid, InvoiceStatus.cancelled]))
        )
        eff_tenant = get_effective_tenant_id(current_user)
        if eff_tenant is not None:
            inv_query = inv_query.where(Invoice.tenant_id == eff_tenant)
        bal_result = await db.execute(inv_query.group_by(Invoice.client_id))
        balances = {row.client_id: row.outstanding for row in bal_result}
    else:
        balances = {}

    responses = []
    for client in clients:
        r = ClientListResponse.model_validate(client)
        r.outstanding_balance = balances.get(client.id, Decimal("0.00")) or Decimal("0.00")
        responses.append(r)
    return responses


@router.post("", response_model=ClientResponse, status_code=status.HTTP_201_CREATED)
async def create_client(
    body: ClientCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_manager()),
):
    client = Client(**body.model_dump(), created_by=current_user.id, tenant_id=get_effective_tenant_id(current_user))
    db.add(client)
    await db.commit()
    await db.refresh(client)
    return client


@router.get("/{client_id}", response_model=ClientResponse)
async def get_client(
    client_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Client).where(Client.id == client_id))
    client = result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    eff_tenant = get_effective_tenant_id(current_user)
    if eff_tenant is not None and client.tenant_id != eff_tenant:
        raise HTTPException(status_code=403, detail="Access denied")
    return client


@router.put("/{client_id}", response_model=ClientResponse)
async def update_client(
    client_id: int,
    body: ClientUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_manager()),
):
    result = await db.execute(select(Client).where(Client.id == client_id))
    client = result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    eff_tenant = get_effective_tenant_id(current_user)
    if eff_tenant is not None and client.tenant_id != eff_tenant:
        raise HTTPException(status_code=403, detail="Access denied")
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(client, key, value)
    await db.commit()
    await db.refresh(client)
    return client


@router.delete("/{client_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_client(
    client_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin()),
):
    result = await db.execute(select(Client).where(Client.id == client_id))
    client = result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    eff_tenant = get_effective_tenant_id(current_user)
    if eff_tenant is not None and client.tenant_id != eff_tenant:
        raise HTTPException(status_code=403, detail="Access denied")
    await db.delete(client)
    await db.commit()


@router.get("/{client_id}/activities", response_model=List[ActivityResponse])
async def list_activities(
    client_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    client_result = await db.execute(select(Client).where(Client.id == client_id))
    client = client_result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    eff_tenant = get_effective_tenant_id(current_user)
    if eff_tenant is not None and client.tenant_id != eff_tenant:
        raise HTTPException(status_code=403, detail="Access denied")
    result = await db.execute(
        select(Activity)
        .options(selectinload(Activity.user))
        .where(Activity.client_id == client_id)
        .order_by(Activity.occurred_at.desc())
    )
    return result.scalars().all()


@router.post("/{client_id}/activities", response_model=ActivityResponse, status_code=status.HTTP_201_CREATED)
async def create_activity(
    client_id: int,
    body: ActivityCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Client).where(Client.id == client_id))
    client = result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    eff_tenant = get_effective_tenant_id(current_user)
    if eff_tenant is not None and client.tenant_id != eff_tenant:
        raise HTTPException(status_code=403, detail="Access denied")

    activity = Activity(
        client_id=client_id,
        user_id=current_user.id,
        type=body.type,
        description=body.description,
        occurred_at=body.occurred_at or datetime.now(timezone.utc),
    )
    db.add(activity)
    await db.commit()
    result = await db.execute(
        select(Activity).options(selectinload(Activity.user)).where(Activity.id == activity.id)
    )
    return result.scalar_one()


@router.get("/{client_id}/reminders", response_model=List[ReminderResponse])
async def list_client_reminders(
    client_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    client_result = await db.execute(select(Client).where(Client.id == client_id))
    client = client_result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    eff_tenant = get_effective_tenant_id(current_user)
    if eff_tenant is not None and client.tenant_id != eff_tenant:
        raise HTTPException(status_code=403, detail="Access denied")
    result = await db.execute(
        select(Reminder)
        .where(Reminder.client_id == client_id)
        .order_by(Reminder.due_date)
    )
    return result.scalars().all()


@router.post("/{client_id}/reminders", response_model=ReminderResponse, status_code=status.HTTP_201_CREATED)
async def create_client_reminder(
    client_id: int,
    body: ReminderCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Client).where(Client.id == client_id))
    client = result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    eff_tenant = get_effective_tenant_id(current_user)
    if eff_tenant is not None and client.tenant_id != eff_tenant:
        raise HTTPException(status_code=403, detail="Access denied")

    reminder = Reminder(
        client_id=client_id,
        user_id=current_user.id,
        title=body.title,
        description=body.description,
        due_date=body.due_date,
        priority=body.priority,
    )
    db.add(reminder)
    await db.commit()
    await db.refresh(reminder)
    return reminder


# --- Client Contacts ---

@router.get("/{client_id}/contacts", response_model=List[ContactResponse])
async def list_contacts(
    client_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ClientContact)
        .where(ClientContact.client_id == client_id)
        .order_by(ClientContact.is_primary.desc(), ClientContact.created_at)
    )
    return result.scalars().all()


@router.post("/{client_id}/contacts", response_model=ContactResponse, status_code=201)
async def create_contact(
    client_id: int,
    body: ContactCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    eff_tenant = get_effective_tenant_id(current_user)
    if body.is_primary:
        await db.execute(
            update(ClientContact).where(ClientContact.client_id == client_id).values(is_primary=False)
        )
    contact = ClientContact(**body.model_dump(), client_id=client_id, tenant_id=eff_tenant)
    db.add(contact)
    await db.commit()
    await db.refresh(contact)
    return contact


@router.put("/{client_id}/contacts/{contact_id}", response_model=ContactResponse)
async def update_contact(
    client_id: int,
    contact_id: int,
    body: ContactUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ClientContact).where(ClientContact.id == contact_id, ClientContact.client_id == client_id)
    )
    contact = result.scalar_one_or_none()
    if not contact:
        raise HTTPException(404, "Contact not found")
    if body.is_primary:
        await db.execute(
            update(ClientContact).where(ClientContact.client_id == client_id).values(is_primary=False)
        )
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(contact, k, v)
    await db.commit()
    await db.refresh(contact)
    return contact


@router.delete("/{client_id}/contacts/{contact_id}", status_code=204)
async def delete_contact(
    client_id: int,
    contact_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ClientContact).where(ClientContact.id == contact_id, ClientContact.client_id == client_id)
    )
    contact = result.scalar_one_or_none()
    if not contact:
        raise HTTPException(404, "Contact not found")
    await db.delete(contact)
    await db.commit()


# --- Client Documents ---

def _doc_dir(client_id: int) -> str:
    settings = get_settings()
    path = os.path.join(settings.upload_dir, "client_documents", str(client_id))
    os.makedirs(path, exist_ok=True)
    return path


@router.get("/{client_id}/documents")
async def list_client_documents(
    client_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Client).where(Client.id == client_id))
    client = result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    eff_tenant = get_effective_tenant_id(current_user)
    if eff_tenant is not None and client.tenant_id != eff_tenant:
        raise HTTPException(status_code=403, detail="Access denied")
    doc_dir = _doc_dir(client_id)
    docs = []
    if os.path.isdir(doc_dir):
        for fname in sorted(os.listdir(doc_dir)):
            fpath = os.path.join(doc_dir, fname)
            stat = os.stat(fpath)
            # fname format: {uuid}_{original_name}
            original_name = "_".join(fname.split("_")[1:]) if "_" in fname else fname
            docs.append({
                "filename": fname,
                "original_name": original_name,
                "size": stat.st_size,
                "uploaded_at": dt.fromtimestamp(stat.st_mtime).isoformat(),
                "url": f"/uploads/client_documents/{client_id}/{fname}",
            })
    return docs


@router.post("/{client_id}/documents")
async def upload_client_document(
    client_id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Client).where(Client.id == client_id))
    client = result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    eff_tenant = get_effective_tenant_id(current_user)
    if eff_tenant is not None and client.tenant_id != eff_tenant:
        raise HTTPException(status_code=403, detail="Access denied")
    doc_dir = _doc_dir(client_id)
    safe_name = os.path.basename(file.filename or "file")
    filename = f"{uuid.uuid4().hex}_{safe_name}"
    file_path = os.path.join(doc_dir, filename)
    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)
    return {
        "filename": filename,
        "original_name": safe_name,
        "size": len(content),
        "url": f"/uploads/client_documents/{client_id}/{filename}",
    }


@router.delete("/{client_id}/documents/{filename}", status_code=204)
async def delete_client_document(
    client_id: int,
    filename: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Client).where(Client.id == client_id))
    client = result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    eff_tenant = get_effective_tenant_id(current_user)
    if eff_tenant is not None and client.tenant_id != eff_tenant:
        raise HTTPException(status_code=403, detail="Access denied")
    doc_dir = _doc_dir(client_id)
    file_path = os.path.join(doc_dir, os.path.basename(filename))
    if not os.path.isfile(file_path):
        raise HTTPException(status_code=404, detail="Document not found")
    os.remove(file_path)
