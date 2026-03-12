"""Fix script: demote admin@maia.com.my from super_admin to MAIA tenant admin.
Creates a new dedicated super admin account for system management.

Run from backend/ directory:
    python fix_admin_tenant.py
"""
import asyncio
from sqlalchemy import select, update, text

from app.database import AsyncSessionLocal
from app.models.user import User, UserRole
from app.models.tenant import Tenant
from app.models.settings import CompanySettings
from app.middleware.auth import hash_password


MAIA_ADMIN_EMAIL = "admin@maia.com.my"
NEW_SUPERADMIN_EMAIL = "superadmin@system.local"
NEW_SUPERADMIN_PASSWORD = "SuperAdmin@123"
NEW_SUPERADMIN_NAME = "System Super Admin"


async def fix():
    async with AsyncSessionLocal() as db:
        # --- Show current tenants ---
        tenants_result = await db.execute(select(Tenant).order_by(Tenant.id))
        tenants = tenants_result.scalars().all()
        print("\n=== Existing tenants ===")
        for t in tenants:
            settings_result = await db.execute(
                select(CompanySettings).where(CompanySettings.tenant_id == t.id).limit(1)
            )
            cs = settings_result.scalar_one_or_none()
            print(f"  id={t.id}  name={t.name!r}  slug={t.slug!r}  company_settings={cs.name if cs else 'none'!r}")

        # --- Find MAIA tenant ---
        maia_tenant = None
        for t in tenants:
            settings_result = await db.execute(
                select(CompanySettings).where(CompanySettings.tenant_id == t.id).limit(1)
            )
            cs = settings_result.scalar_one_or_none()
            company_name = (cs.name or "").upper() if cs else ""
            tenant_name = t.name.upper()
            if "MAIA" in company_name or "MAIA" in tenant_name:
                maia_tenant = t
                break

        if not maia_tenant:
            # Fall back to tenant with the lowest id (original Default Company)
            maia_tenant = tenants[0] if tenants else None

        if not maia_tenant:
            print("\nERROR: No tenants found. Cannot proceed.")
            return

        print(f"\n=== Will use tenant id={maia_tenant.id} ({maia_tenant.name!r}) as MAIA tenant ===")

        # --- Show current admin@maia.com.my status ---
        user_result = await db.execute(select(User).where(User.email == MAIA_ADMIN_EMAIL))
        maia_admin = user_result.scalar_one_or_none()

        if not maia_admin:
            print(f"\nERROR: User {MAIA_ADMIN_EMAIL} not found.")
            return

        print(f"\n=== Current status of {MAIA_ADMIN_EMAIL} ===")
        print(f"  id={maia_admin.id}  is_super_admin={maia_admin.is_super_admin}  tenant_id={maia_admin.tenant_id}")

        # --- Fix admin@maia.com.my: demote to regular MAIA admin ---
        maia_admin.is_super_admin = False
        maia_admin.tenant_id = maia_tenant.id
        print(f"\n[FIX] Setting {MAIA_ADMIN_EMAIL}: is_super_admin=False, tenant_id={maia_tenant.id}")

        # --- Migrate any NULL-tenant data created by this user ---
        tables = [
            ("clients", "created_by"),
            ("quotations", "created_by"),
            ("invoices", "created_by"),
            ("receipts", "created_by"),
            ("expenses", "created_by"),
            ("reminders", "user_id"),
            ("purchase_orders", "created_by"),
            ("delivery_orders", "created_by"),
        ]
        for table, user_col in tables:
            result = await db.execute(text(
                f"UPDATE {table} SET tenant_id = :tid "
                f"WHERE tenant_id IS NULL AND {user_col} = :uid"
            ), {"tid": maia_tenant.id, "uid": maia_admin.id})
            if result.rowcount > 0:
                print(f"[FIX] Assigned {result.rowcount} null-tenant {table} to MAIA tenant")

        # --- Create new super admin (if not already exists) ---
        existing_sa = await db.execute(select(User).where(User.email == NEW_SUPERADMIN_EMAIL))
        if existing_sa.scalar_one_or_none():
            print(f"\n[SKIP] Super admin {NEW_SUPERADMIN_EMAIL} already exists.")
        else:
            new_sa = User(
                name=NEW_SUPERADMIN_NAME,
                email=NEW_SUPERADMIN_EMAIL,
                password_hash=hash_password(NEW_SUPERADMIN_PASSWORD),
                role=UserRole.admin,
                is_active=True,
                is_super_admin=True,
                tenant_id=None,
            )
            db.add(new_sa)
            print(f"\n[CREATE] New super admin: {NEW_SUPERADMIN_EMAIL} / {NEW_SUPERADMIN_PASSWORD}")

        await db.commit()
        print("\n=== Done! ===")
        print(f"  {MAIA_ADMIN_EMAIL} is now a regular MAIA admin (tenant_id={maia_tenant.id})")
        print(f"  New super admin: {NEW_SUPERADMIN_EMAIL} / {NEW_SUPERADMIN_PASSWORD}")
        print("\nPlease log out and log back in with admin@maia.com.my — you will now only see MAIA data.")


if __name__ == "__main__":
    asyncio.run(fix())
