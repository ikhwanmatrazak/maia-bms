from sqlalchemy import Column, Integer, String, DateTime, Date, Text, ForeignKey, Boolean, Enum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base
import enum


class ReminderPriority(str, enum.Enum):
    low = "low"
    medium = "medium"
    high = "high"


class RecurrenceType(str, enum.Enum):
    one_time = "one_time"
    monthly = "monthly"
    weekly = "weekly"
    quarterly = "quarterly"
    yearly = "yearly"


class ActionType(str, enum.Enum):
    reminder = "reminder"
    create_invoice = "create_invoice"


class Reminder(Base):
    __tablename__ = "reminders"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True, index=True)
    client_id = Column(Integer, ForeignKey("clients.id", ondelete="CASCADE"), nullable=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    due_date = Column(DateTime(timezone=True), nullable=False)
    is_completed = Column(Boolean, default=False)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    priority = Column(Enum(ReminderPriority), default=ReminderPriority.medium, nullable=False)
    recurrence_type = Column(Enum(RecurrenceType), default=RecurrenceType.one_time, nullable=False)
    day_of_month = Column(Integer, nullable=True)
    day_of_week = Column(Integer, nullable=True)
    action_type = Column(Enum(ActionType), default=ActionType.reminder, nullable=False)
    next_fire_at = Column(Date, nullable=True)
    is_active = Column(Boolean, default=True)
    send_whatsapp = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    client = relationship("Client", back_populates="reminders")
    user = relationship("User", back_populates="reminders")
    notifications = relationship("ReminderNotification", back_populates="reminder", cascade="all, delete-orphan")


class ReminderNotification(Base):
    __tablename__ = "reminder_notifications"

    id = Column(Integer, primary_key=True, index=True)
    reminder_id = Column(Integer, ForeignKey("reminders.id", ondelete="CASCADE"), nullable=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    title = Column(String(255), nullable=False)
    body = Column(Text, nullable=True)
    client_id = Column(Integer, nullable=True)
    client_name = Column(String(255), nullable=True)
    action_type = Column(String(50), default="reminder")
    is_read = Column(Boolean, default=False)
    email_sent = Column(Boolean, default=False)
    fired_at = Column(DateTime(timezone=True), server_default=func.now())

    reminder = relationship("Reminder", back_populates="notifications")
