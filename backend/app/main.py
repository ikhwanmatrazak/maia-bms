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
from app.routers import purchase_orders, delivery_orders, super_admin, products, analytics, vendors, prospects, credit_notes, tracking
from app.routers import gateway, bills

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

app_settings = get_settings()

limiter = Limiter(key_func=get_remote_address)


async def _ensure_logo_columns():
    """Widen logo/signature columns to LONGTEXT on every startup — safe to run repeatedly."""
    from app.database import engine
    from sqlalchemy import text
    try:
        async with engine.begin() as conn:
            await conn.execute(text(
                "ALTER TABLE company_settings MODIFY COLUMN logo_url LONGTEXT NULL"
            ))
            await conn.execute(text(
                "ALTER TABLE company_settings MODIFY COLUMN signature_image_url LONGTEXT NULL"
            ))
        logger.info("logo/signature columns ensured as LONGTEXT")
    except Exception as e:
        logger.warning(f"_ensure_logo_columns: {e}")


async def _ensure_crm_columns():
    """Add CRM columns and tables on every startup — safe to run repeatedly."""
    from app.database import engine
    from sqlalchemy import text
    stmts = [
        # Invoice/Quotation subject column
        "ALTER TABLE invoices ADD COLUMN IF NOT EXISTS subject VARCHAR(500) NULL",
        "ALTER TABLE quotations ADD COLUMN IF NOT EXISTS subject VARCHAR(500) NULL",
        # Billplz payment link columns
        "ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_link_id VARCHAR(100) NULL",
        "ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_link_url VARCHAR(500) NULL",
        "ALTER TABLE bills ADD COLUMN IF NOT EXISTS payment_receipt_url VARCHAR(500) NULL",
        # Line item unit column
        "ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS unit VARCHAR(50) NULL",
        "ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS unit VARCHAR(50) NULL",
        # Client segmentation columns
        "ALTER TABLE clients ADD COLUMN IF NOT EXISTS industry VARCHAR(100) NULL",
        "ALTER TABLE clients ADD COLUMN IF NOT EXISTS tags VARCHAR(500) NULL",
        "ALTER TABLE clients ADD COLUMN IF NOT EXISTS region VARCHAR(100) NULL",
        "ALTER TABLE clients ADD COLUMN IF NOT EXISTS company_size VARCHAR(50) NULL",
        # Client contacts table
        """CREATE TABLE IF NOT EXISTS client_contacts (
            id INT AUTO_INCREMENT PRIMARY KEY,
            client_id INT NOT NULL,
            tenant_id INT NULL,
            name VARCHAR(255) NOT NULL,
            role VARCHAR(100) NULL,
            email VARCHAR(255) NULL,
            phone VARCHAR(50) NULL,
            is_primary TINYINT(1) NOT NULL DEFAULT 0,
            created_at DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6),
            INDEX ix_client_contacts_client_id (client_id),
            FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
        )""",
        # Email tracking table
        """CREATE TABLE IF NOT EXISTS email_tracking (
            id INT AUTO_INCREMENT PRIMARY KEY,
            token VARCHAR(64) NOT NULL UNIQUE,
            doc_type VARCHAR(50) NOT NULL,
            doc_id INT NOT NULL,
            recipient_email VARCHAR(255) NULL,
            tenant_id INT NULL,
            sent_at DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6),
            opened_at DATETIME(6) NULL,
            open_count INT NOT NULL DEFAULT 0,
            INDEX ix_email_tracking_token (token)
        )""",
        # Bills (accounts payable) table
        """CREATE TABLE IF NOT EXISTS bills (
            id INT AUTO_INCREMENT PRIMARY KEY,
            tenant_id INT NULL,
            created_by INT NULL,
            vendor_name VARCHAR(255) NULL,
            vendor_address TEXT NULL,
            vendor_email VARCHAR(255) NULL,
            vendor_phone VARCHAR(50) NULL,
            vendor_reg_no VARCHAR(100) NULL,
            bank_name VARCHAR(255) NULL,
            bank_account_no VARCHAR(100) NULL,
            bank_account_name VARCHAR(255) NULL,
            bill_number VARCHAR(100) NULL,
            description TEXT NULL,
            issue_date DATETIME(6) NULL,
            due_date DATETIME(6) NULL,
            amount DECIMAL(15,2) NULL,
            currency VARCHAR(10) DEFAULT 'MYR',
            status ENUM('pending','paid','overdue') NOT NULL DEFAULT 'pending',
            paid_at DATETIME(6) NULL,
            payment_reference VARCHAR(255) NULL,
            payment_receipt_url VARCHAR(500) NULL,
            file_url VARCHAR(500) NULL,
            notes TEXT NULL,
            is_deleted TINYINT(1) NOT NULL DEFAULT 0,
            created_at DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6),
            updated_at DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
            INDEX ix_bills_tenant_id (tenant_id),
            INDEX ix_bills_status (status)
        )""",
    ]
    async with engine.begin() as conn:
        for stmt in stmts:
            try:
                await conn.execute(text(stmt))
            except Exception as e:
                logger.warning(f"_ensure_crm_columns stmt skipped: {e}")
    logger.info("CRM columns/tables ensured")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await _ensure_logo_columns()
    await _ensure_crm_columns()
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
app.include_router(vendors.router, prefix=prefix)
app.include_router(prospects.router, prefix=prefix)
app.include_router(credit_notes.router, prefix=prefix)
app.include_router(tracking.router, prefix=prefix)
app.include_router(gateway.router, prefix=prefix)
app.include_router(bills.router, prefix=prefix)


@app.get("/health")
async def health_check():
    return {"status": "ok", "version": "1.0.0"}
