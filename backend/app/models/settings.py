from sqlalchemy import Column, Integer, String, Boolean, DateTime, Numeric, Text, Enum
from sqlalchemy.sql import func
from app.database import Base
import enum


class TemplateType(str, enum.Enum):
    quotation = "quotation"
    invoice = "invoice"
    receipt = "receipt"


class CompanySettings(Base):
    __tablename__ = "company_settings"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False, default="MAIA")
    logo_url = Column(String(500), nullable=True)
    address = Column(Text, nullable=True)
    phone = Column(String(50), nullable=True)
    email = Column(String(255), nullable=True)
    website = Column(String(255), nullable=True)
    default_currency = Column(String(3), nullable=False, default="MYR")
    default_payment_terms = Column(Integer, default=30)  # days
    invoice_prefix = Column(String(20), default="INV")
    quotation_prefix = Column(String(20), default="QT")
    receipt_prefix = Column(String(20), default="RCP")

    # SMTP settings (password stored encrypted)
    smtp_host = Column(String(255), nullable=True)
    smtp_port = Column(Integer, default=587)
    smtp_user = Column(String(255), nullable=True)
    smtp_pass_encrypted = Column(Text, nullable=True)
    smtp_from_email = Column(String(255), nullable=True)
    smtp_from_name = Column(String(255), nullable=True)

    # SST
    sst_no = Column(String(50), nullable=True)

    # Payment
    payment_terms_text = Column(Text, nullable=True)
    payment_info = Column(Text, nullable=True)

    # Banking Details (structured)
    bank_name = Column(String(255), nullable=True)
    bank_account_no = Column(String(100), nullable=True)
    bank_account_name = Column(String(255), nullable=True)

    # Branding
    signature_image_url = Column(String(500), nullable=True)
    primary_color = Column(String(7), default="#1a1a2e")
    accent_color = Column(String(7), default="#16213e")

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class TaxRate(Base):
    __tablename__ = "tax_rates"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    rate = Column(Numeric(5, 2), nullable=False)
    is_default = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class DocumentTemplate(Base):
    __tablename__ = "document_templates"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    type = Column(Enum(TemplateType), nullable=False)
    template_json = Column(Text, nullable=True)  # JSON config for template customization
    is_default = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
