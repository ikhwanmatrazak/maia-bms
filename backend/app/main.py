import asyncio
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
from app.routers import gateway, bills, hr, user_claims, projects

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
    stmts = [
        "ALTER TABLE company_settings MODIFY COLUMN logo_url LONGTEXT NULL",
        "ALTER TABLE company_settings MODIFY COLUMN signature_image_url LONGTEXT NULL",
        "ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS tin_no VARCHAR(50) NULL",
        "ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS sst_no VARCHAR(50) NULL",
    ]
    for stmt in stmts:
        try:
            async with engine.begin() as conn:
                await conn.execute(text(stmt))
        except Exception as e:
            logger.warning(f"_ensure_logo_columns: {e}")
    logger.info("logo/signature/tin columns ensured")


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


async def _ensure_hr_tables():
    """Create HR tables on every startup — safe to run repeatedly."""
    from app.database import engine
    from sqlalchemy import text
    stmts = [
        """CREATE TABLE IF NOT EXISTS hr_departments (
            id INT AUTO_INCREMENT PRIMARY KEY,
            tenant_id INT NULL,
            name VARCHAR(100) NOT NULL,
            description TEXT NULL,
            is_active TINYINT(1) NOT NULL DEFAULT 1,
            created_at DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6),
            INDEX ix_hr_departments_tenant_id (tenant_id)
        )""",
        """CREATE TABLE IF NOT EXISTS hr_employees (
            id INT AUTO_INCREMENT PRIMARY KEY,
            tenant_id INT NULL,
            user_id INT NULL,
            department_id INT NULL,
            employee_no VARCHAR(50) NOT NULL,
            full_name VARCHAR(255) NOT NULL,
            ic_no VARCHAR(20) NULL,
            passport_no VARCHAR(30) NULL,
            date_of_birth DATE NULL,
            gender VARCHAR(10) NULL,
            nationality VARCHAR(50) NULL DEFAULT 'Malaysian',
            religion VARCHAR(50) NULL,
            marital_status VARCHAR(20) NULL,
            phone VARCHAR(20) NULL,
            email VARCHAR(255) NULL,
            address TEXT NULL,
            emergency_contact_name VARCHAR(255) NULL,
            emergency_contact_phone VARCHAR(20) NULL,
            emergency_contact_relation VARCHAR(50) NULL,
            designation VARCHAR(100) NULL,
            employment_type ENUM('full_time','part_time','contract','intern') NOT NULL DEFAULT 'full_time',
            employment_status ENUM('active','probation','resigned','terminated') NOT NULL DEFAULT 'probation',
            join_date DATE NULL,
            confirmation_date DATE NULL,
            resignation_date DATE NULL,
            basic_salary DECIMAL(12,2) NULL DEFAULT 0,
            bank_name VARCHAR(100) NULL,
            bank_account_no VARCHAR(50) NULL,
            epf_no VARCHAR(30) NULL,
            socso_no VARCHAR(30) NULL,
            income_tax_no VARCHAR(30) NULL,
            children_count INT NULL DEFAULT 0,
            spouse_working TINYINT(1) NULL DEFAULT 0,
            photo_url VARCHAR(500) NULL,
            created_by INT NULL,
            created_at DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6),
            updated_at DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
            INDEX ix_hr_employees_tenant_id (tenant_id)
        )""",
        """CREATE TABLE IF NOT EXISTS hr_employee_documents (
            id INT AUTO_INCREMENT PRIMARY KEY,
            employee_id INT NOT NULL,
            name VARCHAR(255) NOT NULL,
            file_url VARCHAR(500) NOT NULL,
            created_at DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6),
            FOREIGN KEY (employee_id) REFERENCES hr_employees(id) ON DELETE CASCADE
        )""",
        """CREATE TABLE IF NOT EXISTS hr_leave_types (
            id INT AUTO_INCREMENT PRIMARY KEY,
            tenant_id INT NULL,
            name VARCHAR(100) NOT NULL,
            days_per_year INT NOT NULL DEFAULT 0,
            is_paid TINYINT(1) NOT NULL DEFAULT 1,
            requires_document TINYINT(1) NOT NULL DEFAULT 0,
            is_active TINYINT(1) NOT NULL DEFAULT 1,
            INDEX ix_hr_leave_types_tenant_id (tenant_id)
        )""",
        """CREATE TABLE IF NOT EXISTS hr_leave_balances (
            id INT AUTO_INCREMENT PRIMARY KEY,
            tenant_id INT NULL,
            employee_id INT NOT NULL,
            leave_type_id INT NOT NULL,
            year INT NOT NULL,
            entitled DECIMAL(5,1) NOT NULL DEFAULT 0,
            taken DECIMAL(5,1) NOT NULL DEFAULT 0,
            FOREIGN KEY (employee_id) REFERENCES hr_employees(id) ON DELETE CASCADE,
            FOREIGN KEY (leave_type_id) REFERENCES hr_leave_types(id) ON DELETE CASCADE
        )""",
        """CREATE TABLE IF NOT EXISTS hr_leave_applications (
            id INT AUTO_INCREMENT PRIMARY KEY,
            tenant_id INT NULL,
            employee_id INT NOT NULL,
            leave_type_id INT NULL,
            start_date DATE NOT NULL,
            end_date DATE NOT NULL,
            days DECIMAL(5,1) NOT NULL,
            reason TEXT NULL,
            document_url VARCHAR(500) NULL,
            status ENUM('pending','approved','rejected','cancelled') NOT NULL DEFAULT 'pending',
            approved_by INT NULL,
            approved_at DATETIME(6) NULL,
            rejection_reason TEXT NULL,
            applied_by INT NULL,
            created_at DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6),
            updated_at DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
            INDEX ix_hr_leave_applications_tenant_id (tenant_id),
            FOREIGN KEY (employee_id) REFERENCES hr_employees(id) ON DELETE CASCADE
        )""",
        """CREATE TABLE IF NOT EXISTS hr_attendance (
            id INT AUTO_INCREMENT PRIMARY KEY,
            tenant_id INT NULL,
            employee_id INT NOT NULL,
            date DATE NOT NULL,
            check_in DATETIME(6) NULL,
            check_out DATETIME(6) NULL,
            work_hours DECIMAL(5,2) NULL,
            overtime_hours DECIMAL(5,2) NULL DEFAULT 0,
            status ENUM('present','absent','half_day','late','public_holiday','leave') NOT NULL DEFAULT 'present',
            notes TEXT NULL,
            created_at DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6),
            INDEX ix_hr_attendance_tenant_id (tenant_id),
            FOREIGN KEY (employee_id) REFERENCES hr_employees(id) ON DELETE CASCADE
        )""",
        """CREATE TABLE IF NOT EXISTS hr_public_holidays (
            id INT AUTO_INCREMENT PRIMARY KEY,
            tenant_id INT NULL,
            name VARCHAR(255) NOT NULL,
            date DATE NOT NULL,
            year INT NOT NULL,
            INDEX ix_hr_public_holidays_tenant_id (tenant_id)
        )""",
        """CREATE TABLE IF NOT EXISTS hr_salary_structures (
            id INT AUTO_INCREMENT PRIMARY KEY,
            tenant_id INT NULL,
            employee_id INT NOT NULL,
            basic_salary DECIMAL(12,2) NOT NULL DEFAULT 0,
            transport_allowance DECIMAL(12,2) NULL DEFAULT 0,
            housing_allowance DECIMAL(12,2) NULL DEFAULT 0,
            phone_allowance DECIMAL(12,2) NULL DEFAULT 0,
            other_allowance DECIMAL(12,2) NULL DEFAULT 0,
            other_allowance_name VARCHAR(100) NULL,
            effective_from DATE NOT NULL,
            created_at DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6),
            FOREIGN KEY (employee_id) REFERENCES hr_employees(id) ON DELETE CASCADE
        )""",
        """CREATE TABLE IF NOT EXISTS hr_payroll_runs (
            id INT AUTO_INCREMENT PRIMARY KEY,
            tenant_id INT NULL,
            month INT NOT NULL,
            year INT NOT NULL,
            status ENUM('draft','finalized') NOT NULL DEFAULT 'draft',
            total_gross DECIMAL(15,2) NULL DEFAULT 0,
            total_net DECIMAL(15,2) NULL DEFAULT 0,
            total_employee_count INT NULL DEFAULT 0,
            notes TEXT NULL,
            finalized_by INT NULL,
            finalized_at DATETIME(6) NULL,
            created_by INT NULL,
            created_at DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6),
            INDEX ix_hr_payroll_runs_tenant_id (tenant_id)
        )""",
        """CREATE TABLE IF NOT EXISTS hr_payslip_lines (
            id INT AUTO_INCREMENT PRIMARY KEY,
            tenant_id INT NULL,
            payroll_run_id INT NOT NULL,
            employee_id INT NOT NULL,
            basic_salary DECIMAL(12,2) NOT NULL DEFAULT 0,
            transport_allowance DECIMAL(12,2) NULL DEFAULT 0,
            housing_allowance DECIMAL(12,2) NULL DEFAULT 0,
            phone_allowance DECIMAL(12,2) NULL DEFAULT 0,
            other_allowance DECIMAL(12,2) NULL DEFAULT 0,
            overtime_pay DECIMAL(12,2) NULL DEFAULT 0,
            claims_reimbursement DECIMAL(12,2) NULL DEFAULT 0,
            gross_pay DECIMAL(12,2) NOT NULL DEFAULT 0,
            epf_employee DECIMAL(10,2) NULL DEFAULT 0,
            epf_employer DECIMAL(10,2) NULL DEFAULT 0,
            socso_employee DECIMAL(10,2) NULL DEFAULT 0,
            socso_employer DECIMAL(10,2) NULL DEFAULT 0,
            eis_employee DECIMAL(10,2) NULL DEFAULT 0,
            eis_employer DECIMAL(10,2) NULL DEFAULT 0,
            pcb DECIMAL(10,2) NULL DEFAULT 0,
            other_deduction DECIMAL(10,2) NULL DEFAULT 0,
            net_pay DECIMAL(12,2) NOT NULL DEFAULT 0,
            working_days INT NULL,
            present_days INT NULL,
            absent_days INT NULL,
            leave_days INT NULL,
            created_at DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6),
            FOREIGN KEY (payroll_run_id) REFERENCES hr_payroll_runs(id) ON DELETE CASCADE,
            FOREIGN KEY (employee_id) REFERENCES hr_employees(id) ON DELETE CASCADE
        )""",
        """CREATE TABLE IF NOT EXISTS hr_claims (
            id INT AUTO_INCREMENT PRIMARY KEY,
            tenant_id INT NULL,
            employee_id INT NOT NULL,
            claim_type VARCHAR(100) NOT NULL,
            description TEXT NOT NULL,
            amount DECIMAL(12,2) NOT NULL,
            claim_date DATE NOT NULL,
            receipt_url VARCHAR(500) NULL,
            status ENUM('pending','approved','rejected','paid') NOT NULL DEFAULT 'pending',
            approved_by INT NULL,
            approved_at DATETIME(6) NULL,
            rejection_reason TEXT NULL,
            payroll_run_id INT NULL,
            applied_by INT NULL,
            created_at DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6),
            updated_at DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
            INDEX ix_hr_claims_tenant_id (tenant_id),
            FOREIGN KEY (employee_id) REFERENCES hr_employees(id) ON DELETE CASCADE
        )""",
        """CREATE TABLE IF NOT EXISTS hr_performance_reviews (
            id INT AUTO_INCREMENT PRIMARY KEY,
            tenant_id INT NULL,
            employee_id INT NOT NULL,
            review_period VARCHAR(20) NOT NULL,
            review_date DATE NOT NULL,
            rating ENUM('excellent','good','satisfactory','needs_improvement','poor') NULL,
            kpi_score DECIMAL(5,2) NULL,
            self_review TEXT NULL,
            manager_review TEXT NULL,
            goals_next_period TEXT NULL,
            reviewed_by INT NULL,
            created_at DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6),
            updated_at DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
            INDEX ix_hr_performance_reviews_tenant_id (tenant_id),
            FOREIGN KEY (employee_id) REFERENCES hr_employees(id) ON DELETE CASCADE
        )""",
    ]
    async with engine.begin() as conn:
        for stmt in stmts:
            try:
                await conn.execute(text(stmt))
            except Exception as e:
                logger.warning(f"_ensure_hr_tables stmt skipped: {e}")
    logger.info("HR tables ensured")


