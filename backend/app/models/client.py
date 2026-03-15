from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, ForeignKey, Enum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base
import enum



class ClientStatus(str, enum.Enum):
    active = "active"
    inactive = "inactive"


class Client(Base):
    __tablename__ = "clients"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True, index=True)
    company_name = Column(String(255), nullable=False, index=True)
    contact_person = Column(String(255), nullable=True)
    email = Column(String(255), nullable=True, index=True)
    phone = Column(String(50), nullable=True)
    address = Column(Text, nullable=True)
    city = Column(String(100), nullable=True)
    country = Column(String(100), nullable=True)
    currency = Column(String(3), default="MYR")
    notes = Column(Text, nullable=True)
    status = Column(Enum(ClientStatus), default=ClientStatus.active, nullable=False)
    # Segmentation fields
    industry = Column(String(100), nullable=True)
    tags = Column(String(500), nullable=True)  # comma-separated
    region = Column(String(100), nullable=True)
    company_size = Column(String(50), nullable=True)  # "1-10", "11-50", "51-200", "200+"
    created_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    contacts = relationship("ClientContact", back_populates="client", cascade="all, delete-orphan")
    activities = relationship("Activity", back_populates="client", cascade="all, delete-orphan")
    reminders = relationship("Reminder", back_populates="client", cascade="all, delete-orphan")
    quotations = relationship("Quotation", back_populates="client")
    invoices = relationship("Invoice", back_populates="client")
    receipts = relationship("Receipt", back_populates="client")
    delivery_orders = relationship("DeliveryOrder", back_populates="client")
