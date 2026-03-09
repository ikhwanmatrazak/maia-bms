import enum
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, Numeric, ForeignKey, Enum, Date
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from app.database import Base


class ProspectStage(str, enum.Enum):
    lead = "lead"
    qualified = "qualified"
    proposal = "proposal"
    negotiation = "negotiation"
    won = "won"
    lost = "lost"


class ProspectSource(str, enum.Enum):
    referral = "referral"
    website = "website"
    social_media = "social_media"
    cold_call = "cold_call"
    exhibition = "exhibition"
    existing_client = "existing_client"
    other = "other"


class Prospect(Base):
    __tablename__ = "prospects"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True, index=True)

    company_name = Column(String(255), nullable=False)
    contact_person = Column(String(255), nullable=True)
    email = Column(String(255), nullable=True)
    phone = Column(String(50), nullable=True)
    address = Column(Text, nullable=True)

    stage = Column(Enum(ProspectStage), default=ProspectStage.lead, nullable=False)
    expected_value = Column(Numeric(15, 2), nullable=True)
    currency = Column(String(3), default="MYR", nullable=False)
    source = Column(Enum(ProspectSource), nullable=True)
    expected_close_date = Column(Date, nullable=True)
    probability = Column(Integer, nullable=True)  # 0-100 %

    notes = Column(Text, nullable=True)
    lost_reason = Column(Text, nullable=True)

    assigned_to = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    is_converted = Column(Boolean, default=False, nullable=False)
    converted_client_id = Column(Integer, ForeignKey("clients.id", ondelete="SET NULL"), nullable=True)
    converted_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))
