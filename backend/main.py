import json
import re
from pathlib import Path
from typing import Optional
from fastapi import FastAPI, File, HTTPException, UploadFile, Depends, Body
from datetime import date as date_today, datetime, timezone
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from investments import router as investments_router
from knowledge import router as knowledge_router
from database import engine, Base, get_db
import models  # registers ORM models

from forecast import (
    load_sample_data,
    load_prophet_historical,
    project_forward,
    run_prophet_forecast,
    run_slider_forecast,
)

from upload_parser import parse_uploaded_financial_file
from contextLlamaTest import get_analysis, parse_output
from CsvDetectFull import detect_anomalies
from dotenv import load_dotenv
load_dotenv()
from sqlalchemy.orm import Session
from sqlalchemy import func
from uuid import uuid4
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from database import SessionLocal
import market_data

app = FastAPI(title="ElectraWireless Business Console API")

# Create all PF tables on startup if they don't already exist
Base.metadata.create_all(bind=engine)

# Idempotent migration: backfill new investment_onboarding_profiles columns on
# pre-existing SQLite DBs (create_all does not ALTER existing tables).
def _backfill_onboarding_columns() -> None:
    from sqlalchemy import inspect, text
    inspector = inspect(engine)
    if "investment_onboarding_profiles" not in inspector.get_table_names():
        return
    existing_cols = {c["name"] for c in inspector.get_columns("investment_onboarding_profiles")}
    to_add = [
        ("investment_strategies", "TEXT"),
        ("asset_interests",       "TEXT"),
        ("emergency_cash",        "INTEGER"),
        ("country",               "TEXT"),
    ]
    with engine.begin() as conn:
        for name, sqltype in to_add:
            if name not in existing_cols:
                conn.execute(text(f"ALTER TABLE investment_onboarding_profiles ADD COLUMN {name} {sqltype}"))


def _fix_holdings_id_type() -> None:
    """investment_holdings.id was historically created as INTEGER but the model
    now uses String (UUID). SQLite has no in-place type change, so when the
    column is INTEGER and the table is empty we drop + recreate so the schema
    matches; if it has rows we leave it and log a warning (user must clear
    holdings before the schema can be fixed)."""
    from sqlalchemy import inspect, text
    inspector = inspect(engine)
    if "investment_holdings" not in inspector.get_table_names():
        return
    id_col = next((c for c in inspector.get_columns("investment_holdings") if c["name"] == "id"), None)
    if not id_col or "INT" not in str(id_col["type"]).upper():
        return  # already String / TEXT

    with engine.begin() as conn:
        row_count = conn.execute(text("SELECT COUNT(*) FROM investment_holdings")).scalar() or 0
        if row_count > 0:
            print(f"[migration] investment_holdings.id is INTEGER but model expects String. "
                  f"{row_count} rows present — leaving as-is. Reset holdings to apply the fix.")
            return
        conn.execute(text("DROP TABLE investment_holdings"))

    # Recreate via SQLAlchemy with the correct String id type.
    models.InvestmentHolding.__table__.create(bind=engine)


def _migrate_financial_background_to_investment_capital() -> None:
    """Rename investment_onboarding_profiles.financial_background → investment_capital.
    Old rows stored low/moderate/high strings; map them to default dollar values so
    the column can be read as an integer after the rename."""
    from sqlalchemy import inspect, text
    inspector = inspect(engine)
    if "investment_onboarding_profiles" not in inspector.get_table_names():
        return
    cols = {c["name"] for c in inspector.get_columns("investment_onboarding_profiles")}
    if "investment_capital" in cols or "financial_background" not in cols:
        return  # fresh table or already migrated
    with engine.begin() as conn:
        conn.execute(text(
            "UPDATE investment_onboarding_profiles "
            "SET financial_background = CASE LOWER(financial_background) "
            "  WHEN 'low'      THEN '10000' "
            "  WHEN 'moderate' THEN '50000' "
            "  WHEN 'high'     THEN '200000' "
            "  ELSE financial_background END"
        ))
        conn.execute(text(
            "ALTER TABLE investment_onboarding_profiles "
            "RENAME COLUMN financial_background TO investment_capital"
        ))


_backfill_onboarding_columns()
_migrate_financial_background_to_investment_capital()
_fix_holdings_id_type()
def scheduled_price_refresh():
    """
    Called automatically by the scheduler every 15 min during market hours.
    Opens its own DB session since this runs outside a request context.
    """
    db = SessionLocal()
    try:
        print("[scheduler] Running scheduled price refresh...")
        result = market_data.refresh_all_prices(db)
        print(f"[scheduler] Done: {result}")
    finally:
        db.close()


# Start the background scheduler
scheduler = BackgroundScheduler()

scheduler.add_job(
    scheduled_price_refresh,
    trigger=CronTrigger(
        day_of_week="mon-fri",  # weekdays only — markets are closed on weekends
        hour="9-16",            # between 9am and 4pm
        minute="*/15",          # every 15 minutes
        timezone="Australia/Sydney"
    ),
)

scheduler.start()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten in production
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(investments_router)
app.include_router(knowledge_router)

