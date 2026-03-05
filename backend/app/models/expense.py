from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey, Numeric, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class ExpenseCategory(Base):
    __tablename__ = "expense_categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False, unique=True)
    color = Column(String(7), default="#6366f1")
    is_active = Column(Boolean, default=True)

    # Relationships
    expenses = relationship("Expense", back_populates="category_rel")


class Expense(Base):
    __tablename__ = "expenses"

    id = Column(Integer, primary_key=True, index=True)
    category_id = Column(Integer, ForeignKey("expense_categories.id", ondelete="SET NULL"), nullable=True)
    category = Column(String(100), nullable=True)  # Denormalized for quick access
    description = Column(Text, nullable=False)
    amount = Column(Numeric(15, 2), nullable=False)
    currency = Column(String(3), nullable=False, default="MYR")
    exchange_rate = Column(Numeric(10, 6), default=1.0)
    expense_date = Column(DateTime(timezone=True), nullable=False)
    vendor = Column(String(255), nullable=True)
    receipt_url = Column(String(500), nullable=True)
    notes = Column(Text, nullable=True)
    created_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    category_rel = relationship("ExpenseCategory", back_populates="expenses")
