"""
Feature 3 — Market Data Service
Owner: Nishant

Handles:
  - yfinance  → stock / ETF prices       (Phase 3)
  - CoinGecko → crypto prices            (Phase 3)
  - Upsert    → saves prices to DB       (Phase 3)
"""

import time
import yfinance as yf
import requests
from sqlalchemy.orm import Session
import models

# ── Market-wide movers watchlist ──────────────────────────────────────────────

MARKET_WATCHLIST = [
    # Mega-cap tech
    "AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "TSLA", "ORCL",
    # Finance
    "JPM", "BAC", "V", "MA", "GS",
    # Healthcare
    "JNJ", "UNH", "PFE",
    # Energy
    "XOM", "CVX",
    # Consumer & retail
    "WMT", "KO", "MCD", "NKE", "SBUX",
    # ETFs
    "SPY", "QQQ", "VTI", "GLD",
    # Crypto (yfinance supports these)
    "BTC-USD", "ETH-USD", "SOL-USD",
]

_movers_cache: dict = {"data": None, "ts": 0.0}
_MOVERS_TTL = 15 * 60  # 15 minutes


def fetch_market_movers() -> dict:
    """
    Batch-fetch daily % change for the watchlist via yfinance.
    Results are cached for 15 minutes so repeated calls are instant.
    Returns {"gainers": [...top 3...], "losers": [...worst 3...]}.
    """
    now = time.time()
    if _movers_cache["data"] and now - _movers_cache["ts"] < _MOVERS_TTL:
        return _movers_cache["data"]

    try:
        raw = yf.download(
            MARKET_WATCHLIST,
            period="5d",
            progress=False,
            auto_adjust=True,
        )

        close = raw["Close"]
        results = []

        for symbol in MARKET_WATCHLIST:
            try:
                prices = close[symbol].dropna()
                if len(prices) < 2:
                    continue
                prev = float(prices.iloc[-2])
                curr = float(prices.iloc[-1])
                if prev == 0:
                    continue
                pct = round((curr - prev) / prev * 100, 2)
                display = symbol.replace("-USD", "")
                results.append({
                    "symbol":            display,
                    "current_price":     round(curr, 2),
                    "daily_change":      round(curr - prev, 2),
                    "percentage_change": pct,
                })
            except Exception:
                continue

        gainers = sorted(results, key=lambda x: x["percentage_change"], reverse=True)
        gainers = [r for r in gainers if r["percentage_change"] >= 0][:3]
        losers  = sorted(results, key=lambda x: x["percentage_change"])
        losers  = [r for r in losers  if r["percentage_change"] <  0][:3]

        output = {"gainers": gainers, "losers": losers}
        _movers_cache["data"] = output
        _movers_cache["ts"]   = now
        return output

    except Exception as e:
        print(f"[market_movers] Fetch failed: {e}")
        return {"gainers": [], "losers": []}


# ── yfinance: Stocks & ETFs ───────────────────────────────────────────────────

def fetch_stock_price(symbol: str) -> dict | None:
    """
    Fetch current price data for a stock or ETF symbol using yfinance.
    Returns a dict with price info, or None if the fetch fails.

    Example return:
      {"symbol": "AAPL", "current_price": 189.5, "daily_change": -1.2, "percentage_change": -0.63}
    """
    try:
        ticker = yf.Ticker(symbol)

        # .fast_info is a lightweight call — much faster than .info
        info = ticker.fast_info

        current_price = info.last_price
        prev_close    = info.previous_close

        if current_price is None or prev_close is None:
            return None

        daily_change      = round(current_price - prev_close, 4)
        percentage_change = round((daily_change / prev_close) * 100, 4)

        return {
            "symbol":            symbol.upper(),
            "current_price":     round(current_price, 4),
            "daily_change":      daily_change,
            "percentage_change": percentage_change,
        }

    except Exception as e:
        print(f"[yfinance] Failed to fetch {symbol}: {e}")
        return None


# ── CoinGecko: Crypto ─────────────────────────────────────────────────────────

