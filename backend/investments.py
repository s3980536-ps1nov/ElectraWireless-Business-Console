"""
Feature 3 — Investment Intelligence
Router: /investments/*
Owner: Nishant

Phases covered in this file:
  Phase 1  — route scaffold
  Phase 2  — holdings CRUD (Abdullah fills these in)
  Phase 3  — market data (Nishant fills these in)
  Phase 4  — portfolio analytics (Cole fills these in)
  Phase 6  — insights engine
"""

import csv
import io
import uuid
import math
import random
from datetime import date, timedelta
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from pydantic import BaseModel
from database import get_db
import models
import market_data
from portfolio_analytics import (
    calculate_portfolio_summary,
    compute_allocation,
    calculate_diversification_score,
)

DEMO_PORTFOLIO_PATH = Path(__file__).parent / "Sample_data" / "demo_portfolio.csv"

router = APIRouter(prefix="/investments", tags=["Investments"])


class ManualPriceRequest(BaseModel):
    symbol: str        # e.g. "SYDPROPERTY" or "BTC"
    current_price: float  # manually entered price



# ── Holdings ──────────────────────────────────────────────────────────────────

@router.get("/holdings")
def get_holdings(db: Session = Depends(get_db)):
    """Return all holdings for the logged-in user. (Phase 2 — Abdullah)"""
    return db.query(models.InvestmentHolding).filter(
        models.InvestmentHolding.user_id == "demo-user"
    ).all()


@router.post("/holdings")
def add_holding(db: Session = Depends(get_db)):
    """Manually add a holding. (Phase 2 — Abdullah)"""
    return {"message": "TODO — Phase 2"}


@router.delete("/holdings/{holding_id}")
def delete_holding(holding_id: int, db: Session = Depends(get_db)):
    """Delete a holding by ID. (Phase 2 — Abdullah)"""
    return {"message": f"TODO — Phase 2, id={holding_id}"}


@router.delete("/holdings")
def delete_all_holdings(db: Session = Depends(get_db)):
    """Clear all holdings and related data for the demo user."""
    db.query(models.InvestmentHolding).filter(
        models.InvestmentHolding.user_id == "demo-user"
    ).delete()
    db.query(models.PortfolioSnapshot).filter(
        models.PortfolioSnapshot.user_id == "demo-user"
    ).delete()
    db.query(models.MarketPrice).delete()
    db.commit()
    return {"message": "All investment data cleared"}


def _ingest_holdings_csv(contents: str, db: Session) -> dict:
    """Parse CSV text and insert rows as holdings for the demo user.

    Replaces any previously CSV-imported holdings so re-imports overwrite
    rather than append. Shared by /holdings/upload and /holdings/load-demo.
    """
    db.query(models.InvestmentHolding).filter(
        models.InvestmentHolding.user_id == "demo-user",
        models.InvestmentHolding.source  == "csv",
    ).delete()
    db.commit()

    reader = csv.DictReader(io.StringIO(contents))
    required = {"symbol", "asset_type", "quantity", "buy_price"}
    imported = 0
    symbols: list[str] = []
    errors: list[str] = []

    for i, raw_row in enumerate(reader, start=2):
        row = {k.strip().lower(): v.strip() for k, v in raw_row.items() if k}
        missing = required - row.keys()
        if missing:
            errors.append(f"Row {i}: missing columns {missing}")
            continue
        try:
            holding = models.InvestmentHolding(
                id=            str(uuid.uuid4()),
                user_id=       "demo-user",
                symbol=        row["symbol"].upper(),
                asset_type=    row["asset_type"].lower(),
                quantity=      float(row["quantity"]),
                buy_price=     float(row["buy_price"]),
                purchase_date= row.get("purchase_date") or None,
                source=        "csv",
            )
            db.add(holding)
            symbols.append(holding.symbol)
            imported += 1
        except ValueError as e:
            errors.append(f"Row {i}: {e}")

    db.commit()

    if symbols:
        market_data.refresh_all_prices(db)

    return {"imported": imported, "symbols": symbols, "errors": errors}


