"""Run once to create credit_notes and credit_note_items tables."""
import asyncio
from sqlalchemy import text
from app.database import engine


async def main():
    async with engine.begin() as conn:
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS credit_notes (
                id INT AUTO_INCREMENT PRIMARY KEY,
                tenant_id INT NULL,
                credit_note_number VARCHAR(50) NOT NULL UNIQUE,
                client_id INT NOT NULL,
                invoice_id INT NULL,
                status ENUM('draft','issued','applied','cancelled') NOT NULL DEFAULT 'draft',
                currency VARCHAR(3) NOT NULL DEFAULT 'MYR',
                issue_date DATETIME NOT NULL,
                reason TEXT NULL,
                subtotal DECIMAL(15,2) DEFAULT 0.00,
                tax_total DECIMAL(15,2) DEFAULT 0.00,
                total DECIMAL(15,2) DEFAULT 0.00,
                amount_used DECIMAL(15,2) DEFAULT 0.00,
                available_balance DECIMAL(15,2) DEFAULT 0.00,
                notes TEXT NULL,
                created_by INT NULL,
                is_deleted TINYINT(1) NOT NULL DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
                FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE RESTRICT,
                FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE SET NULL,
                FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
            )
        """))

        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS credit_note_items (
                id INT AUTO_INCREMENT PRIMARY KEY,
                credit_note_id INT NOT NULL,
                description TEXT NOT NULL,
                quantity DECIMAL(10,2) NOT NULL DEFAULT 1,
                unit_price DECIMAL(15,2) NOT NULL DEFAULT 0.00,
                tax_rate_id INT NULL,
                tax_amount DECIMAL(15,2) DEFAULT 0.00,
                line_total DECIMAL(15,2) DEFAULT 0.00,
                sort_order INT DEFAULT 0,
                FOREIGN KEY (credit_note_id) REFERENCES credit_notes(id) ON DELETE CASCADE,
                FOREIGN KEY (tax_rate_id) REFERENCES tax_rates(id) ON DELETE SET NULL
            )
        """))

    print("✓ credit_notes and credit_note_items tables created successfully.")


asyncio.run(main())
