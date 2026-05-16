"""Setup script: ensure the system super admin account exists.

Run from backend/ inside the container:
    python setup_superadmin.py

Or via docker exec from the host:
    docker exec -it <backend_container_name> python setup_superadmin.py
"""
import asyncio
from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models.user import User, UserRole
from app.middleware.auth import hash_password

SUPERADMIN_EMAIL = "superadmin@system.local"
SUPERADMIN_PASSWORD = "SuperAdmin@123"
SUPERADMIN_NAME = "System Super Admin"


async def setup():
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.email == SUPERADMIN_EMAIL))
        existing = result.scalar_one_or_none()

        if existing:
            print(f"[OK] Super admin already exists: {SUPERADMIN_EMAIL}")
            print(f"     is_super_admin={existing.is_super_admin}  is_active={existing.is_active}")
            if not existing.is_super_admin:
                existing.is_super_admin = True
                await db.commit()
                print("[FIX] Promoted to super admin.")
            return

        user = User(
            name=SUPERADMIN_NAME,
            email=SUPERADMIN_EMAIL,
            password_hash=hash_password(SUPERADMIN_PASSWORD),
            role=UserRole.admin,
            is_active=True,
            is_super_admin=True,
            tenant_id=None,
        )
        db.add(user)
        await db.commit()
        print(f"[CREATED] Super admin account created.")
        print(f"  Email:    {SUPERADMIN_EMAIL}")
        print(f"  Password: {SUPERADMIN_PASSWORD}")
        print()
        print("Login at your app URL and go to /admin to manage companies.")


if __name__ == "__main__":
    asyncio.run(setup())
