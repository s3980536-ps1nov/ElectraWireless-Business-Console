from __future__ import annotations

import math
from datetime import date
from typing import Any

import numpy as np

try:
    import yfinance as yf
    _YFINANCE_AVAILABLE = True
except ImportError:
    _YFINANCE_AVAILABLE = False


# ---------------------------------------------------------------------------
# Thresholds — tweak these numbers as needed
# ---------------------------------------------------------------------------

HOLDING_OVEREXPOSURE_PCT = 25.0   # flag any single holding above this % of total portfolio
TYPE_OVEREXPOSURE_PCT    = 60.0   # flag any single asset type above this % of total portfolio

# All recognised asset types — used for diversification score calculation
KNOWN_ASSET_TYPES = {"stock", "etf", "crypto", "fund", "real_estate"}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _years_held(purchase_date: str | date) -> float:
    if isinstance(purchase_date, str):
        purchase_date = date.fromisoformat(purchase_date)
    days = (date.today() - purchase_date).days
    return max(days / 365.25, 1 / 365.25)


def _current_value(holding: dict) -> float:
    price = holding.get("current_price") or holding.get("buy_price", 0.0)
    return price * holding.get("quantity", 0.0)


def _cost_basis(holding: dict) -> float:
    return holding.get("buy_price", 0.0) * holding.get("quantity", 0.0)


# ---------------------------------------------------------------------------
# CAGR
# ---------------------------------------------------------------------------

def calculate_cagr(buy_price: float, current_price: float, purchase_date: str | date) -> float | None:
    """Compound Annual Growth Rate: (current/buy)^(1/years) - 1."""
    try:
        if buy_price <= 0:
            return None
        years = _years_held(purchase_date)
        return round((current_price / buy_price) ** (1.0 / years) - 1.0, 6)
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Volatility
# ---------------------------------------------------------------------------

def calculate_volatility(symbol: str, asset_type: str) -> float | None:
    """
    Annualised volatility = std(daily_returns) * sqrt(252).
    Only attempted for stocks and ETFs via yfinance.
    Returns None for crypto/fund/real_estate or if yfinance is unavailable.
    """
    if not _YFINANCE_AVAILABLE:
        return None
    if asset_type.lower() not in ("stock", "etf"):
        return None
    try:
        hist = yf.Ticker(symbol).history(period="1y")
        if hist.empty or len(hist) < 5:
            return None
        closes = hist["Close"].values.astype(float)
        daily_returns = np.diff(closes) / closes[:-1]
        return round(float(np.std(daily_returns, ddof=1) * math.sqrt(252)), 6)
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Asset-level performance
# ---------------------------------------------------------------------------

def calculate_asset_performance(holding: dict, include_volatility: bool = False) -> dict[str, Any]:
    cost  = _cost_basis(holding)
    value = _current_value(holding)
    pl    = value - cost
    pct   = (pl / cost * 100.0) if cost > 0 else 0.0

    effective_price = holding.get("current_price") or holding["buy_price"]
    cagr = calculate_cagr(holding["buy_price"], effective_price, holding["purchase_date"])
    vol  = calculate_volatility(holding["symbol"], holding.get("asset_type", "")) if include_volatility else None

    return {
        "id":                   holding["id"],
        "symbol":               holding["symbol"],
        "asset_type":           holding.get("asset_type"),
        "quantity":             holding["quantity"],
        "buy_price":            holding["buy_price"],
        "current_price":        effective_price,
        "cost_basis":           round(cost, 2),
        "current_value":        round(value, 2),
        "profit_loss":          round(pl, 2),
        "return_percentage":    round(pct, 4),
        "cagr":                 cagr,
        "annualised_volatility": vol,
    }


# ---------------------------------------------------------------------------
# Portfolio-level summary
# ---------------------------------------------------------------------------