async def _ensure_project_tables():
    from app.database import engine
    from sqlalchemy import text
    stmts = [
        """CREATE TABLE IF NOT EXISTS project_stages (
            id INT AUTO_INCREMENT PRIMARY KEY,
            tenant_id INT NULL,
            name VARCHAR(100) NOT NULL,
            color VARCHAR(20) NOT NULL DEFAULT '#6366f1',
            order_index INT NOT NULL DEFAULT 0,
            INDEX ix_project_stages_tenant_id (tenant_id)
        )""",
        """CREATE TABLE IF NOT EXISTS projects (
            id INT AUTO_INCREMENT PRIMARY KEY,
            tenant_id INT NULL,
            stage_id INT NULL,
            name VARCHAR(255) NOT NULL,
            description TEXT NULL,
            priority ENUM('low','medium','high','critical') NOT NULL DEFAULT 'medium',
            start_date DATE NULL,
            end_date DATE NULL,
            budget DECIMAL(15,2) NULL,
            created_by INT NULL,
            created_at DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6),
            updated_at DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
            INDEX ix_projects_tenant_id (tenant_id),
            FOREIGN KEY (stage_id) REFERENCES project_stages(id) ON DELETE SET NULL
        )""",
        """CREATE TABLE IF NOT EXISTS project_members (
            id INT AUTO_INCREMENT PRIMARY KEY,
            project_id INT NOT NULL,
            user_id INT NOT NULL,
            role VARCHAR(50) NOT NULL DEFAULT 'member',
            UNIQUE KEY uq_project_member (project_id, user_id),
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        )""",
        """CREATE TABLE IF NOT EXISTS project_tasks (
            id INT AUTO_INCREMENT PRIMARY KEY,
            project_id INT NOT NULL,
            title VARCHAR(255) NOT NULL,
            description TEXT NULL,
            assignee_id INT NULL,
            status ENUM('todo','in_progress','review','done') NOT NULL DEFAULT 'todo',
            priority ENUM('low','medium','high','critical') NOT NULL DEFAULT 'medium',
            start_date DATE NULL,
            due_date DATE NULL,
            estimated_hours DECIMAL(6,2) NULL,
            created_at DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6),
            INDEX ix_project_tasks_project_id (project_id),
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        )""",
        """CREATE TABLE IF NOT EXISTS project_time_logs (
            id INT AUTO_INCREMENT PRIMARY KEY,
            task_id INT NOT NULL,
            user_id INT NOT NULL,
            hours DECIMAL(6,2) NOT NULL,
            note TEXT NULL,
            logged_date DATE NOT NULL,
            created_at DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6),
            FOREIGN KEY (task_id) REFERENCES project_tasks(id) ON DELETE CASCADE
        )""",
        """CREATE TABLE IF NOT EXISTS project_milestones (
            id INT AUTO_INCREMENT PRIMARY KEY,
            project_id INT NOT NULL,
            title VARCHAR(255) NOT NULL,
            due_date DATE NULL,
            is_reached TINYINT(1) NOT NULL DEFAULT 0,
            created_at DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6),
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        )""",
        """CREATE TABLE IF NOT EXISTS project_updates (
            id INT AUTO_INCREMENT PRIMARY KEY,
            project_id INT NOT NULL,
            user_id INT NOT NULL,
            content TEXT NOT NULL,
            file_url VARCHAR(500) NULL,
            created_at DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6),
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        )""",
        """CREATE TABLE IF NOT EXISTS project_meetings (
            id INT AUTO_INCREMENT PRIMARY KEY,
            project_id INT NULL,
            title VARCHAR(255) NOT NULL,
            scheduled_at DATETIME(6) NOT NULL,
            duration_min INT NOT NULL DEFAULT 60,
            location VARCHAR(255) NULL,
            agenda TEXT NULL,
            notes TEXT NULL,
            reminder_24h_sent TINYINT(1) NOT NULL DEFAULT 0,
            reminder_1h_sent TINYINT(1) NOT NULL DEFAULT 0,
            created_by INT NOT NULL,
            created_at DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6),
            INDEX ix_project_meetings_project_id (project_id)
        )""",
        """CREATE TABLE IF NOT EXISTS project_meeting_attendees (
            id INT AUTO_INCREMENT PRIMARY KEY,
            meeting_id INT NOT NULL,
            user_id INT NOT NULL,
            UNIQUE KEY uq_meeting_attendee (meeting_id, user_id),
            FOREIGN KEY (meeting_id) REFERENCES project_meetings(id) ON DELETE CASCADE
        )""",
    ]
    async with engine.begin() as conn:
        for stmt in stmts:
            try:
                await conn.execute(text(stmt))
            except Exception as e:
                logger.warning(f"_ensure_project_tables stmt skipped: {e}")
    logger.info("Project tables ensured")