# Map common crypto ticker symbols → CoinGecko IDs
COINGECKO_ID_MAP = {
    "BTC":  "bitcoin",
    "ETH":  "ethereum",
    "SOL":  "solana",
    "XRP":  "ripple",
    "DOGE": "dogecoin",
    "ADA":  "cardano",
    "BNB":  "binancecoin",
    "USDT": "tether",
}

def fetch_crypto_price(symbol: str) -> dict | None:
    """
    Fetch current price data for a crypto asset using the CoinGecko public API.
    Returns a dict with price info, or None if the fetch fails.

    CoinGecko's free API has a rate limit (~30 calls/min) — fine for our use.
    """
    coin_id = COINGECKO_ID_MAP.get(symbol.upper())

    if not coin_id:
        print(f"[CoinGecko] No CoinGecko ID mapped for symbol: {symbol}")
        return None

    try:
        url = "https://api.coingecko.com/api/v3/simple/price"
        params = {
            "ids":                coin_id,
            "vs_currencies":      "aud",          # Australian dollars
            "include_24hr_change": "true",
        }
        response = requests.get(url, params=params, timeout=10)
        response.raise_for_status()
        data = response.json()

        coin_data = data.get(coin_id)
        if not coin_data:
            return None

        current_price     = coin_data.get("aud")
        percentage_change = coin_data.get("aud_24h_change")

        if current_price is None:
            return None

        # CoinGecko doesn't give us absolute daily change directly
        # so we calculate it from the percentage
        daily_change = round((percentage_change / 100) * current_price, 4) if percentage_change else None

        return {
            "symbol":            symbol.upper(),
            "current_price":     round(current_price, 4),
            "daily_change":      daily_change,
            "percentage_change": round(percentage_change, 4) if percentage_change else None,
        }

    except Exception as e:
        print(f"[CoinGecko] Failed to fetch {symbol}: {e}")
        return None


# ── Unified Fetcher ───────────────────────────────────────────────────────────

def fetch_price(symbol: str, asset_type: str) -> dict | None:
    """
    Routes to the correct price source based on asset_type.
    Falls back to manual price entry (returns None) if both fail.

    asset_type: stock | etf | crypto | fund | real_estate
    """
    if asset_type.lower() == "crypto":
        return fetch_crypto_price(symbol)
    else:
        # stocks, ETFs, funds — all handled by yfinance
        result = fetch_stock_price(symbol)
        if result is None:
            print(f"[market_data] yfinance failed for {symbol} — manual price entry required")
        return result


# ── DB Upsert ─────────────────────────────────────────────────────────────────

def upsert_market_price(db: Session, price_data: dict):
    """
    Insert a new MarketPrice row, or update the existing one if the symbol
    already exists. This keeps one clean row per symbol in the DB.
    """
    existing = db.query(models.MarketPrice).filter(
        models.MarketPrice.symbol == price_data["symbol"]
    ).first()

    if existing:
        existing.current_price     = price_data["current_price"]
        existing.daily_change      = price_data.get("daily_change")
        existing.percentage_change = price_data.get("percentage_change")
    else:
        new_price = models.MarketPrice(
            symbol            = price_data["symbol"],
            current_price     = price_data["current_price"],
            daily_change      = price_data.get("daily_change"),
            percentage_change = price_data.get("percentage_change"),
        )
        db.add(new_price)

    db.commit()


# ── Refresh All Holdings ──────────────────────────────────────────────────────

def refresh_all_prices(db: Session):
    """
    Fetch the latest price for every unique symbol in the user's holdings
    and upsert into the market_prices table.

    Called by:
      - The APScheduler job (every 15 min during market hours)
      - Manually via GET /investments/prices/refresh
    """
    holdings = db.query(models.InvestmentHolding).all()

    # Deduplicate: only fetch each symbol once even if held multiple times
    seen = {}
    for h in holdings:
        seen[h.symbol.upper()] = h.asset_type

    refreshed = []
    failed    = []

    for symbol, asset_type in seen.items():
        price_data = fetch_price(symbol, asset_type)
        if price_data:
            upsert_market_price(db, price_data)
            refreshed.append(symbol)
        else:
            failed.append(symbol)

    print(f"[refresh] Refreshed: {refreshed} | Failed (manual needed): {failed}")
    return {"refreshed": refreshed, "failed": failed}