class ForecastRequest(BaseModel):
    revenue: float = Field(..., description="Current monthly revenue ($)")
    expenses: float = Field(..., description="Current monthly expenses ($)")
    growth_rate: float = Field(0.05, description="Monthly revenue growth rate (0.05 = 5%)")
    cost_growth_rate: float = Field(0.02, description="Monthly expense growth rate")
    months: int = Field(12, ge=1, le=60, description="Months to project forward")
    what_if_annual_cost: float = Field(0.0, description="Optional extra annual cost (e.g. $80000 for a hire)")


class ForecastResponse(BaseModel):
    historical: list[dict]
    forecast: list[dict]


@app.get("/")
def root():
    return {"status": "ok", "message": "ElectraWireless Business Console API"}


@app.get("/sample-data")
def get_sample_data():
    """Returns the hardcoded historical demo data."""
    return {"data": load_sample_data()}


class ProphetForecastRequest(BaseModel):
    starting_mrr: float = Field(18000, description="Starting MRR for slider projection ($)")
    growth_rate: float = Field(8.0, description="Monthly revenue growth rate (%)")
    churn_rate: float = Field(3.0, description="Monthly churn rate (%)")
    cogs_percent: float = Field(22.0, description="COGS as % of revenue")
    marketing_spend: float = Field(4000.0, description="Monthly marketing spend ($)")
    payroll: float = Field(35000.0, description="Monthly payroll ($)")
    months: int = Field(12, ge=1, le=60, description="Months to forecast")


class ProphetForecastResponse(BaseModel):
    historical: list[dict]
    prophet_forecast: list[dict]
    slider_forecast: list[dict]


@app.post("/prophet-forecast", response_model=ProphetForecastResponse)
def prophet_forecast(req: ProphetForecastRequest):
    """
    Returns three data series for the chart:
    - historical: actual revenue/expenses from sample_data_prophet.csv
    - prophet_forecast: Prophet model baseline (or linear-trend fallback if Prophet not installed)
    - slider_forecast: compound-growth projection driven by the slider inputs
    """
    historical = load_prophet_historical()
    prophet = run_prophet_forecast(req.months)
    slider = run_slider_forecast(
        starting_mrr=req.starting_mrr,
        growth_rate=req.growth_rate,
        churn_rate=req.churn_rate,
        cogs_percent=req.cogs_percent,
        marketing_spend=req.marketing_spend,
        payroll=req.payroll,
        months=req.months,
    )
    return {"historical": historical, "prophet_forecast": prophet, "slider_forecast": slider}


class AnalyzeRequest(BaseModel):
    question: str
    use_web_context: bool = Field(False, description="Fetch live web context via DuckDuckGo before analysis")
    # User's current dashboard slider values — used to fetch real forecast context for ELLY
    starting_mrr:    float = Field(18000.0, description="Starting MRR ($)")
    growth_rate:     float = Field(8.0,     description="Monthly revenue growth rate (%)")
    churn_rate:      float = Field(3.0,     description="Monthly churn rate (%)")
    cogs_percent:    float = Field(22.0,    description="COGS as % of revenue")
    marketing_spend: float = Field(4000.0,  description="Monthly marketing spend ($)")
    payroll:         float = Field(35000.0, description="Monthly payroll ($)")
    months:          int   = Field(12,      description="Forecast horizon (months)")


@app.post("/analyze")
def analyze(req: AnalyzeRequest):
    """Run an AI what-if analysis via Groq, grounded in the user's real forecast data."""
    historical       = load_prophet_historical()
    prophet_forecast = run_prophet_forecast(req.months)
    slider_forecast  = run_slider_forecast(
        starting_mrr=req.starting_mrr,
        growth_rate=req.growth_rate,
        churn_rate=req.churn_rate,
        cogs_percent=req.cogs_percent,
        marketing_spend=req.marketing_spend,
        payroll=req.payroll,
        months=req.months,
    )
    current_params = {
        "starting_mrr":    req.starting_mrr,
        "growth_rate":     req.growth_rate,
        "churn_rate":      req.churn_rate,
        "cogs_percent":    req.cogs_percent,
        "marketing_spend": req.marketing_spend,
        "payroll":         req.payroll,
        "months":          req.months,
    }

    # Fetch live market data and news for any tickers mentioned in the question
    market_context = {}
    if req.question:
        try:
            tickers = detect_tickers(req.question)
            if tickers:
                ticker_data = {}
                for sym in tickers[:5]:
                    td = fetch_ticker_data(sym)
                    if td:
                        ticker_data[sym] = td
                if ticker_data:
                    market_context["ticker_data"] = ticker_data

                amount, hyp_ticker = parse_hypothetical(req.question)
                if amount and hyp_ticker:
                    td = market_context.get("ticker_data", {}).get(hyp_ticker) or fetch_ticker_data(hyp_ticker)
                    if td:
                        years_match = re.search(r'(\d+)', str(req.months))
                        years       = float(years_match.group(1)) / 12 if years_match else 1.0
                        projection  = project_investment_cagr(hyp_ticker, amount, years, td)
                        if projection:
                            market_context["hypothetical_projection"] = projection

                news = fetch_market_news(tickers[:5])
                if news.get("company") or news.get("market"):
                    market_context["news"] = news
        except Exception as e:
            print(f"[csv_analyzer] /analyze enrichment failed (non-fatal): {e}")

    analysis = get_analysis(req.question, historical, prophet_forecast, slider_forecast, current_params, market_context or None)
    return parse_output(analysis)


