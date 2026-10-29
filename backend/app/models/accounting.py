import enum
from sqlalchemy import Column, Integer, String, Numeric, DateTime, Text, Enum, ForeignKey, Index
from sqlalchemy.orm import relationship
from app.database import Base


class AccountType(str, enum.Enum):
    asset = "asset"
    liability = "liability"
    equity = "equity"
    revenue = "revenue"
    expense = "expense"


class Account(Base):
    __tablename__ = "accounts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, nullable=True, index=True)
    code = Column(String(20), nullable=False)
    name = Column(String(255), nullable=False)
    account_type = Column(Enum(AccountType), nullable=False)
    description = Column(Text, nullable=True)
    is_system = Column(Integer, default=0)   # system accounts cannot be deleted
    is_deleted = Column(Integer, default=0)
    created_at = Column(DateTime, server_default="CURRENT_TIMESTAMP")

    lines = relationship("JournalEntryLine", back_populates="account")

    __table_args__ = (
        Index("ix_accounts_tenant_code", "tenant_id", "code"),
    )


class JournalEntry(Base):
    __tablename__ = "journal_entries"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, nullable=True, index=True)
    entry_number = Column(String(50), nullable=False, unique=True)
    date = Column(DateTime, nullable=False)
    description = Column(Text, nullable=False)
    reference_type = Column(String(50), nullable=True)   # 'invoice','payment_voucher','manual'
    reference_id = Column(Integer, nullable=True)
    is_deleted = Column(Integer, default=0)
    created_by = Column(Integer, nullable=True)
    created_at = Column(DateTime, server_default="CURRENT_TIMESTAMP")

    lines = relationship("JournalEntryLine", back_populates="entry", cascade="all, delete-orphan")


class JournalEntryLine(Base):
    __tablename__ = "journal_entry_lines"

    id = Column(Integer, primary_key=True, autoincrement=True)
    journal_entry_id = Column(Integer, ForeignKey("journal_entries.id", ondelete="CASCADE"), nullable=False)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False)
    debit = Column(Numeric(15, 2), default=0.00, nullable=False)
    credit = Column(Numeric(15, 2), default=0.00, nullable=False)
    description = Column(Text, nullable=True)

    entry = relationship("JournalEntry", back_populates="lines")
    account = relationship("Account", back_populates="lines")
