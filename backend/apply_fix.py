import asyncio
import os
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from dotenv import load_dotenv

load_dotenv()

async def update():
    url = os.getenv("DATABASE_URL")
    engine = create_async_engine(url)
    async with engine.begin() as conn:
        # Correct hash for 'Admin@123' using passlib:
        new_hash = "$2b$12$nQHbk8hf3sLUoIkgy45dzebVOZ2IhUpJKvFAS0BPgalx9VgQaF/gC"
        await conn.execute(
            text("UPDATE users SET password_hash = :h WHERE email = :e"),
            {"h": new_hash, "e": "admin@maia.com.my"}
        )
        print("Successfully updated admin password hash.")

if __name__ == "__main__":
    asyncio.run(update())