# ── Anomaly detection (Quinn's CsvDetect) ────────────────────────────────────

class DetectAnomaliesRequest(BaseModel):
    cell_map: dict = Field(..., description="Frontend cell map: cellId → {value, formula, sheetIndex, rowIndex, colIndex}")
    sheet_index: int = Field(0, description="Which sheet to analyse (0-based)")


@app.post("/detect-anomalies")
def detect_anomalies_endpoint(req: DetectAnomaliesRequest):
    """
    Run IsolationForest anomaly detection + RandomForestRegressor prediction
    on numeric columns of the uploaded spreadsheet.
    Returns flagged cell IDs with original values, predicted values, and severity.
    """
    return detect_anomalies(req.cell_map, req.sheet_index)


@app.post("/forecast", response_model=ForecastResponse)
def forecast(req: ForecastRequest):
    """
    Projects revenue, expenses, and profit forward using compound growth.
    Also returns the historical sample data so the frontend can render
    both history and forecast on a single chart.
    """
    historical = load_sample_data()
    projected = project_forward(
        revenue=req.revenue,
        expenses=req.expenses,
        growth_rate=req.growth_rate,
        cost_growth_rate=req.cost_growth_rate,
        months=req.months,
        what_if_annual_cost=req.what_if_annual_cost,
    )
    return {"historical": historical, "forecast": projected}


@app.post("/upload-financial-data")
async def upload_financial_data(file: UploadFile = File(...)):
    try:
        if not file.filename:
            raise HTTPException(status_code=400, detail="No file uploaded")
        
        content = await file.read()
        result = parse_uploaded_financial_file(file.filename, content)
        return result
    
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    
    except Exception as e:
        raise HTTPException(
            status_code=500, 
            detail=f"An error occurred while processing the file: {str(e)}")
    
