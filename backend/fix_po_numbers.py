"""One-time fix: rename PO numbers as requested.
Usage (from inside backend container):
    python fix_po_numbers.py
"""
import asyncio
from sqlalchemy import text
from app.database import AsyncSessionLocal


async def fix():
    async with AsyncSessionLocal() as db:
        updates = [
            ("PO-2026-0003", "PO-2026-0006"),
            ("PO-2026-0004", "PO-2026-0007"),
        ]
        for new_num, old_num in updates:
            result = await db.execute(
                text("UPDATE purchase_orders SET po_number = :new WHERE po_number = :old"),
                {"new": new_num, "old": old_num},
            )
            print(f"  {old_num} -> {new_num}: {result.rowcount} row(s) updated")
        await db.commit()
        print("Done.")


asyncio.run(fix())
