"""
Run this from the backend/ folder:
    python reset_passwords.py

It resets all seed user passwords and ensures the users exist in the DB.
"""
import asyncio
import os
import sys
sys.path.insert(0, os.getcwd())

from dotenv import load_dotenv
load_dotenv()

from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy import text
from app.middleware.auth import hash_password

USERS = [
    {"name": "Admin User",    "email": "admin@maia.com.my",   "password": "Admin@123",   "role": "admin"},
    {"name": "Sarah Manager", "email": "sarah@maia.com.my",   "password": "Manager@123", "role": "manager"},
    {"name": "John Staff",    "email": "john@maia.com.my",    "password": "Staff@123",   "role": "staff"},
]

async def main():
    url = os.getenv("DATABASE_URL")
    if not url:
        print("ERROR: DATABASE_URL not set in .env")
        return

    print(f"Connecting to DB...")
    engine = create_async_engine(url, echo=False)
    Session = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)

    async with Session() as db:
        for u in USERS:
            h = hash_password(u["password"])
            # Upsert: update if exists, insert if not
            result = await db.execute(text("SELECT id FROM users WHERE email = :email"), {"email": u["email"]})
            row = result.fetchone()
            if row:
                await db.execute(
                    text("UPDATE users SET password_hash = :hash, is_active = 1 WHERE email = :email"),
                    {"hash": h, "email": u["email"]},
                )
                print(f"  Updated password for {u['email']}")
            else:
                await db.execute(
                    text("INSERT INTO users (name, email, password_hash, role, is_active) VALUES (:name, :email, :hash, :role, 1)"),
                    {"name": u["name"], "email": u["email"], "hash": h, "role": u["role"]},
                )
                print(f"  Created user {u['email']}")
        await db.commit()

    print("\nDone. You can now login with:")
    for u in USERS:
        print(f"  {u['email']}  /  {u['password']}")

    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(main())