@app.post("/pf/transactions/upload")
async def upload_pf_transactions(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    content = await file.read()
    parsed = parse_uploaded_financial_file(file.filename, content)

    records = parsed.get("normalized_data", {}).get("records", [])
    saved = []

    for row in records:
        amount = row.get("amount") or row.get("revenue") or row.get("expenses") or row.get("sales")
        if amount is None:
            continue

        amount = float(amount)
        transaction_type = "income" if amount >= 0 else "expense"

        transaction = models.PFTransaction(
            id=str(uuid4()),
            user_id="demo-user",
            date=str(row.get("date") or ""),
            description=str(row.get("description") or "Imported transaction"),
            amount=abs(amount),
            type=transaction_type,
            category=str(row.get("category") or "Uncategorised"),
            source="csv",
        )

        db.add(transaction)
        saved.append(transaction)

    db.commit()

    return {
        "parsed_successfully": parsed.get("parsed_successfully"),
        "imported_count": len(saved),
    }

@app.get("/pf/transactions")
def get_pf_transactions(db: Session = Depends(get_db)):
    return db.query(models.PFTransaction).all()

@app.get("/pf/summary")
def get_pf_summary(db: Session = Depends(get_db)):
    transactions = db.query(models.PFTransaction).all()

    income = sum(t.amount for t in transactions if t.type == "income")
    expenses = sum(t.amount for t in transactions if t.type == "expense")
    net = income - expenses

    savings_rate = (net / income * 100) if income else 0

    # Simple health score logic
    health_score = 50
    if savings_rate > 20:
        health_score += 30
    elif savings_rate > 10:
        health_score += 20
    elif savings_rate < 0:
        health_score -= 30

    health_score = max(0, min(100, int(health_score)))

    snapshot = models.PFSnapshot(
        user_id="demo-user",
        health_score=health_score,
        savings_rate=savings_rate,
        cashflow_balance=net,
    )

    db.add(snapshot)
    db.commit()

    return {
        "income": income,
        "expenses": expenses,
        "net_cash_flow": net,
        "savings_rate": savings_rate,
        "health_score": health_score,
    }

@app.get("/pf/insights")
def get_pf_insights(db: Session = Depends(get_db)):
    transactions = db.query(models.PFTransaction).all()
    budgets = db.query(models.PFBudget).all()

    income = sum(t.amount for t in transactions if t.type == "income")
    expenses = sum(t.amount for t in transactions if t.type == "expense")

    insights = []

    if expenses > income:
        insights.append("You are spending more than you earn")

    if income > 0:
        savings_rate = ((income - expenses) / income) * 100
        if savings_rate < 10:
            insights.append("Savings rate is below 10%")

    for budget in budgets:
        category_spend = sum(
            t.amount for t in transactions
            if t.type == "expense" and t.category == budget.category
        )

        if category_spend > budget.budget_amount:
            insights.append(f"Over budget in {budget.category}")

    return insights

class BudgetRequest(BaseModel):
    category: str
    budget_amount: float
    period: str = "monthly"


@app.post("/pf/budgets")
def create_budget(req: BudgetRequest, db: Session = Depends(get_db)):
    existing = db.query(models.PFBudget).filter(
        models.PFBudget.user_id == "demo-user",
        models.PFBudget.category == req.category
    ).first()

    if existing:
        existing.budget_amount = req.budget_amount
        existing.period = req.period
    else:
        budget = models.PFBudget(
            user_id="demo-user",
            category=req.category,
            budget_amount=req.budget_amount,
            period=req.period,
        )
        db.add(budget)

    db.commit()
    return {"status": "success"}

@app.get("/pf/budgets")
def get_budgets(db: Session = Depends(get_db)):
    return db.query(models.PFBudget).all()


# ── Phase 2: Investment Holdings ─────────────────────────────────────────────

class HoldingCreate(BaseModel):
    symbol:        str
    asset_type:    str    # stock | crypto | etf | fund | real_estate
    quantity:      float
    buy_price:     float
    purchase_date: str    # ISO yyyy-mm-dd


@app.post("/investments/holdings", status_code=201)
def create_holding(req: HoldingCreate, db: Session = Depends(get_db)):
    holding = models.InvestmentHolding(
        id=str(uuid4()),
        user_id="demo-user",
        symbol=req.symbol.upper().strip(),
        asset_type=req.asset_type.strip().lower(),
        quantity=req.quantity,
        buy_price=req.buy_price,
        purchase_date=req.purchase_date,
        source="manual",
    )
    db.add(holding)
    db.commit()
    db.refresh(holding)
    return holding


@app.get("/investments/holdings")
def get_holdings(db: Session = Depends(get_db)):
    return db.query(models.InvestmentHolding).filter(
        models.InvestmentHolding.user_id == "demo-user"
    ).order_by(models.InvestmentHolding.created_at.desc()).all()


@app.delete("/investments/holdings/{holding_id}", status_code=204)
def delete_holding(holding_id: str, db: Session = Depends(get_db)):
    holding = db.query(models.InvestmentHolding).filter(
        models.InvestmentHolding.id == holding_id,
        models.InvestmentHolding.user_id == "demo-user",
    ).first()
    if not holding:
        raise HTTPException(status_code=404, detail="Holding not found")
    db.delete(holding)
    db.commit()


@app.delete("/investments/holdings", status_code=204)
def clear_all_holdings(db: Session = Depends(get_db)):
    db.query(models.InvestmentHolding).filter(
        models.InvestmentHolding.user_id == "demo-user"
    ).delete()
    db.commit()


@app.post("/investments/holdings/upload")
async def upload_holdings_csv(file: UploadFile = File(...), db: Session = Depends(get_db)):
    import pandas as pd
    import io

    if not (file.filename or "").lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are accepted")

    content = await file.read()
    try:
        df = pd.read_csv(io.BytesIO(content))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse CSV: {e}")

    df.columns = [str(c).strip().lower() for c in df.columns]

    required = {"symbol", "asset_type", "quantity", "buy_price"}
    missing = required - set(df.columns)
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"Missing required columns: {', '.join(sorted(missing))}. "
                   f"Expected: symbol, asset_type, quantity, buy_price, purchase_date (optional)",
        )

    saved, errors = [], []
    for i, row in df.iterrows():
        try:
            holding = models.InvestmentHolding(
                id=str(uuid4()),
                user_id="demo-user",
                symbol=str(row["symbol"]).upper().strip(),
                asset_type=str(row["asset_type"]).strip().lower(),
                quantity=float(row["quantity"]),
                buy_price=float(row["buy_price"]),
                purchase_date=str(row.get("purchase_date", date_today.today())).strip(),
                source="csv",
            )
            db.add(holding)
            saved.append(holding.symbol)
        except Exception as e:
            errors.append(f"Row {int(i) + 2}: {e}")

    db.commit()
    return {"imported": len(saved), "symbols": saved, "errors": errors}


# ── Feature 3: Investment Insights (rule-based, no live prices needed) ────────