@router.post("/holdings/upload")
def upload_holdings_csv(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """CSV bulk import of holdings. Replaces any previously CSV-imported holdings.
    Required columns: symbol, asset_type, quantity, buy_price. Optional: purchase_date."""
    contents = file.file.read().decode("utf-8")
    return _ingest_holdings_csv(contents, db)


@router.post("/holdings/load-demo")
def load_demo_holdings(db: Session = Depends(get_db)):
    """Seed the demo user's portfolio from Sample_data/demo_portfolio.csv.
    Used when the user skips CSV import during onboarding."""
    if not DEMO_PORTFOLIO_PATH.exists():
        raise HTTPException(status_code=500, detail="demo_portfolio.csv not found on server")
    contents = DEMO_PORTFOLIO_PATH.read_text(encoding="utf-8")
    return _ingest_holdings_csv(contents, db)


# ── Market-wide Movers ────────────────────────────────────────────────────────

@router.get("/market-movers")
def get_market_movers():
    """Top 3 gainers and losers from a curated market watchlist. Cached 15 min."""
    return market_data.fetch_market_movers()


# ── Market Prices ─────────────────────────────────────────────────────────────

@router.get("/prices")
def get_prices(db: Session = Depends(get_db)):
    """Return latest cached market prices for all symbols in holdings."""
    return db.query(models.MarketPrice).all()


@router.post("/prices/refresh")
def refresh_prices(db: Session = Depends(get_db)):
    """
    Manually trigger a price refresh for all symbols in holdings.
    The scheduler also calls this automatically every 15 min.
    """
    result = market_data.refresh_all_prices(db)
    return result


# ── Portfolio Summary & Allocation ────────────────────────────────────────────

def _holding_to_dict(h, price_map: dict) -> dict:
    """
    Convert an InvestmentHolding ORM row to a plain dict for analytics.
    Resolves current_price from the MarketPrice table (price_map).
    Falls back to None if the symbol has no price yet — analytics will
    use buy_price as a fallback so nothing crashes.
    """
    return {
        "id":            h.id,
        "user_id":       h.user_id,
        "symbol":        h.symbol,
        "asset_type":    h.asset_type,
        "quantity":      h.quantity,
        "buy_price":     h.buy_price,
        "purchase_date": h.purchase_date,
        "current_price": price_map.get(h.symbol.upper()),
    }


def _build_price_map(holdings, db: Session) -> dict:
    """Fetch all relevant MarketPrice rows in one query and return as symbol → price dict."""
    symbols = list({h.symbol.upper() for h in holdings})
    if not symbols:
        return {}
    rows = db.query(models.MarketPrice).filter(
        models.MarketPrice.symbol.in_(symbols)
    ).all()
    return {row.symbol: row.current_price for row in rows if row.current_price is not None}


def _build_daily_change_map(holdings, db: Session) -> dict:
    """Return symbol → {daily_change, percentage_change} for the gainers/losers widget."""
    symbols = list({h.symbol.upper() for h in holdings})
    if not symbols:
        return {}
    rows = db.query(models.MarketPrice).filter(
        models.MarketPrice.symbol.in_(symbols)
    ).all()
    return {
        row.symbol: {
            "daily_change":      row.daily_change,
            "percentage_change": row.percentage_change,
        }
        for row in rows
    }


@router.get("/summary")
def get_summary(include_volatility: bool = False, db: Session = Depends(get_db)):
    """
    Returns portfolio-level totals (value, cost, P&L, return %) plus per-asset
    performance (CAGR, optional annualised volatility) and diversification score.
    Also writes a PortfolioSnapshot to the DB for historical tracking.

    ?include_volatility=true  fetch annualised volatility via yfinance — stocks/ETFs only, slower
    """
    holdings  = db.query(models.InvestmentHolding).filter(
        models.InvestmentHolding.user_id == "demo-user"
    ).all()

    price_map      = _build_price_map(holdings, db)
    daily_map      = _build_daily_change_map(holdings, db)
    holding_dicts  = [_holding_to_dict(h, price_map) for h in holdings]

    summary         = calculate_portfolio_summary(holding_dicts, include_volatility)
    diversification = calculate_diversification_score(holding_dicts)

    # Attach daily change fields to each asset so the frontend gainers/losers widget
    # can sort by today's move rather than total return since purchase.
    for asset in summary.get("assets", []):
        daily = daily_map.get(asset["symbol"].upper(), {})
        asset["daily_change"]      = daily.get("daily_change")
        asset["percentage_change"] = daily.get("percentage_change")

    # Write a snapshot so the frontend can show historical portfolio growth
    snapshot = models.PortfolioSnapshot(
        user_id           = "demo-user",
        total_value       = summary["total_value"],
        total_cost        = summary["total_cost"],
        profit_loss       = summary["profit_loss"],
        return_percentage = summary["return_percentage"],
    )
    db.add(snapshot)
    db.commit()

    return {**summary, "diversification": diversification}


@router.get("/allocation")
def get_allocation(db: Session = Depends(get_db)):
    """
    Returns portfolio allocation split by symbol and by asset type.
    Each entry includes absolute value ($) and percentage of total portfolio.
    Prices come from MarketPrice table — falls back to buy_price if not yet refreshed.
    """
    holdings  = db.query(models.InvestmentHolding).filter(
        models.InvestmentHolding.user_id == "demo-user"
    ).all()

    price_map     = _build_price_map(holdings, db)
    holding_dicts = [_holding_to_dict(h, price_map) for h in holdings]

    return compute_allocation(holding_dicts)


@router.get("/geographic-exposure")
def get_geographic_exposure(db: Session = Depends(get_db)):
    from Feature3.market_research import fetch_geographic_exposure

    holdings = db.query(models.InvestmentHolding).filter(
        models.InvestmentHolding.user_id == "demo-user"
    ).all()

    price_map     = _build_price_map(holdings, db)
    holding_dicts = [_holding_to_dict(h, price_map) for h in holdings]

    def _val(h: dict) -> float:
        p = h.get("current_price") or h["buy_price"]
        return h["quantity"] * p

    total_value = sum(_val(h) for h in holding_dicts)
    for h in holding_dicts:
        h["weight"] = (_val(h) / total_value * 100) if total_value else 0

    exposure = fetch_geographic_exposure(holding_dicts)

    by_geography = [
        {
            "region":     r["region"],
            "symbols":    r["symbols"],
            "value":      round(total_value * r["weight_pct"] / 100, 2),
            "percentage": r["weight_pct"],
        }
        for r in exposure.get("by_region", [])
    ]

    return {"total_value": round(total_value, 2), "by_geography": by_geography}


# ── Portfolio Snapshots ───────────────────────────────────────────────────────

@router.get("/snapshots")
def get_snapshots(db: Session = Depends(get_db)):
    """
    Return one deduplicated snapshot per calendar day (latest write wins).
    The /summary endpoint writes a snapshot on each call, so this may have
    multiple rows per day — we collapse them here.
    """
    rows = (
        db.query(models.PortfolioSnapshot)
        .filter(models.PortfolioSnapshot.user_id == "demo-user")
        .order_by(models.PortfolioSnapshot.id.asc())
        .all()
    )
    by_date: dict = {}
    for r in rows:
        key = r.snapshot_date.isoformat() if hasattr(r.snapshot_date, "isoformat") else str(r.snapshot_date)
        by_date[key] = r  # last write per day wins
    return [
        {
            "date":              k,
            "total_value":       r.total_value,
            "profit_loss":       r.profit_loss,
            "return_percentage": r.return_percentage,
        }
        for k, r in sorted(by_date.items())
    ]


@router.post("/snapshots/backfill")
def backfill_snapshots(db: Session = Depends(get_db)):
    """
    Generate monthly historical snapshots from each holding's purchase date up
    to today.  Uses cumulative cost-basis at each month-end plus a small
    deterministic growth curve so the chart shows a realistic upward trend
    rather than a flat line.  Safe to call repeatedly — existing snapshots for
    the same date are overwritten (last-write-wins, matching /snapshots GET).
    """
    holdings = (
        db.query(models.InvestmentHolding)
        .filter(models.InvestmentHolding.user_id == "demo-user")
        .all()
    )
    if not holdings:
        raise HTTPException(status_code=400, detail="No holdings found — import a portfolio first.")

    # Earliest purchase date across all holdings
    parsed_dates = []
    for h in holdings:
        if h.purchase_date:
            try:
                if isinstance(h.purchase_date, date):
                    parsed_dates.append(h.purchase_date)
                else:
                    parsed_dates.append(date.fromisoformat(str(h.purchase_date)))
            except ValueError:
                pass
    if not parsed_dates:
        raise HTTPException(status_code=400, detail="Holdings have no purchase dates.")

    start = min(parsed_dates)
    today = date.today()

    # Build list of month-end dates from start → today
    def month_end(d: date) -> date:
        next_month = d.replace(day=28) + timedelta(days=4)
        return next_month - timedelta(days=next_month.day)

    snapshot_dates: list[date] = []
    cur = month_end(start)
    while cur <= today:
        snapshot_dates.append(cur)
        # Advance to next month
        next_m = cur.replace(day=1)
        next_m = (next_m.replace(day=28) + timedelta(days=4)).replace(day=1)
        cur = month_end(next_m)
    if today not in snapshot_dates:
        snapshot_dates.append(today)

    # For each snapshot date, calculate cumulative cost basis
    # (holdings purchased on or before that date)
    def cost_at(d: date) -> float:
        total = 0.0
        for h in holdings:
            try:
                pd = h.purchase_date if isinstance(h.purchase_date, date) else date.fromisoformat(str(h.purchase_date))
            except (ValueError, TypeError):
                pd = today
            if pd <= d:
                total += h.quantity * h.buy_price
        return total

    # Deterministic noise seeded on date string so repeated calls are stable
    def growth_factor(d: date, months_elapsed: float) -> float:
        rng = random.Random(d.isoformat())
        # ~8% annualised base + small monthly noise (±1.5%)
        base = math.exp(0.08 / 12 * months_elapsed)
        noise = 1 + rng.uniform(-0.015, 0.015)
        return base * noise

    inserted = 0
    for snap_date in snapshot_dates:
        cost = cost_at(snap_date)
        if cost <= 0:
            continue
        months_elapsed = (snap_date - start).days / 30.44
        value = cost * growth_factor(snap_date, months_elapsed)
        pl = value - cost
        ret_pct = (pl / cost) * 100 if cost else 0

        # Upsert: delete existing row for this date then insert fresh
        db.query(models.PortfolioSnapshot).filter(
            models.PortfolioSnapshot.user_id == "demo-user",
            models.PortfolioSnapshot.snapshot_date == snap_date,
        ).delete()
        db.add(models.PortfolioSnapshot(
            user_id           = "demo-user",
            total_value       = round(value, 2),
            total_cost        = round(cost, 2),
            profit_loss       = round(pl, 2),
            return_percentage = round(ret_pct, 4),
            snapshot_date     = snap_date,
        ))
        inserted += 1

    db.commit()
    return {"seeded": inserted, "from": start.isoformat(), "to": today.isoformat()}


# ── Markowitz Risk-Return Data ─────────────────────────────────────────────────

@router.get("/markowitz")
def get_markowitz(db: Session = Depends(get_db)):
    """
    Risk-return scatter data per holding.
      risk = annualised volatility % (stocks/ETFs via yfinance; None for others)
      ret  = CAGR % (all asset types)
      value = current market value (bubble size)
    """
    from portfolio_analytics import calculate_asset_performance

    holdings = db.query(models.InvestmentHolding).filter(
        models.InvestmentHolding.user_id == "demo-user"
    ).all()
    if not holdings:
        return []

    price_map = _build_price_map(holdings, db)
    result = []
    for h in holdings:
        h_dict = _holding_to_dict(h, price_map)
        perf = calculate_asset_performance(h_dict, include_volatility=True)
        cagr_pct = round(perf["cagr"] * 100, 2) if perf["cagr"] is not None else None
        vol_pct  = round(perf["annualised_volatility"] * 100, 2) if perf["annualised_volatility"] is not None else None
        result.append({
            "symbol":     perf["symbol"],
            "asset_type": perf["asset_type"],
            "risk":       vol_pct,
            "ret":        cagr_pct,
            "value":      perf["current_value"],
        })
    return result




# ── Manual Price Fallback ─────────────────────────────────────────────────────

@router.post("/prices/manual")
def set_manual_price(req: ManualPriceRequest, db: Session = Depends(get_db)):
    """
    Manually set a price for a symbol when yfinance or CoinGecko fails.
    Useful for real estate, obscure funds, or when APIs are down.
    Uses the same upsert logic as the auto refresh.
    """
    symbol = req.symbol.upper()

    # Check the symbol actually exists in the user's holdings
    holding = db.query(models.InvestmentHolding).filter(
        models.InvestmentHolding.symbol == symbol
    ).first()

    if not holding:
        raise HTTPException(
            status_code=404,
            detail=f"No holding found for symbol '{symbol}'. Add the holding first."
        )

    # Reuse the same upsert function from market_data
    market_data.upsert_market_price(db, {
        "symbol":            symbol,
        "current_price":     req.current_price,
        "daily_change":      None,   # unknown for manual entry
        "percentage_change": None,   # unknown for manual entry
    })

    return {
        "message": f"Manual price set for {symbol}",
        "symbol":  symbol,
        "price":   req.current_price,
    }