async def _ensure_default_stages(tenant_id):
    """Seed default stages for a new tenant if none exist."""
    from app.database import engine
    from sqlalchemy import text
    from app.routers.projects import DEFAULT_STAGES
    async with engine.begin() as conn:
        r = await conn.execute(text("SELECT COUNT(*) AS c FROM project_stages WHERE tenant_id=:tid"), {"tid": tenant_id})
        if r.fetchone().c == 0:
            for s in DEFAULT_STAGES:
                await conn.execute(text(
                    "INSERT INTO project_stages (tenant_id,name,color,order_index) VALUES (:tid,:name,:color,:oi)"
                ), {"tid": tenant_id, "name": s["name"], "color": s["color"], "oi": s["order_index"]})


async def _ensure_user_claims_table():
    from app.database import engine
    from sqlalchemy import text
    stmt = """CREATE TABLE IF NOT EXISTS user_claims (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        tenant_id INT NULL,
        title VARCHAR(255) NOT NULL,
        claim_type VARCHAR(100) NOT NULL,
        description TEXT NOT NULL,
        amount DECIMAL(12,2) NOT NULL,
        claim_date DATE NOT NULL,
        receipt_url VARCHAR(500) NULL,
        status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
        rejection_reason TEXT NULL,
        approved_by INT NULL,
        approved_at DATETIME NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX ix_user_claims_user_id (user_id),
        INDEX ix_user_claims_tenant_id (tenant_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )"""
    async with engine.begin() as conn:
        try:
            await conn.execute(text(stmt))
        except Exception as e:
            logger.warning(f"_ensure_user_claims_table skipped: {e}")
    logger.info("user_claims table ensured")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await _ensure_logo_columns()
    await _ensure_crm_columns()
    await _ensure_hr_tables()
    await _ensure_user_claims_table()
    await _ensure_project_tables()
    await init_db()
    upload_dir = app_settings.upload_dir
    os.makedirs(f"{upload_dir}/payment_proofs", exist_ok=True)
    os.makedirs(f"{upload_dir}/logos", exist_ok=True)
    os.makedirs(f"{upload_dir}/signatures", exist_ok=True)
    os.makedirs(f"{upload_dir}/expense_receipts", exist_ok=True)
    os.makedirs(f"{upload_dir}/hr/photos", exist_ok=True)
    os.makedirs(f"{upload_dir}/hr/docs", exist_ok=True)
    os.makedirs(f"{upload_dir}/hr/leave_docs", exist_ok=True)
    os.makedirs(f"{upload_dir}/hr/claims", exist_ok=True)
    os.makedirs(f"{upload_dir}/project_updates", exist_ok=True)
    # Start meeting reminder background task
    reminder_task = asyncio.create_task(projects.reminder_loop())
    logger.info("MAIA BMS started successfully")
    yield
    reminder_task.cancel()
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
app.include_router(hr.router, prefix=prefix)
app.include_router(user_claims.router, prefix=prefix)
app.include_router(projects.router, prefix=prefix)


@app.get("/health")
async def health_check():
    return {"status": "ok", "version": "1.0.0"}
