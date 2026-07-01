"""
ORM models for Feature 2 — Personal Financial Intelligence.

All three tables carry a user_id column — populate it from the authenticated
session once auth is wired up (Nishant/Cole, spec §3.3).

Encryption note (spec §3.3 — Nishant + Cole):
  The description and amount fields on PFTransaction store plaintext today.
  Replace the Column types with an EncryptedString / EncryptedFloat TypeDecorator
  (AES-256, key from env) before any real user data is stored in production.
"""

from datetime import datetime, date
from sqlalchemy import (
    TypeDecorator, String, Float, Column, String, Float, Integer, Date, DateTime,
    UniqueConstraint, func,
)
from database import Base
import os
import base64
from cryptography.fernet import Fernet
from dotenv import load_dotenv
load_dotenv()

# Load key from environment
ENCRYPTION_KEY = os.getenv("ENCRYPTION_KEY")

if not ENCRYPTION_KEY:
    raise ValueError("ENCRYPTION_KEY not set")

cipher = Fernet(ENCRYPTION_KEY)


class EncryptedString(TypeDecorator):
    impl = String

    def process_bind_param(self, value, dialect):
        if value is None:
            return value
        encrypted = cipher.encrypt(value.encode())
        return encrypted.decode()

    def process_result_value(self, value, dialect):
        if value is None:
            return value
        decrypted = cipher.decrypt(value.encode())
        return decrypted.decode()


class EncryptedFloat(TypeDecorator):
    impl = String  # store as string after encryption

    def process_bind_param(self, value, dialect):
        if value is None:
            return value
        encrypted = cipher.encrypt(str(value).encode())
        return encrypted.decode()

    def process_result_value(self, value, dialect):
        if value is None:
            return value
        decrypted = cipher.decrypt(value.encode())
        return float(decrypted.decode())

class PFTransaction(Base):
    """One confirmed financial transaction belonging to a user."""

    __tablename__ = "pf_transactions"

    id          = Column(String,  primary_key=True)          # matches frontend Transaction.id
    user_id     = Column(String,  nullable=False, index=True)
    date        = Column(String,  nullable=False)             # ISO yyyy-mm-dd
    description = Column(EncryptedString,  nullable=False)             # TODO: EncryptedString (§3.3)
    amount      = Column(EncryptedFloat,   nullable=False)             # TODO: EncryptedFloat  (§3.3)
    type        = Column(String,  nullable=False)             # income | expense | transfer
    category    = Column(String,  nullable=False)
    source      = Column(String,  nullable=False)             # csv | manual
    created_at  = Column(DateTime, default=func.now())


class PFBudget(Base):
    """Monthly budget limit per category for a user. One row per user+category."""

    __tablename__ = "pf_budgets"

    id            = Column(Integer, primary_key=True, autoincrement=True)
    user_id       = Column(String,  nullable=False, index=True)
    category      = Column(String,  nullable=False)
    budget_amount = Column(Float,   nullable=False)
    period        = Column(String,  nullable=False, default="monthly")  # monthly | annual
    updated_at    = Column(DateTime, default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint("user_id", "category", name="uq_budget_user_category"),
    )


class PFSnapshot(Base):
    """
    Point-in-time financial health snapshot computed from a user's transactions.
    Written whenever the frontend requests a summary so trends can be tracked
    over time without re-scanning the full transaction history.
    """

    __tablename__ = "pf_snapshots"

    id               = Column(Integer, primary_key=True, autoincrement=True)
    user_id          = Column(String,  nullable=False, index=True)
    snapshot_date    = Column(Date,    nullable=False, default=date.today)
    health_score     = Column(Integer, nullable=True)   # 0–100
    savings_rate     = Column(Float,   nullable=True)   # percentage
    cashflow_balance = Column(Float,   nullable=True)   # net cash flow for the period
    created_at       = Column(DateTime, default=func.now())


