"""
Feature 5 — Knowledge & Learning backend router.

Endpoints:
  POST /knowledge/chat           — ELLY general knowledge chat (context-aware)
  GET  /knowledge/conversations  — Past ELLY conversations for this user
  GET  /knowledge/goals          — Cross-feature goals (seeds demo data on first call)
  POST /knowledge/goals          — Create a goal
  PUT  /knowledge/goals/{id}     — Update stage / next_step
  DELETE /knowledge/goals/{id}   — Delete a goal
  GET  /knowledge/resources      — Curated articles & frameworks (static)
  GET  /knowledge/user-context   — Aggregated UserContext from all features
"""

import json
import os
from typing import Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from groq import Groq
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import get_db
from models import (
    EllyConversation,
    ForecastConfig,
    InvestmentHolding,
    PFSnapshot,
    PFTransaction,
    PortfolioSnapshot,
    UserGoal,
)

router = APIRouter(prefix="/knowledge", tags=["knowledge"])

DEMO_USER_ID = "demo-user"

_groq_client: Optional[Groq] = None


def _get_groq() -> Groq:
    global _groq_client
    if _groq_client is None:
        _groq_client = Groq(api_key=os.getenv("GROQ_API_KEY"))
    return _groq_client


# ── Curated resources (static, no DB) ────────────────────────────────────────

CURATED_RESOURCES = [
    {
        "id": "r1",
        "title": "Understanding Burn Rate & Runway",
        "description": "How to calculate your burn rate, forecast your runway, and make strategic hiring and spending decisions before you run out of cash.",
        "category": "article",
        "topic": "strategic_finance",
        "read_time_min": 6,
        "tags": ["burn rate", "runway", "SaaS", "cash flow"],
    },
    {
        "id": "r2",
        "title": "The 50/30/20 Budget Rule Explained",
        "description": "A simple framework for allocating income: 50% to needs, 30% to wants, 20% to savings and debt repayment.",
        "category": "article",
        "topic": "personal_finance",
        "read_time_min": 4,
        "tags": ["budgeting", "savings", "personal finance"],
    },
    {
        "id": "r3",
        "title": "Dollar Cost Averaging: A Beginner's Guide",
        "description": "How investing a fixed amount regularly reduces the impact of volatility and builds wealth over time without timing the market.",
        "category": "article",
        "topic": "investing",
        "read_time_min": 5,
        "tags": ["DCA", "investing", "ETF", "stocks"],
    },
    {
        "id": "r4",
        "title": "Portfolio Diversification Strategies",
        "description": "Why concentration risk is dangerous — and how to spread investments across asset classes, geographies, and sectors.",
        "category": "article",
        "topic": "investing",
        "read_time_min": 7,
        "tags": ["diversification", "risk", "asset allocation"],
    },
    {
        "id": "r5",
        "title": "Understanding SaaS Metrics: ARR, MRR, Churn",
        "description": "The core metrics every founder needs — and how ARR, MRR, and churn connect to valuation and fundraising.",
        "category": "article",
        "topic": "strategic_finance",
        "read_time_min": 8,
        "tags": ["SaaS", "ARR", "MRR", "churn", "metrics"],
    },
    {
        "id": "r6",
        "title": "How to Build a 6-Month Emergency Fund",
        "description": "Step-by-step guide to calculating your target, choosing the right account, and automating contributions.",
        "category": "article",
        "topic": "personal_finance",
        "read_time_min": 5,
        "tags": ["emergency fund", "savings", "personal finance"],
    },
    {
        "id": "f1",
        "title": "FIRE Framework",
        "description": "Financial Independence, Retire Early — a movement built on extreme saving and investing to retire decades before the traditional age.",
        "category": "framework",
        "topic": "personal_finance",
        "read_time_min": 10,
        "tags": ["FIRE", "financial independence", "early retirement"],
    },
    {
        "id": "f2",
        "title": "Zero-Based Budgeting",
        "description": "Every dollar gets a job. Start from zero each month and allocate income to categories until you reach $0 — eliminating waste.",
        "category": "framework",
        "topic": "personal_finance",
        "read_time_min": 6,
        "tags": ["ZBB", "budgeting", "zero-based"],
    },
    {
        "id": "f3",
        "title": "Markowitz Modern Portfolio Theory",
        "description": "How to construct an optimal portfolio by balancing expected return against portfolio risk using the efficient frontier.",
        "category": "framework",
        "topic": "investing",
        "read_time_min": 12,
        "tags": ["MPT", "Markowitz", "efficient frontier", "risk-return"],
    },
    {
        "id": "f4",
        "title": "Rule of 72",
        "description": "Divide 72 by your expected annual return to estimate years until your money doubles. Works for debts too.",
        "category": "framework",
        "topic": "investing",
        "read_time_min": 3,
        "tags": ["rule of 72", "compound interest", "investing basics"],
    },
]