@app.get("/investments/insights")
def get_investment_insights(db: Session = Depends(get_db)):
    holdings = db.query(models.InvestmentHolding).filter(
        models.InvestmentHolding.user_id == "demo-user"
    ).all()

    if not holdings:
        return []

    total = sum(h.quantity * h.buy_price for h in holdings)
    if total == 0:
        return []

    insights = []

    # Per-symbol overexposure
    symbol_map: dict[str, float] = {}
    for h in holdings:
        symbol_map[h.symbol] = symbol_map.get(h.symbol, 0) + h.quantity * h.buy_price

    for symbol, value in sorted(symbol_map.items(), key=lambda x: -x[1]):
        pct = value / total * 100
        if pct > 40:
            insights.append({
                "type": "Overexposure",
                "message": f"{symbol} makes up {pct:.1f}% of your portfolio. Concentrated positions amplify both gains and losses.",
                "severity": "high",
                "affected": [symbol],
            })
        elif pct > 30:
            insights.append({
                "type": "Concentrated Position",
                "message": f"{symbol} represents {pct:.1f}% of your portfolio. Consider whether this aligns with your risk tolerance.",
                "severity": "medium",
                "affected": [symbol],
            })

    # Crypto concentration
    crypto_value = sum(h.quantity * h.buy_price for h in holdings if h.asset_type == "crypto")
    crypto_pct = crypto_value / total * 100
    if crypto_pct > 50:
        insights.append({
            "type": "Crypto Concentration",
            "message": f"{crypto_pct:.1f}% of your portfolio is in crypto — a highly volatile asset class. Consider diversifying into more stable instruments.",
            "severity": "high",
            "affected": list({h.symbol for h in holdings if h.asset_type == "crypto"}),
        })
    elif crypto_pct > 30:
        insights.append({
            "type": "Crypto Concentration",
            "message": f"{crypto_pct:.1f}% of your portfolio is in crypto assets. High volatility class — review your risk horizon.",
            "severity": "medium",
            "affected": list({h.symbol for h in holdings if h.asset_type == "crypto"}),
        })

    # Low diversification (< 4 distinct symbols)
    n_symbols = len(symbol_map)
    if n_symbols < 4:
        insights.append({
            "type": "Low Diversification",
            "message": f"Your portfolio holds only {n_symbols} distinct asset{'s' if n_symbols != 1 else ''}. Broader diversification reduces unsystematic risk.",
            "severity": "high" if n_symbols <= 2 else "medium",
            "affected": list(symbol_map.keys()),
        })

    # Single asset-type dominance (> 80%)
    type_map: dict[str, float] = {}
    for h in holdings:
        type_map[h.asset_type] = type_map.get(h.asset_type, 0) + h.quantity * h.buy_price
    type_labels = {"stock": "Stocks", "crypto": "Crypto", "etf": "ETFs", "fund": "Funds", "real_estate": "Real Estate"}
    for atype, value in type_map.items():
        pct = value / total * 100
        if pct > 80:
            insights.append({
                "type": "Asset Type Concentration",
                "message": f"{pct:.1f}% of your portfolio is in {type_labels.get(atype, atype)}. Spreading across asset classes reduces correlation risk.",
                "severity": "medium",
                "affected": list({h.symbol for h in holdings if h.asset_type == atype}),
            })

    # No ETF or fund exposure
    if not any(h.asset_type in ("etf", "fund") for h in holdings):
        insights.append({
            "type": "No Index / Fund Exposure",
            "message": "Portfolio contains no ETFs or mutual funds. Adding broad-market index exposure can reduce volatility without sacrificing long-term returns.",
            "severity": "low",
            "affected": [],
        })

    # Clean bill of health
    if not insights:
        insights.append({
            "type": "Portfolio Looks Balanced",
            "message": f"No significant concentration risks detected across your {n_symbols} holdings. Keep reviewing as positions shift.",
            "severity": "info",
            "affected": [],
        })

    return insights


# ── Feature 2 AI Insights ─────────────────────────────────────────────────────

from Feature2.F2Insights import build_finance_prompt, get_analysis, parse_llm_output


@app.post("/pf/ai-insights")
def ai_insights(req: dict = Body(...)):
    prompt = build_finance_prompt(req)
    raw = get_analysis(prompt)
    return parse_llm_output(raw)


# ── Feature 3 AI Insights (Portfolio Analysis) ────────────────────────────────

from Feature3.F3Insights import run_analysis as run_portfolio_analysis
from Feature3.F3Insight_memory import store_memories_batch, retrieve_memories_by_intent
# /analyze (above) does its own lightweight market enrichment via csv_analyzer.
# /pf/portfolio-analysis runs the full pipeline through F3Insights, which also
# sources its market data from csv_analyzer — market_research is no longer used.
from Feature3.csv_analyzer import (
    detect_tickers,
    fetch_ticker_data,
    parse_hypothetical,
    project_investment_cagr,
    fetch_market_news,
)


def _build_profile_context(onboarding: dict) -> str:
    """Compose a deterministic one-liner summary of the user's onboarding profile
    so the literal values are always visible in the AI response, regardless of
    whether the LLM referenced them in its narrative."""
    if not onboarding or not onboarding.get("available"):
        return ""
    parts: list[str] = []
    age = onboarding.get("age")
    if age:
        parts.append(f"Age {age}")
    exp = onboarding.get("experienceLevel")
    if exp:
        parts.append(f"{exp} investor")
    cap = onboarding.get("investmentCapital")
    if cap is not None:
        try:
            parts.append(f"${int(cap):,} capital")
        except (TypeError, ValueError):
            pass
    cash = onboarding.get("emergencyCash")
    if cash is not None:
        try:
            parts.append(f"${int(cash):,} emergency cash")
        except (TypeError, ValueError):
            pass
    horizon = onboarding.get("timeHorizon")
    if horizon:
        parts.append(f"{horizon} horizon")
    strategies = onboarding.get("investmentStrategies") or []
    if strategies:
        parts.append(f"strategy: {', '.join(strategies)}")
    interests = onboarding.get("assetInterests") or []
    if interests:
        parts.append(f"interested in: {', '.join(interests)}")
    style = onboarding.get("communicationStyle")
    if style:
        parts.append(f"prefers {style} explanations")
    country = onboarding.get("country")
    if country:
        parts.append(f"based in {country}")
    return " · ".join(parts)