# ─────────────────────────────────────────────
# Feature 3 — Investment Intelligence Models
# ─────────────────────────────────────────────

class InvestmentHolding(Base):
    """
    Represents a single asset held by a user in their portfolio.
    e.g. 10 shares of AAPL bought at $150 on 2023-01-15
    """
    __tablename__ = "investment_holdings"

    id            = Column(String,  primary_key=True)
    user_id       = Column(String,  nullable=False, index=True)
    symbol        = Column(String,  nullable=False)          # e.g. "AAPL", "BTC", "VAS.AX"
    asset_type    = Column(String,  nullable=False)          # stock | crypto | etf | fund | real_estate
    quantity      = Column(Float,   nullable=False)
    buy_price     = Column(Float,   nullable=False)          # price per unit at purchase
    purchase_date = Column(String,  nullable=True)           # ISO yyyy-mm-dd
    source        = Column(String,  nullable=False, default="manual")  # manual | csv
    created_at    = Column(DateTime, default=func.now())


class MarketPrice(Base):
    """
    Latest known market price for a given symbol.
    Updated periodically by the scheduler (Phase 3).
    One row per symbol — upserted on each refresh.
    """
    __tablename__ = "market_prices"
    __table_args__ = {"extend_existing": True}

    id                 = Column(Integer, primary_key=True, autoincrement=True)
    symbol             = Column(String,  nullable=False, unique=True, index=True)
    current_price      = Column(Float,   nullable=True)
    daily_change       = Column(Float,   nullable=True)   # absolute $ change
    percentage_change  = Column(Float,   nullable=True)   # % change
    timestamp          = Column(DateTime, default=func.now(), onupdate=func.now())


class PortfolioSnapshot(Base):
    """
    Point-in-time summary of a user's entire portfolio.
    Written whenever the dashboard is loaded or summary is requested.
    Mirrors the pattern used by PFSnapshot above.
    """
    __tablename__ = "portfolio_snapshots"
    __table_args__ = {"extend_existing": True}

    id                = Column(Integer, primary_key=True, autoincrement=True)
    user_id           = Column(String,  nullable=False, index=True)
    total_value       = Column(Float,   nullable=True)    # current market value
    total_cost        = Column(Float,   nullable=True)    # total amount invested
    profit_loss       = Column(Float,   nullable=True)    # total_value - total_cost
    return_percentage = Column(Float,   nullable=True)    # (profit_loss / total_cost) * 100
    snapshot_date     = Column(Date,    nullable=False, default=date.today)


class InvestmentInsight(Base):
    """
    A single AI or rule-based insight generated for a user.
    e.g. "You are 80% concentrated in tech stocks — consider diversifying."
    severity: info | warning | danger
    insight_type: overexposure | diversification | drop_alert | rebalance | ai_suggestion
    """
    __tablename__ = "investment_insights"
    __table_args__ = {"extend_existing": True}

    id           = Column(Integer, primary_key=True, autoincrement=True)
    user_id      = Column(String,  nullable=False, index=True)
    insight_type = Column(String,  nullable=False)
    message      = Column(String,  nullable=False)
    severity     = Column(String,  nullable=False, default="info")  # info | warning | danger
    created_at   = Column(DateTime, default=func.now())


# ─────────────────────────────────────────────
# Shared infrastructure models
# ─────────────────────────────────────────────

class User(Base):
    """
    Central user record. Every other table's user_id references this.
    account_type matches the LoginScreen selection: user | industry | government
    """
    __tablename__ = "users"

    id           = Column(String,  primary_key=True)           # UUID assigned on first login
    account_type = Column(String,  nullable=False)             # user | industry | government
    created_at   = Column(DateTime, default=func.now())