# ── Demo goals seeded on first GET /knowledge/goals ──────────────────────────

DEMO_GOALS = [
    {
        "title": "Extend cash runway to 18 months",
        "description": "Current projections show ~12 months runway. Optimising COGS and marketing spend can extend this.",
        "source_feature": "f1",
        "stage": "identified",
        "next_step": "Review COGS percentage — target reducing from 22% to 18%",
    },
    {
        "title": "Reduce dining & entertainment overspend",
        "description": "Spending 40% above budget in this category for 3 consecutive months.",
        "source_feature": "f2",
        "stage": "in_progress",
        "next_step": "Set a weekly dining budget alert at $150",
    },
    {
        "title": "Diversify portfolio — reduce tech concentration",
        "description": "Tech stocks represent 78% of portfolio. Target < 40% single-sector exposure.",
        "source_feature": "f3",
        "stage": "identified",
        "next_step": "Research broad-market ETFs like VTI or MSCI World",
    },
    {
        "title": "Build 6-month emergency fund",
        "description": "Personal financial safety net. Target: $24,000 based on monthly expenses.",
        "source_feature": "manual",
        "stage": "in_progress",
        "next_step": "Automate $500/month transfer to high-yield savings account",
    },
]

# ── Pydantic schemas ──────────────────────────────────────────────────────────


class ChatRequest(BaseModel):
    question: str
    user_id: str = DEMO_USER_ID


class GoalCreate(BaseModel):
    title: str
    description: Optional[str] = None
    source_feature: str = "manual"
    stage: str = "identified"
    next_step: Optional[str] = None


class GoalUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    stage: Optional[str] = None
    next_step: Optional[str] = None


# ── Internal helpers ──────────────────────────────────────────────────────────


def _aggregate_context(user_id: str, db: Session) -> dict:
    ctx: dict = {}

    # F1 — MRR / growth rate from forecast config
    fc = db.query(ForecastConfig).filter(ForecastConfig.user_id == user_id).first()
    if fc:
        ctx.setdefault("financial_snapshot", {}).update(
            {
                "mrr": fc.starting_mrr,
                "growth_rate": fc.growth_rate,
                "monthly_expenses": (fc.payroll or 0) + (fc.marketing_spend or 0),
            }
        )

    # F2 — Personal finance health score (latest snapshot)
    pf = (
        db.query(PFSnapshot)
        .filter(PFSnapshot.user_id == user_id)
        .order_by(PFSnapshot.created_at.desc())
        .first()
    )
    if pf:
        ctx.setdefault("financial_snapshot", {}).update(
            {
                "health_score": pf.health_score,
                "savings_rate": pf.savings_rate,
                "cashflow_balance": pf.cashflow_balance,
            }
        )

    # F3 — Portfolio (latest snapshot + holdings count)
    ps = (
        db.query(PortfolioSnapshot)
        .filter(PortfolioSnapshot.user_id == user_id)
        .order_by(PortfolioSnapshot.id.desc())
        .first()
    )
    holding_count = (
        db.query(func.count(InvestmentHolding.id))
        .filter(InvestmentHolding.user_id == user_id)
        .scalar()
        or 0
    )
    if ps:
        ctx.setdefault("financial_snapshot", {}).update(
            {
                "portfolio_value": ps.total_value,
                "portfolio_return": ps.return_percentage,
                "holding_count": holding_count,
            }
        )

    # Active goals (not done)
    goals = (
        db.query(UserGoal)
        .filter(UserGoal.user_id == user_id, UserGoal.stage != "done")
        .order_by(UserGoal.updated_at.desc())
        .limit(5)
        .all()
    )
    ctx["active_goals"] = [
        {"title": g.title, "stage": g.stage, "sourceFeature": g.source_feature}
        for g in goals
    ]

    return ctx


