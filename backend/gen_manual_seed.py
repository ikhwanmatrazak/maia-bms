import sys
import os
sys.path.insert(0, os.getcwd())
try:
    from app.middleware.auth import hash_password
    
    admin_h = hash_password("Admin@123")
    manager_h = hash_password("Manager@123")
    staff_h = hash_password("Staff@123")
    
    sql = f"""
-- Company Settings
INSERT INTO company_settings (name, address, phone, email, website, default_currency, default_payment_terms, invoice_prefix, quotation_prefix, receipt_prefix, primary_color, accent_color)
VALUES ('MAIA Consulting Sdn Bhd', 'Level 12, Menara MAIA, Jalan Ampang, 50450 Kuala Lumpur', '+60 3-1234 5678', 'info@maia.com.my', 'https://maia.com.my', 'MYR', 30, 'INV', 'QT', 'RCP', '#1a1a2e', '#16213e');

-- Tax Rates
INSERT INTO tax_rates (name, rate, is_default, is_active) VALUES ('SST 6%', 6.00, 1, 1);
INSERT INTO tax_rates (name, rate, is_default, is_active) VALUES ('Exempt', 0.00, 0, 1);
INSERT INTO tax_rates (name, rate, is_default, is_active) VALUES ('SST 8%', 8.00, 0, 1);

-- Documents Templates
INSERT INTO document_templates (name, type, is_default) VALUES ('Professional', 'quotation', 1);
INSERT INTO document_templates (name, type, is_default) VALUES ('Minimal', 'quotation', 0);
INSERT INTO document_templates (name, type, is_default) VALUES ('Professional', 'invoice', 1);
INSERT INTO document_templates (name, type, is_default) VALUES ('Minimal', 'invoice', 0);
INSERT INTO document_templates (name, type, is_default) VALUES ('Professional', 'receipt', 1);
INSERT INTO document_templates (name, type, is_default) VALUES ('Minimal', 'receipt', 0);

-- Users
INSERT INTO users (name, email, password_hash, role, is_active) VALUES ('Admin User', 'admin@maia.com.my', '{admin_h}', 'admin', 1);
INSERT INTO users (name, email, password_hash, role, is_active) VALUES ('Sarah Manager', 'sarah@maia.com.my', '{manager_h}', 'manager', 1);
INSERT INTO users (name, email, password_hash, role, is_active) VALUES ('John Staff', 'john@maia.com.my', '{staff_h}', 'staff', 1);

-- Clients
INSERT INTO clients (company_name, contact_person, email, phone, address, city, country, currency, status) 
VALUES ('Tech Solutions Sdn Bhd', 'Ahmad Rahman', 'ahmad@techsolutions.com.my', '+60 12-345 6789', 'Petaling Jaya, Selangor', 'Petaling Jaya', 'Malaysia', 'MYR', 'active');
"""
    print(sql)
except Exception as e:
    print(f"Error: {e}")