class InvestmentOnboardingProfile(Base):
    """
    Persists the investment onboarding answers for a user (Feature 3).
    One row per user — upserted on each completed onboarding.
    Mirrored to Feature_3_input.json for the Llama prompt builder.

    investment_strategies / asset_interests are JSON-encoded string arrays
    (SQLite has no native list type); the API layer encodes/decodes them.
    investment_goal is retained as a nullable column for older callers but
    is no longer collected by the onboarding form.
    """
    __tablename__ = "investment_onboarding_profiles"

    id                    = Column(Integer, primary_key=True, autoincrement=True)
    user_id               = Column(String,  nullable=False, unique=True, index=True)
    age                   = Column(Integer, nullable=False)
    experience_level      = Column(String,  nullable=False)   # beginner | intermediate | advanced
    investment_capital    = Column(Integer, nullable=False)   # dollar amount, 0 – 500,000
    emergency_cash        = Column(Integer, nullable=True)    # dollar amount, 0 – 200,000; cash held outside the portfolio
    communication_style   = Column(String,  nullable=False)   # simple | technical
    investment_goal       = Column(String,  nullable=True)    # legacy: growth | income | preservation | balanced
    investment_strategies = Column(String,  nullable=True)    # JSON list[str]
    time_horizon          = Column(String,  nullable=False)   # daily | weekly | monthly | annually | indefinitely
    asset_interests       = Column(String,  nullable=True)    # JSON list[str]
    country               = Column(String,  nullable=True)    # user's home country for domestic stock suggestions
    completed_at          = Column(DateTime, default=func.now(), onupdate=func.now())


# ─────────────────────────────────────────────
# Feature 5 — Knowledge & Learning Models
# ─────────────────────────────────────────────

class EllyConversation(Base):
    """Cross-feature ELLY chat history. One row per question/answer pair."""

    __tablename__ = "elly_conversations"

    id             = Column(String,  primary_key=True)
    user_id        = Column(String,  nullable=False, index=True)
    question       = Column(String,  nullable=False)
    answer         = Column(String,  nullable=False)
    topics         = Column(String,  nullable=True)   # JSON list[str]
    feature_source = Column(String,  nullable=True)   # f1 | f2 | f3 | general
    created_at     = Column(DateTime, default=func.now())


class UserGoal(Base):
    """
    Cross-feature goal tracker (Feature 5).
    Goals can be auto-generated from F1/F2/F3 signals or created manually.
    stage: identified → in_progress → done
    source_feature: f1 | f2 | f3 | manual
    """

    __tablename__ = "user_goals"

    id             = Column(String,  primary_key=True)
    user_id        = Column(String,  nullable=False, index=True)
    title          = Column(String,  nullable=False)
    description    = Column(String,  nullable=True)
    source_feature = Column(String,  nullable=False, default="manual")
    stage          = Column(String,  nullable=False, default="identified")
    next_step      = Column(String,  nullable=True)
    created_at     = Column(DateTime, default=func.now())
    updated_at     = Column(DateTime, default=func.now(), onupdate=func.now())


class ForecastConfig(Base):
    """
    Persists the business forecast onboarding inputs for a user (Feature 1).
    One row per user — upserted whenever the user finishes the onboarding flow.
    Replaces the Zustand-only store so configs survive page refresh.
    """
    __tablename__ = "forecast_configs"

    id              = Column(Integer, primary_key=True, autoincrement=True)
    user_id         = Column(String,  nullable=False, unique=True, index=True)
    starting_mrr    = Column(Float,   nullable=False, default=40100.0)
    growth_rate     = Column(Float,   nullable=False, default=5.0)    # percentage
    churn_rate      = Column(Float,   nullable=False, default=3.0)    # percentage
    cogs_percent    = Column(Float,   nullable=False, default=22.0)   # percentage
    marketing_spend = Column(Float,   nullable=False, default=4000.0)
    payroll         = Column(Float,   nullable=False, default=22000.0)
    months          = Column(Integer, nullable=False, default=12)
    updated_at      = Column(DateTime, default=func.now(), onupdate=func.now())