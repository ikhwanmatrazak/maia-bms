import asyncio
import os
from sqlalchemy.ext.asyncio import create_async_engine
from dotenv import load_dotenv

load_dotenv()

async def test_conn():
    url = os.getenv("DATABASE_URL")
    print(f"Testing connection to: {url.split('@')[1] if '@' in url else 'Invalid URL'}")
    try:
        # Since we escaped %% for Alembic, we need to unescape for SQLAlchemy engine if it's used directly
        # Actually, let's see how it behaves
        engine = create_async_engine(url)
        async with engine.connect() as conn:
            print("Successfully connected to the database!")
    except Exception as e:
        print(f"Connection Failed: {e}")

if __name__ == "__main__":
    asyncio.run(test_conn())
