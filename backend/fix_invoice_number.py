"""
Fix: Check if MAIV-2026-0039 exists.
If not, rename MAIV-2026-0042 → MAIV-2026-0039.
Run inside the backend container:
  python fix_invoice_number.py
"""
import asyncio
import os
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from dotenv import load_dotenv

load_dotenv()

async def fix():
    url = os.getenv("DATABASE_URL")
    if not url:
        print("ERROR: DATABASE_URL not set")
        return

    engine = create_async_engine(url)
    async with engine.begin() as conn:
        # Check if MAIV-2026-0039 exists
        r = await conn.execute(
            text("SELECT id, invoice_number, status, total FROM invoices WHERE invoice_number = 'MAIV-2026-0039' LIMIT 1")
        )
        existing = r.fetchone()

        if existing:
            print(f"MAIV-2026-0039 already exists — id={existing[0]}, status={existing[2]}, total={existing[3]}")
            print("No changes made.")
            return

        print("MAIV-2026-0039 does NOT exist.")

        # Check if MAIV-2026-0042 exists
        r2 = await conn.execute(
            text("SELECT id, invoice_number, status, total FROM invoices WHERE invoice_number = 'MAIV-2026-0042' LIMIT 1")
        )
        inv42 = r2.fetchone()

        if not inv42:
            print("MAIV-2026-0042 also NOT found. No changes made.")
            return

        print(f"Found MAIV-2026-0042 — id={inv42[0]}, status={inv42[2]}, total={inv42[3]}")

        # Rename MAIV-2026-0042 → MAIV-2026-0039
        await conn.execute(
            text("UPDATE invoices SET invoice_number = 'MAIV-2026-0039' WHERE id = :id"),
            {"id": inv42[0]}
        )
        print(f"✓ Renamed invoice id={inv42[0]} from MAIV-2026-0042 to MAIV-2026-0039")

if __name__ == "__main__":
    asyncio.run(fix())