def _answer_profile_question(question: str, onboarding: dict) -> Optional[str]:
    """For direct lookups like "what is my X", return the literal onboarding value
    so a small LLM can't reinterpret factual questions as portfolio summaries.

    Returns None when the question isn't a recognised profile lookup, so the
    LLM's own answer is used."""
    if not question or not onboarding or not onboarding.get("available"):
        return None

    q = question.lower().strip().rstrip("?").strip()
    # Require a clear "my <field>" framing to avoid false positives on
    # portfolio questions (e.g. "what is my portfolio worth").
    if "my " not in q:
        return None

    # (matchers, formatter) — matchers are checked as substrings against the
    # lowercased question; first matching field wins.
    fields = [
        (("experience level", "experience"), lambda v: f"Your experience level is {v}."),
        (("investment capital", "capital", "net worth"),
            lambda v: f"Your stated investment capital is ${int(v):,}."),
        (("emergency cash", "cash cushion", "cushion", "emergency fund"),
            lambda v: f"Your stated emergency cash is ${int(v):,}."),
        (("age",),                       lambda v: f"You're {v} years old."),
        (("communication style", "tone"),lambda v: f"Your preferred communication style is {v}."),
        (("investment strategies", "strategies", "strategy"),
            lambda v: f"Your stated investment strategies are: {', '.join(v) if isinstance(v, list) else v}."),
        (("time horizon", "horizon"),    lambda v: f"Your time horizon is {v}."),
        (("asset interests", "interests", "asset classes"),
            lambda v: f"Your asset interests are: {', '.join(v) if isinstance(v, list) else v}."),
    ]
    key_map = {
        "experience level":     "experienceLevel",
        "experience":           "experienceLevel",
        "investment capital":   "investmentCapital",
        "capital":              "investmentCapital",
        "net worth":            "investmentCapital",
        "emergency cash":       "emergencyCash",
        "cash cushion":         "emergencyCash",
        "cushion":              "emergencyCash",
        "emergency fund":       "emergencyCash",
        "age":                  "age",
        "communication style":  "communicationStyle",
        "tone":                 "communicationStyle",
        "investment strategies":"investmentStrategies",
        "strategies":           "investmentStrategies",
        "strategy":             "investmentStrategies",
        "time horizon":         "timeHorizon",
        "horizon":              "timeHorizon",
        "asset interests":      "assetInterests",
        "interests":            "assetInterests",
        "asset classes":        "assetInterests",
    }

    for matchers, fmt in fields:
        for m in matchers:
            if m in q:
                value = onboarding.get(key_map[m])
                if value in (None, "", []):
                    return None
                return fmt(value)
    return None


@app.post("/pf/portfolio-analysis")
def portfolio_analysis(req: dict = Body(...), db: Session = Depends(get_db)):
    data          = req.get("data", {}) or {}
    user_question = (data.get("question") or "").strip() or None

    # Refresh live prices then enrich holdings in the payload with current_price / P&L
    try:
        market_data.refresh_all_prices(db)
        holdings_in = data.get("holdings", [])
        if holdings_in:
            symbols = list({h["symbol"].upper() for h in holdings_in if h.get("symbol")})
            price_rows = db.query(models.MarketPrice).filter(
                models.MarketPrice.symbol.in_(symbols)
            ).all()
            price_map = {row.symbol: row.current_price for row in price_rows if row.current_price}
            for h in holdings_in:
                sym = h.get("symbol", "").upper()
                cp  = price_map.get(sym)
                if cp is not None:
                    qty          = h.get("quantity", 0)
                    cost         = h.get("costBasis") or (qty * h.get("buy_price", 0))
                    cur_val      = qty * cp
                    pnl          = cur_val - cost
                    h["current_price"]     = cp
                    h["current_value"]     = round(cur_val, 2)
                    h["profit_loss"]       = round(pnl, 2)
                    h["return_percentage"] = round((pnl / cost * 100) if cost else 0, 2)
            summary_in = data.get("summary", {})
            total_current = sum(
                (h.get("current_value") or h.get("costBasis") or 0) for h in holdings_in
            )
            total_cost = summary_in.get("totalCost", 0)
            summary_in["totalCurrentValue"] = round(total_current, 2)
            summary_in["totalPnL"]          = round(total_current - total_cost, 2)
            summary_in["totalReturnPct"]    = round(
                ((total_current - total_cost) / total_cost * 100) if total_cost else 0, 2
            )
    except Exception as e:
        print(f"[prices] Refresh/enrich failed (non-fatal): {e}")

    # Make the user's question visible to F3Insights (it reads data["question"]
    # for intent extraction + enrichment routing).
    if user_question and "question" not in data:
        data["question"] = user_question

    # Conversation history — passed from EllyChat so the LLM has prior context.
    history = data.pop("history", None) or []
    if history:
        data["history"] = history

    # Retrieve relevant past memories before running the analysis pipeline.
    memories = []
    if user_question:
        try:
            memories = retrieve_memories_by_intent(user_question, intent="general", n_results=3)
        except Exception as e:
            print(f"[memory] Retrieval failed (non-fatal): {e}")

    # F3Insights owns the full portfolio analysis pipeline now: market_context
    # (ticker_data / hypothetical / historical) + geographic_exposure via
    # csv_analyzer, intent extraction, Finnhub news, yfinance snapshot, Prophet
    # projections, prompt build, Groq call, parse, memory store.
    result = run_portfolio_analysis(data, memories=memories)

    onboarding_payload = data.get("onboarding") or {}

    # Always surface the user's profile in the response so the literal onboarding
    # values are visible even when the LLM doesn't weave them into the narrative.
    result["profile_context"] = _build_profile_context(onboarding_payload)

    # Force "onboarding" into sources when an onboarding profile was available —
    # the LLM frequently forgets to list it even when it shaped the response.
    if onboarding_payload.get("available"):
        sources = result.get("sources") or []
        if not any("onboard" in (s or "").lower() for s in sources):
            sources.append("onboarding")
            result["sources"] = sources

    # Deterministic override for direct profile lookups — the 8b LLM otherwise
    # tends to answer "what is my <profile field>" with a portfolio summary.
    if user_question:
        profile_answer = _answer_profile_question(user_question, onboarding_payload)
        if profile_answer:
            result["question_response"] = profile_answer

    # Store this exchange in memory after responding
    if user_question:
        try:
            response_text = result.get("question_response") or result.get("summary") or ""
            store_memories_batch([{
                "user":      user_question,
                "assistant": response_text,
                "section":   "general",
            }])
        except Exception as e:
            print(f"[memory] Store failed (non-fatal): {e}")

    return result


