"""Seed script — creates sample data for testing.
Usage: python seed.py (run from backend/ directory with venv activated)
"""
import asyncio
from datetime import datetime, timezone, timedelta
from decimal import Decimal

from app.database import AsyncSessionLocal, engine
from app.models import *  # noqa: F401 — registers all models
from app.middleware.auth import hash_password


async def seed():
    async with AsyncSessionLocal() as db:
        from app.models.user import User, UserRole
        from app.models.settings import CompanySettings, TaxRate, DocumentTemplate, TemplateType
        from app.models.client import Client
        from app.models.quotation import Quotation, QuotationItem, QuotationStatus
        from app.models.invoice import Invoice, InvoiceItem, InvoiceStatus
        from app.models.receipt import Receipt, PaymentMethod
        from app.models.payment import Payment
        from app.models.expense import Expense, ExpenseCategory
        from app.models.activity import Activity, ActivityType
        from app.models.reminder import Reminder, ReminderPriority
        from sqlalchemy import select

        # Check if already seeded
        result = await db.execute(select(User).limit(1))
        if result.scalar_one_or_none():
            print("Database already has data. Skipping seed.")
            return

        print("Seeding database...")

        # Company Settings
        company = CompanySettings(
            name="MAIA Consulting Sdn Bhd",
            address="Level 12, Menara MAIA, Jalan Ampang, 50450 Kuala Lumpur",
            phone="+60 3-1234 5678",
            email="info@maia.com.my",
            website="https://maia.com.my",
            default_currency="MYR",
            default_payment_terms=30,
            invoice_prefix="INV",
            quotation_prefix="QT",
            receipt_prefix="RCP",
            primary_color="#1a1a2e",
            accent_color="#16213e",
        )
        db.add(company)

        # Tax Rates
        tax_6 = TaxRate(name="SST 6%", rate=Decimal("6.00"), is_default=True, is_active=True)
        tax_0 = TaxRate(name="Exempt", rate=Decimal("0.00"), is_default=False, is_active=True)
        tax_8 = TaxRate(name="SST 8%", rate=Decimal("8.00"), is_default=False, is_active=True)
        db.add_all([tax_6, tax_0, tax_8])

        # Document Templates
        for t_type in [TemplateType.quotation, TemplateType.invoice, TemplateType.receipt]:
            for name in ["Professional", "Minimal"]:
                db.add(DocumentTemplate(name=name, type=t_type, is_default=(name == "Professional")))

        # Users
        admin = User(
            name="Admin User",
            email="admin@maia.com.my",
            password_hash=hash_password("Admin@123"),
            role=UserRole.admin,
            is_active=True,
        )
        manager = User(
            name="Sarah Manager",
            email="sarah@maia.com.my",
            password_hash=hash_password("Manager@123"),
            role=UserRole.manager,
            is_active=True,
        )
        staff = User(
            name="John Staff",
            email="john@maia.com.my",
            password_hash=hash_password("Staff@123"),
            role=UserRole.staff,
            is_active=True,
        )
        db.add_all([admin, manager, staff])
        await db.flush()

        # Clients
        client1 = Client(
            company_name="Tech Solutions Sdn Bhd",
            contact_person="Ahmad Rahman",
            email="ahmad@techsolutions.com.my",
            phone="+60 12-345 6789",
            address="Petaling Jaya, Selangor",
            city="Petaling Jaya",
            country="Malaysia",
            currency="MYR",
            created_by=admin.id,
        )
        client2 = Client(
            company_name="Global Exports Ltd",
            contact_person="Jennifer Wong",
            email="jennifer@globalexports.com",
            phone="+65 9123 4567",
            address="Singapore",
            city="Singapore",
            country="Singapore",
            currency="SGD",
            created_by=manager.id,
        )
        client3 = Client(
            company_name="Creative Studio KL",
            contact_person="Raj Kumar",
            email="raj@creativestudio.my",
            phone="+60 11-987 6543",
            city="Kuala Lumpur",
            country="Malaysia",
            currency="MYR",
            created_by=admin.id,
        )
        db.add_all([client1, client2, client3])
        await db.flush()

        # Expense Categories
        cat_office = ExpenseCategory(name="Office Supplies", color="#6366f1")
        cat_travel = ExpenseCategory(name="Travel", color="#f59e0b")
        cat_software = ExpenseCategory(name="Software", color="#10b981")
        db.add_all([cat_office, cat_travel, cat_software])
        await db.flush()

        # Expenses
        db.add(Expense(
            category_id=cat_software.id,
            category="Software",
            description="Adobe Creative Suite annual subscription",
            amount=Decimal("3600.00"),
            currency="MYR",
            expense_date=datetime.now(timezone.utc) - timedelta(days=15),
            vendor="Adobe Inc.",
            created_by=admin.id,
        ))
        db.add(Expense(
            category_id=cat_travel.id,
            category="Travel",
            description="Client visit — Petaling Jaya",
            amount=Decimal("150.00"),
            currency="MYR",
            expense_date=datetime.now(timezone.utc) - timedelta(days=5),
            vendor="Grab",
            created_by=staff.id,
        ))

        # Quotations
        now = datetime.now(timezone.utc)
        q1 = Quotation(
            quotation_number="QT-2024-0001",
            client_id=client1.id,
            status=QuotationStatus.accepted,
            currency="MYR",
            exchange_rate=Decimal("1.0"),
            issue_date=now - timedelta(days=30),
            expiry_date=now - timedelta(days=0),
            subtotal=Decimal("15000.00"),
            tax_total=Decimal("900.00"),
            total=Decimal("15900.00"),
            notes="Payment due within 30 days.",
            created_by=admin.id,
            sent_at=now - timedelta(days=29),
            accepted_at=now - timedelta(days=25),
        )
        db.add(q1)
        await db.flush()

        db.add(QuotationItem(
            quotation_id=q1.id,
            description="Website Development — Full Stack",
            quantity=Decimal("1"),
            unit_price=Decimal("10000.00"),
            tax_rate_id=tax_6.id,
            tax_amount=Decimal("600.00"),
            line_total=Decimal("10600.00"),
            sort_order=0,
        ))
        db.add(QuotationItem(
            quotation_id=q1.id,
            description="UI/UX Design",
            quantity=Decimal("1"),
            unit_price=Decimal("5000.00"),
            tax_rate_id=tax_6.id,
            tax_amount=Decimal("300.00"),
            line_total=Decimal("5300.00"),
            sort_order=1,
        ))

        q2 = Quotation(
            quotation_number="QT-2024-0002",
            client_id=client2.id,
            status=QuotationStatus.sent,
            currency="SGD",
            exchange_rate=Decimal("3.45"),
            issue_date=now - timedelta(days=5),
            expiry_date=now + timedelta(days=25),
            subtotal=Decimal("8000.00"),
            tax_total=Decimal("0.00"),
            total=Decimal("8000.00"),
            created_by=manager.id,
            sent_at=now - timedelta(days=4),
        )
        db.add(q2)
        await db.flush()

        db.add(QuotationItem(
            quotation_id=q2.id,
            description="Digital Marketing Strategy",
            quantity=Decimal("1"),
            unit_price=Decimal("8000.00"),
            tax_rate_id=tax_0.id,
            tax_amount=Decimal("0.00"),
            line_total=Decimal("8000.00"),
            sort_order=0,
        ))

        # Invoices
        inv1 = Invoice(
            invoice_number="INV-2024-0001",
            quotation_id=q1.id,
            client_id=client1.id,
            status=InvoiceStatus.paid,
            currency="MYR",
            exchange_rate=Decimal("1.0"),
            issue_date=now - timedelta(days=25),
            due_date=now - timedelta(days=5),  # was overdue but now paid
            subtotal=Decimal("15000.00"),
            tax_total=Decimal("900.00"),
            total=Decimal("15900.00"),
            amount_paid=Decimal("15900.00"),
            balance_due=Decimal("0.00"),
            created_by=admin.id,
            sent_at=now - timedelta(days=25),
            paid_at=now - timedelta(days=10),
        )
        db.add(inv1)

        inv2 = Invoice(
            invoice_number="INV-2024-0002",
            client_id=client3.id,
            status=InvoiceStatus.overdue,
            currency="MYR",
            exchange_rate=Decimal("1.0"),
            issue_date=now - timedelta(days=45),
            due_date=now - timedelta(days=15),
            subtotal=Decimal("7500.00"),
            tax_total=Decimal("450.00"),
            total=Decimal("7950.00"),
            amount_paid=Decimal("0.00"),
            balance_due=Decimal("7950.00"),
            created_by=manager.id,
            sent_at=now - timedelta(days=44),
        )
        db.add(inv2)

        inv3 = Invoice(
            invoice_number="INV-2024-0003",
            client_id=client1.id,
            status=InvoiceStatus.partial,
            currency="MYR",
            exchange_rate=Decimal("1.0"),
            issue_date=now - timedelta(days=10),
            due_date=now + timedelta(days=20),
            subtotal=Decimal("5000.00"),
            tax_total=Decimal("300.00"),
            total=Decimal("5300.00"),
            amount_paid=Decimal("2000.00"),
            balance_due=Decimal("3300.00"),
            created_by=admin.id,
            sent_at=now - timedelta(days=9),
        )
        db.add(inv3)
        await db.flush()

        # Add items to invoices
        for inv, items in [
            (inv1, [("Website Development", Decimal("10000"), Decimal("600"), Decimal("10600")),
                    ("UI/UX Design", Decimal("5000"), Decimal("300"), Decimal("5300"))]),
            (inv2, [("Brand Identity Package", Decimal("7500"), Decimal("450"), Decimal("7950"))]),
            (inv3, [("SEO Optimization", Decimal("5000"), Decimal("300"), Decimal("5300"))]),
        ]:
            for i, (desc, price, tax, total) in enumerate(items):
                db.add(InvoiceItem(
                    invoice_id=inv.id,
                    description=desc,
                    quantity=Decimal("1"),
                    unit_price=price,
                    tax_rate_id=tax_6.id,
                    tax_amount=tax,
                    line_total=total,
                    sort_order=i,
                ))

        # Receipt for inv1
        receipt1 = Receipt(
            receipt_number="RCP-2024-0001",
            invoice_id=inv1.id,
            client_id=client1.id,
            currency="MYR",
            exchange_rate=Decimal("1.0"),
            amount=Decimal("15900.00"),
            payment_method=PaymentMethod.bank_transfer,
            payment_date=now - timedelta(days=10),
            created_by=admin.id,
        )
        db.add(receipt1)
        await db.flush()

        # Payment for inv1
        db.add(Payment(
            invoice_id=inv1.id,
            receipt_id=receipt1.id,
            amount=Decimal("15900.00"),
            currency="MYR",
            payment_date=now - timedelta(days=10),
            payment_method=PaymentMethod.bank_transfer,
            reference_number="TXN20240115001",
            recorded_by=admin.id,
        ))

        # Partial payment for inv3
        db.add(Payment(
            invoice_id=inv3.id,
            amount=Decimal("2000.00"),
            currency="MYR",
            payment_date=now - timedelta(days=3),
            payment_method=PaymentMethod.online,
            recorded_by=manager.id,
        ))

        # Activities
        db.add(Activity(
            client_id=client1.id,
            user_id=admin.id,
            type=ActivityType.quote_sent,
            description="Quotation QT-2024-0001 sent via email",
            occurred_at=now - timedelta(days=29),
        ))
        db.add(Activity(
            client_id=client1.id,
            user_id=admin.id,
            type=ActivityType.payment_received,
            description="Full payment received for INV-2024-0001 — MYR 15,900.00",
            occurred_at=now - timedelta(days=10),
        ))
        db.add(Activity(
            client_id=client3.id,
            user_id=manager.id,
            type=ActivityType.invoice_sent,
            description="Invoice INV-2024-0002 sent. Payment overdue.",
            occurred_at=now - timedelta(days=44),
        ))

        # Reminders
        db.add(Reminder(
            client_id=client3.id,
            user_id=manager.id,
            title="Follow up on overdue invoice INV-2024-0002",
            description="Invoice is 15 days overdue. Call client.",
            due_date=now + timedelta(days=1),
            priority=ReminderPriority.high,
        ))
        db.add(Reminder(
            client_id=client2.id,
            user_id=manager.id,
            title="Check if QT-2024-0002 accepted",
            description="Quotation sent 5 days ago. Follow up.",
            due_date=now + timedelta(days=3),
            priority=ReminderPriority.medium,
        ))

        await db.commit()
        print("Seed complete!")
        print("Login credentials:")
        print("  Admin:   admin@maia.com.my / Admin@123")
        print("  Manager: sarah@maia.com.my / Manager@123")
        print("  Staff:   john@maia.com.my / Staff@123")


if __name__ == "__main__":
    asyncio.run(seed())
