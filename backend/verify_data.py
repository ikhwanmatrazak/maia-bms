import asyncio
import os
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy import select
from dotenv import load_dotenv

load_dotenv()

async def check_users():
    url = os.getenv("DATABASE_URL")
    print(f"Connecting to: {url.split('@')[1] if url and '@' in url else 'Invalid URL'}")
    try:
        engine = create_async_engine(url)
        AsyncSessionLocal = async_sessionmaker(bind=engine, class_=AsyncSession)
        
        async with AsyncSessionLocal() as session:
            from sqlalchemy import text
            result = await session.execute(text("SELECT id, name, email, role, password_hash FROM users"))
            users = result.all()
            if not users:
                print("No users found in the database.")
            for user in users:
                print(f"User: {user.name} ({user.email}) - Role: {user.role}")
                print(f"Hash: {user.password_hash}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(check_users())