def calculate_portfolio_summary(holdings: list[dict], include_volatility: bool = False) -> dict[str, Any]:
    if not holdings:
        return {
            "total_value":       0.0,
            "total_cost":        0.0,
            "profit_loss":       0.0,
            "return_percentage": 0.0,
            "holding_count":     0,
            "assets":            [],
        }

    assets      = [calculate_asset_performance(h, include_volatility) for h in holdings]
    total_value = sum(a["current_value"] for a in assets)
    total_cost  = sum(a["cost_basis"]    for a in assets)
    pl          = total_value - total_cost
    pct         = (pl / total_cost * 100.0) if total_cost > 0 else 0.0

    return {
        "total_value":       round(total_value, 2),
        "total_cost":        round(total_cost, 2),
        "profit_loss":       round(pl, 2),
        "return_percentage": round(pct, 4),
        "holding_count":     len(holdings),
        "assets":            assets,
    }


# ---------------------------------------------------------------------------
# Allocation
# ---------------------------------------------------------------------------

def compute_allocation(holdings: list[dict]) -> dict[str, Any]:
    if not holdings:
        return {"total_value": 0.0, "by_asset_type": [], "by_symbol": []}

    total_value = sum(_current_value(h) for h in holdings)
    if total_value == 0:
        return {"total_value": 0.0, "by_asset_type": [], "by_symbol": []}

    by_symbol: dict[str, float] = {}
    by_type:   dict[str, float] = {}

    for h in holdings:
        sym = h["symbol"].upper()
        at  = h.get("asset_type", "unknown")
        val = _current_value(h)
        by_symbol[sym] = by_symbol.get(sym, 0.0) + val
        by_type[at]    = by_type.get(at, 0.0)    + val

    def _to_rows(mapping: dict[str, float], key: str) -> list[dict]:
        return [
            {key: k, "value": round(v, 2), "percentage": round(v / total_value * 100, 2)}
            for k, v in sorted(mapping.items(), key=lambda x: -x[1])
        ]

    return {
        "total_value":   round(total_value, 2),
        "by_symbol":     _to_rows(by_symbol, "symbol"),
        "by_asset_type": _to_rows(by_type,   "asset_type"),
    }


# ---------------------------------------------------------------------------
# Diversification score + overexposure detection
# ---------------------------------------------------------------------------

def calculate_diversification_score(holdings: list[dict]) -> dict[str, Any]:
    """
    Diversification score 0-100 based on sector spread:
      score = (number of distinct known asset types held / 5 possible types) * 100

      e.g. holds stock + crypto + etf → 3/5 = 60%

    Overexposure flags:
      - overexposed_holdings: any single holding > HOLDING_OVEREXPOSURE_PCT of portfolio
      - overexposed_types:    any single asset type > TYPE_OVEREXPOSURE_PCT of portfolio
    """
    empty = {
        "score":                0,
        "distinct_asset_types": [],
        "overexposed_holdings": [],
        "overexposed_types":    [],
    }

    if not holdings:
        return empty

    total_value = sum(_current_value(h) for h in holdings)
    if total_value == 0:
        return empty

    # Diversification score — sector spread (Option A)
    distinct_types = {
        h.get("asset_type", "").lower()
        for h in holdings
    } & KNOWN_ASSET_TYPES
    score = round(len(distinct_types) / len(KNOWN_ASSET_TYPES) * 100, 1)

    # Overexposure — per individual holding
    overexposed_holdings = []
    for h in holdings:
        pct = _current_value(h) / total_value * 100
        if pct > HOLDING_OVEREXPOSURE_PCT:
            overexposed_holdings.append({
                "id":         h["id"],
                "symbol":     h["symbol"],
                "asset_type": h.get("asset_type"),
                "percentage": round(pct, 2),
            })

    # Overexposure — per asset type
    by_type: dict[str, float] = {}
    for h in holdings:
        at = h.get("asset_type", "unknown")
        by_type[at] = by_type.get(at, 0.0) + _current_value(h)

    overexposed_types = [
        {"asset_type": at, "percentage": round(v / total_value * 100, 2)}
        for at, v in by_type.items()
        if v / total_value * 100 > TYPE_OVEREXPOSURE_PCT
    ]

    return {
        "score":                score,
        "distinct_asset_types": sorted(distinct_types),
        "overexposed_holdings": overexposed_holdings,
        "overexposed_types":    overexposed_types,
    }