# ── Users ─────────────────────────────────────────────────────────────────────

class UserCreateRequest(BaseModel):
    account_type: str   # user | industry | government


@app.post("/users", status_code=201)
def create_user(req: UserCreateRequest, db: Session = Depends(get_db)):
    user = models.User(
        id=str(uuid4()),
        account_type=req.account_type,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return {"id": user.id, "account_type": user.account_type}


@app.get("/users/{user_id}")
def get_user(user_id: str, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


# ── Feature 3: Investment Onboarding ──────────────────────────────────────────

FEATURE_3_INPUT_PATH = Path(__file__).parent / "Llama Input" / "Feature_3_input.json"


class InvestmentOnboardingRequest(BaseModel):
    age:                  int
    experienceLevel:      str            # beginner | intermediate | advanced
    investmentCapital:    int            # dollar amount, 0 – 500,000
    emergencyCash:        int            # dollar amount, 0 – 200,000; cash held outside the portfolio
    communicationStyle:   str            # simple | technical
    investmentStrategies: list[str]      # subset of: day_trading | index | growth | income | buy_and_hold | dollar_cost_average
    timeHorizon:          str            # daily | weekly | monthly | annually | indefinitely
    assetInterests:       list[str]      # subset of: stock | crypto | etf
    investmentGoal:       Optional[str] = None   # legacy single-goal field; optional
    country:              Optional[str] = None   # user's home country for domestic stock suggestions
    user_id:              str = "demo-user"


ONBOARDING_RESET_STATE = {
    "available":            False,
    "age":                  30,
    "experienceLevel":      "beginner",
    "investmentCapital":    50000,
    "emergencyCash":        10000,
    "communicationStyle":   "simple",
    "investmentStrategies": ["buy_and_hold"],
    "timeHorizon":          "monthly",
    "assetInterests":       ["stock", "crypto", "etf"],
    "completedAt":          None,
}


def _onboarding_record(req: InvestmentOnboardingRequest, completed_at: str) -> dict:
    """Shape of the onboarding object persisted to Feature_3_input.json."""
    record = {
        "available":            True,
        "age":                  req.age,
        "experienceLevel":      req.experienceLevel,
        "investmentCapital":    req.investmentCapital,
        "emergencyCash":        req.emergencyCash,
        "communicationStyle":   req.communicationStyle,
        "investmentStrategies": req.investmentStrategies,
        "timeHorizon":          req.timeHorizon,
        "assetInterests":       req.assetInterests,
        "completedAt":          completed_at,
    }
    if req.country:
        record["country"] = req.country
    return record


@app.post("/investments/onboarding")
def submit_investment_onboarding(req: InvestmentOnboardingRequest, db: Session = Depends(get_db)):
    completed_at = datetime.now(timezone.utc).isoformat()
    strategies_json = json.dumps(req.investmentStrategies)
    interests_json  = json.dumps(req.assetInterests)

    existing = db.query(models.InvestmentOnboardingProfile).filter(
        models.InvestmentOnboardingProfile.user_id == req.user_id
    ).first()

    if existing:
        existing.age                   = req.age
        existing.experience_level      = req.experienceLevel
        existing.investment_capital    = req.investmentCapital
        existing.emergency_cash        = req.emergencyCash
        existing.communication_style   = req.communicationStyle
        existing.investment_strategies = strategies_json
        existing.time_horizon          = req.timeHorizon
        existing.asset_interests       = interests_json
        if req.country is not None:
            existing.country           = req.country
        # Only overwrite investment_goal when the client explicitly sent one;
        # the column is NOT NULL on legacy DBs, so writing None here would fail.
        if req.investmentGoal is not None:
            existing.investment_goal = req.investmentGoal
    else:
        # Backfill the legacy NOT NULL column with the first chosen strategy
        # (or "balanced") so inserts succeed even when the form no longer asks
        # for a single goal.
        legacy_goal = req.investmentGoal or (req.investmentStrategies[0] if req.investmentStrategies else "balanced")
        profile = models.InvestmentOnboardingProfile(
            user_id               = req.user_id,
            age                   = req.age,
            experience_level      = req.experienceLevel,
            investment_capital    = req.investmentCapital,
            emergency_cash        = req.emergencyCash,
            communication_style   = req.communicationStyle,
            investment_goal       = legacy_goal,
            investment_strategies = strategies_json,
            time_horizon          = req.timeHorizon,
            asset_interests       = interests_json,
            country               = req.country,
        )
        db.add(profile)

    db.commit()

    record = _onboarding_record(req, completed_at)

    # Mirror to JSON so the Llama prompt builder still has it.
    try:
        with FEATURE_3_INPUT_PATH.open("r", encoding="utf-8") as f:
            data = json.load(f)
        data["onboarding"] = record
        with FEATURE_3_INPUT_PATH.open("w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
    except Exception:
        pass  # non-fatal — DB is the source of truth

    return {"status": "ok", "user_id": req.user_id, "onboarding": record}


@app.get("/investments/onboarding")
def get_investment_onboarding_json():
    """Legacy file-backed read used by the frontend's fetchInvestmentOnboarding()."""
    try:
        with FEATURE_3_INPUT_PATH.open("r", encoding="utf-8") as f:
            data = json.load(f)
    except FileNotFoundError:
        return {"available": False}
    return data.get("onboarding", {"available": False})


@app.delete("/investments/onboarding")
def reset_investment_onboarding(db: Session = Depends(get_db), user_id: str = "demo-user"):
    """Clear the persisted onboarding profile for a user and reset the JSON mirror."""
    db.query(models.InvestmentOnboardingProfile).filter(
        models.InvestmentOnboardingProfile.user_id == user_id
    ).delete()
    db.commit()

    try:
        with FEATURE_3_INPUT_PATH.open("r", encoding="utf-8") as f:
            data = json.load(f)
        data["onboarding"] = dict(ONBOARDING_RESET_STATE)
        with FEATURE_3_INPUT_PATH.open("w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
    except Exception:
        pass

    return {"status": "ok", "onboarding": dict(ONBOARDING_RESET_STATE)}


@app.get("/investments/onboarding/{user_id}")
def get_investment_onboarding_by_user(user_id: str, db: Session = Depends(get_db)):
    profile = db.query(models.InvestmentOnboardingProfile).filter(
        models.InvestmentOnboardingProfile.user_id == user_id
    ).first()
    if not profile:
        raise HTTPException(status_code=404, detail="No onboarding profile found")

    return {
        "user_id":               profile.user_id,
        "age":                   profile.age,
        "experience_level":      profile.experience_level,
        "investment_capital":    profile.investment_capital,
        "emergency_cash":        profile.emergency_cash,
        "communication_style":   profile.communication_style,
        "investment_goal":       profile.investment_goal,
        "investment_strategies": json.loads(profile.investment_strategies) if profile.investment_strategies else [],
        "time_horizon":          profile.time_horizon,
        "asset_interests":       json.loads(profile.asset_interests) if profile.asset_interests else [],
        "completed_at":          profile.completed_at.isoformat() if profile.completed_at else None,
    }


# ── Feature 1: Forecast Config ────────────────────────────────────────────────

class ForecastConfigRequest(BaseModel):
    starting_mrr:    float
    growth_rate:     float
    churn_rate:      float
    cogs_percent:    float
    marketing_spend: float
    payroll:         float
    months:          int
    user_id:         str = "demo-user"


@app.post("/forecast/config")
def save_forecast_config(req: ForecastConfigRequest, db: Session = Depends(get_db)):
    existing = db.query(models.ForecastConfig).filter(
        models.ForecastConfig.user_id == req.user_id
    ).first()

    if existing:
        existing.starting_mrr    = req.starting_mrr
        existing.growth_rate     = req.growth_rate
        existing.churn_rate      = req.churn_rate
        existing.cogs_percent    = req.cogs_percent
        existing.marketing_spend = req.marketing_spend
        existing.payroll         = req.payroll
        existing.months          = req.months
    else:
        config = models.ForecastConfig(
            user_id         = req.user_id,
            starting_mrr    = req.starting_mrr,
            growth_rate     = req.growth_rate,
            churn_rate      = req.churn_rate,
            cogs_percent    = req.cogs_percent,
            marketing_spend = req.marketing_spend,
            payroll         = req.payroll,
            months          = req.months,
        )
        db.add(config)

    db.commit()
    return {"status": "ok", "user_id": req.user_id}


@app.get("/forecast/config/{user_id}")
def get_forecast_config(user_id: str, db: Session = Depends(get_db)):
    config = db.query(models.ForecastConfig).filter(
        models.ForecastConfig.user_id == user_id
    ).first()
    if not config:
        raise HTTPException(status_code=404, detail="No forecast config found")
    return config