def _build_prompt(question: str, ctx: dict) -> str:
    lines = []
    snap = ctx.get("financial_snapshot", {})

    if snap.get("mrr"):
        lines.append(
            f"- Business MRR: ${snap['mrr']:,.0f}, growth rate: {snap.get('growth_rate', '?')}%"
        )
    if snap.get("monthly_expenses"):
        lines.append(f"- Monthly operating expenses: ${snap['monthly_expenses']:,.0f}")
    if snap.get("health_score"):
        sr = snap.get("savings_rate") or 0
        lines.append(
            f"- Personal finance health score: {snap['health_score']}/100, savings rate: {sr:.1f}%"
        )
    if snap.get("cashflow_balance"):
        lines.append(f"- Monthly personal cash flow: ${snap['cashflow_balance']:,.0f}")
    if snap.get("portfolio_value"):
        ret = snap.get("portfolio_return") or 0
        count = snap.get("holding_count") or 0
        lines.append(
            f"- Investment portfolio: ${snap['portfolio_value']:,.0f} ({count} holdings), total return: {ret:+.1f}%"
        )

    goals = ctx.get("active_goals", [])
    if goals:
        goal_strs = [f"'{g['title']}' ({g['stage']})" for g in goals[:4]]
        lines.append(f"- Active goals: {', '.join(goal_strs)}")

    context_block = (
        "\n".join(lines) if lines else "No financial data on file yet."
    )

    return f"""You are ELLY, an AI financial intelligence assistant for the ElectraWireless Business Console.

The user's current financial context:
{context_block}

User question: {question}

Instructions:
- Give a clear, structured, educational answer
- If the question relates to the user's specific data above, reference it concretely
- Use ## for section headers and bullet points for lists where helpful
- Keep responses focused, practical, and actionable
- End with 1-2 concrete next steps the user can take today"""


def _goal_to_dict(g: UserGoal) -> dict:
    return {
        "id": g.id,
        "user_id": g.user_id,
        "title": g.title,
        "description": g.description,
        "source_feature": g.source_feature,
        "stage": g.stage,
        "next_step": g.next_step,
        "created_at": g.created_at.isoformat() if g.created_at else None,
        "updated_at": g.updated_at.isoformat() if g.updated_at else None,
    }


# ── Routes ────────────────────────────────────────────────────────────────────


@router.post("/chat")
def knowledge_chat(req: ChatRequest, db: Session = Depends(get_db)):
    ctx = _aggregate_context(req.user_id, db)
    prompt = _build_prompt(req.question, ctx)

    try:
        resp = _get_groq().chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=900,
            temperature=0.7,
        )
        answer = resp.choices[0].message.content.strip()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"AI service error: {exc}")

    db.add(
        EllyConversation(
            id=str(uuid4()),
            user_id=req.user_id,
            question=req.question,
            answer=answer,
            topics=json.dumps([]),
            feature_source="general",
        )
    )
    db.commit()

    return {"answer": answer, "topics": []}


@router.get("/conversations")
def list_conversations(user_id: str = DEMO_USER_ID, db: Session = Depends(get_db)):
    rows = (
        db.query(EllyConversation)
        .filter(EllyConversation.user_id == user_id)
        .order_by(EllyConversation.created_at.desc())
        .limit(50)
        .all()
    )
    return [
        {
            "id": c.id,
            "question": c.question,
            "answer": c.answer,
            "topics": json.loads(c.topics or "[]"),
            "created_at": c.created_at.isoformat() if c.created_at else None,
        }
        for c in rows
    ]


