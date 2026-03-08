import logging
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from app.config import get_settings
from app.database import init_db
from app.routers import auth, users, clients, quotations, invoices, receipts, payments, expenses, reminders, reports, settings, documents
from app.routers import purchase_orders, delivery_orders, super_admin, products, analytics

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

app_settings = get_settings()

limiter = Limiter(key_func=get_remote_address)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    upload_dir = app_settings.upload_dir
    os.makedirs(f"{upload_dir}/payment_proofs", exist_ok=True)
    os.makedirs(f"{upload_dir}/logos", exist_ok=True)
    os.makedirs(f"{upload_dir}/signatures", exist_ok=True)
    os.makedirs(f"{upload_dir}/expense_receipts", exist_ok=True)
    logger.info("MAIA BMS started successfully")
    yield
    logger.info("MAIA BMS shutting down")


app = FastAPI(
    title="MAIA BMS API",
    description="Business Management System API",
    version="1.0.0",
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS
origins = [app_settings.frontend_url]
if app_settings.environment == "development":
    origins.extend(["http://localhost:3000", "http://127.0.0.1:3000"])

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static files for uploads
upload_dir = app_settings.upload_dir
os.makedirs(upload_dir, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=upload_dir), name="uploads")

# Routers
prefix = "/api/v1"
app.include_router(auth.router, prefix=prefix)
app.include_router(users.router, prefix=prefix)
app.include_router(clients.router, prefix=prefix)
app.include_router(quotations.router, prefix=prefix)
app.include_router(invoices.router, prefix=prefix)
app.include_router(receipts.router, prefix=prefix)
app.include_router(payments.router, prefix=prefix)
app.include_router(expenses.router, prefix=prefix)
app.include_router(reminders.router, prefix=prefix)
app.include_router(reports.router, prefix=prefix)
app.include_router(settings.router, prefix=prefix)
app.include_router(documents.router, prefix=prefix)
app.include_router(purchase_orders.router, prefix=prefix)
app.include_router(delivery_orders.router, prefix=prefix)
app.include_router(super_admin.router, prefix=prefix)
app.include_router(products.router, prefix=prefix)
app.include_router(analytics.router, prefix=prefix)


@app.get("/health")
async def health_check():
    return {"status": "ok", "version": "1.0.0"}