@router.get("/goals")
def list_goals(user_id: str = DEMO_USER_ID, db: Session = Depends(get_db)):
    goals = (
        db.query(UserGoal)
        .filter(UserGoal.user_id == user_id)
        .order_by(UserGoal.updated_at.desc())
        .all()
    )

    # Seed demo goals on first call
    if not goals:
        for g in DEMO_GOALS:
            db.add(
                UserGoal(
                    id=str(uuid4()),
                    user_id=user_id,
                    **g,
                )
            )
        db.commit()
        goals = (
            db.query(UserGoal)
            .filter(UserGoal.user_id == user_id)
            .order_by(UserGoal.updated_at.desc())
            .all()
        )

    return [_goal_to_dict(g) for g in goals]


@router.post("/goals")
def create_goal(payload: GoalCreate, db: Session = Depends(get_db)):
    goal = UserGoal(
        id=str(uuid4()),
        user_id=DEMO_USER_ID,
        title=payload.title,
        description=payload.description,
        source_feature=payload.source_feature,
        stage=payload.stage,
        next_step=payload.next_step,
    )
    db.add(goal)
    db.commit()
    db.refresh(goal)
    return _goal_to_dict(goal)


@router.put("/goals/{goal_id}")
def update_goal(goal_id: str, payload: GoalUpdate, db: Session = Depends(get_db)):
    goal = db.query(UserGoal).filter(UserGoal.id == goal_id).first()
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    if payload.title is not None:
        goal.title = payload.title
    if payload.description is not None:
        goal.description = payload.description
    if payload.stage is not None:
        goal.stage = payload.stage
    if payload.next_step is not None:
        goal.next_step = payload.next_step
    db.commit()
    db.refresh(goal)
    return _goal_to_dict(goal)


@router.delete("/goals/{goal_id}")
def delete_goal(goal_id: str, db: Session = Depends(get_db)):
    goal = db.query(UserGoal).filter(UserGoal.id == goal_id).first()
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    db.delete(goal)
    db.commit()
    return {"status": "deleted"}


@router.get("/resources")
def get_resources():
    return CURATED_RESOURCES


@router.get("/news")
def get_knowledge_news(user_id: str = DEMO_USER_ID, db: Session = Depends(get_db)):
    """
    Market news filtered by the user's investment holdings.
    Falls back to major indices when the user has no holdings yet.
    # TODO: also filter by goal keywords once goal-based filtering is agreed on.
    """
    holdings = (
        db.query(InvestmentHolding)
        .filter(InvestmentHolding.user_id == user_id)
        .all()
    )
    symbols = list({h.symbol for h in holdings if h.symbol})[:8]
    fallback = not bool(symbols)
    fetch_symbols = symbols if symbols else ["AAPL", "MSFT", "GOOGL"]

    try:
        from Feature3.csv_analyzer import fetch_market_news
        raw = fetch_market_news(fetch_symbols)

        items = []
        for article in (raw.get("company") or [])[:10]:
            items.append({
                "headline": article.get("headline", ""),
                "summary": article.get("summary", ""),
                "source": article.get("source", ""),
                "url": article.get("url", ""),
                "datetime": article.get("datetime", 0),
                "related": article.get("related", ""),
                "image": article.get("image", ""),
            })
        for article in (raw.get("market") or [])[:5]:
            items.append({
                "headline": article.get("headline", ""),
                "summary": article.get("summary", ""),
                "source": article.get("source", ""),
                "url": article.get("url", ""),
                "datetime": article.get("datetime", 0),
                "related": "",
                "image": article.get("image", ""),
            })
        return {"items": items, "symbols": symbols, "fallback": fallback}
    except Exception as exc:
        print(f"[knowledge/news] Fetch failed (non-fatal): {exc}")
        return {"items": [], "symbols": symbols, "fallback": fallback}


@router.get("/user-context")
def get_user_context(user_id: str = DEMO_USER_ID, db: Session = Depends(get_db)):
    ctx = _aggregate_context(user_id, db)
    imported_count = (
        db.query(func.count(PFTransaction.id))
        .filter(PFTransaction.user_id == user_id)
        .scalar()
        or 0
    ) + (
        db.query(func.count(InvestmentHolding.id))
        .filter(InvestmentHolding.user_id == user_id)
        .scalar()
        or 0
    )
    return {
        "userId": user_id,
        "financialSnapshot": ctx.get("financial_snapshot", {}),
        "activeGoals": ctx.get("active_goals", []),
        "importedDataCount": imported_count,
    }
