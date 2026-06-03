import os
import re
import requests
import yfinance as yf
import numpy as np
from datetime import datetime, timedelta
from pathlib import Path

try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).parent.parent / ".env")
except ImportError:
    pass

FINNHUB_API_KEY = os.environ.get("FINNHUB_API_KEY", "")
FINNHUB_BASE    = "https://finnhub.io/api/v1"

EXCHANGE_MAP = {
    # United States
    "NMS": "United States", "NYQ": "United States", "NGM": "United States",
    "PCX": "United States", "BTS": "United States", "PNK": "United States",
    "NCM": "United States", "NYSEArca": "United States",
    # India
    "NSE": "India", "BSE": "India",
    # United Kingdom
    "LSE": "United Kingdom", "IOB": "United Kingdom",
    # Japan
    "TYO": "Japan", "OSA": "Japan",
    # China / Hong Kong
    "SHH": "China", "SHZ": "China", "HKG": "Hong Kong",
    # Germany
    "FRA": "Germany", "XETRA": "Germany",
    # Canada
    "TOR": "Canada", "VAN": "Canada", "CNQ": "Canada",
    # Australia
    "ASX": "Australia",
    # France
    "PAR": "France",
    # Switzerland
    "EBS": "Switzerland",
    # South Korea
    "KSC": "South Korea", "KOE": "South Korea",
    # Brazil
    "SAO": "Brazil",
    # Singapore
    "SES": "Singapore",
    # Netherlands
    "AMS": "Netherlands",
    # Sweden
    "STO": "Sweden",
    # Spain
    "MCE": "Spain",
    # Italy
    "MIL": "Italy",
}

# Common words to exclude from ticker detection
_SKIP_WORDS = {
    "I", "A", "AT", "BE", "BY", "DO", "GO", "IF", "IN", "IS", "IT", "ME",
    "MY", "NO", "OF", "ON", "OR", "SO", "TO", "UP", "US", "WE", "AI", "OK",
    "THE", "AND", "FOR", "NOT", "BUT", "ALL", "ARE", "CAN", "DID", "GET",
    "GOT", "HAS", "HAD", "HIM", "HIS", "HOW", "ITS", "MAY", "NOW", "OUR",
    "OUT", "OWN", "PUT", "SAY", "SHE", "TOO", "USE", "WAS", "WHO", "WHY",
    "WITH", "WILL", "WHAT", "WHEN", "THAT", "THIS", "HAVE", "FROM", "THEY",
    "BEEN", "MORE", "ALSO", "INTO", "THAN", "THEN", "THEM", "SOME", "JUST",
    "EACH", "OVER", "SUCH", "VERY", "MUCH", "WELL", "LONG", "GOOD", "HIGH",
    "LOW", "BUY", "SELL", "HOLD", "RISK", "LOSS", "GAIN", "CASH", "FUND",
    "ETF", "IPO", "P/E", "ROI", "YTD", "EPS", "CEO", "CFO", "USD", "EUR",
}


def detect_tickers(text: str, portfolio_symbols: list[str] | None = None) -> list[str]:
    """
    Extract potential stock ticker symbols from free text.
    Returns unique list, portfolio symbols first.
    """
    portfolio_symbols = [s.upper() for s in (portfolio_symbols or [])]

    # Explicit $TICKER notation
    explicit = re.findall(r'\$([A-Z]{1,5})\b', text.upper())

    # Standalone uppercase words 1-5 chars that look like tickers
    candidates = re.findall(r'\b([A-Z]{1,5})\b', text.upper())

    found = []
    seen  = set()

    for t in explicit + candidates:
        if t in seen or t in _SKIP_WORDS:
            continue
        seen.add(t)
        found.append(t)

    # Prioritise portfolio symbols, then others
    portfolio_found = [t for t in found if t in portfolio_symbols]
    external_found  = [t for t in found if t not in portfolio_symbols]

    return portfolio_found + external_found


def fetch_ticker_data(symbol: str) -> dict | None:
    """
    Fetch current price, 1-year CAGR, annualised volatility, and basic
    fundamentals for a ticker via yfinance.
    """
    try:
        ticker  = yf.Ticker(symbol)
        info    = ticker.info or {}
        hist    = ticker.history(period="1y")

        if hist.empty:
            return None

        current_price = info.get("currentPrice") or info.get("regularMarketPrice")
        if not current_price and not hist.empty:
            current_price = float(hist["Close"].iloc[-1])

        # 1-year CAGR from daily close prices
        start_price = float(hist["Close"].iloc[0])
        end_price   = float(hist["Close"].iloc[-1])
        cagr        = ((end_price / start_price) - 1) * 100 if start_price else None

        # Annualised volatility
        daily_returns = hist["Close"].pct_change().dropna()
        volatility    = float(daily_returns.std() * np.sqrt(252) * 100) if not daily_returns.empty else None

        return {
            "symbol":        symbol,
            "current_price": round(current_price, 2) if current_price else None,
            "one_year_cagr": round(cagr, 2) if cagr is not None else None,
            "volatility_pct": round(volatility, 2) if volatility is not None else None,
            "market_cap":    info.get("marketCap"),
            "pe_ratio":      info.get("trailingPE"),
            "sector":        info.get("sector"),
            "industry":      info.get("industry"),
            "fifty_two_week_high": info.get("fiftyTwoWeekHigh"),
            "fifty_two_week_low":  info.get("fiftyTwoWeekLow"),
        }
    except Exception as e:
        print(f"[market_research] yfinance failed for {symbol}: {e}")
        return None


def project_investment(symbol: str, amount: float, years: float, ticker_data: dict) -> dict | None:
    """
    Project what $amount invested in symbol today would be worth after `years`
    based on the ticker's historical 1-year CAGR.
    """
    cagr = ticker_data.get("one_year_cagr")
    if cagr is None or ticker_data.get("current_price") is None:
        return None

    cagr_decimal  = cagr / 100
    units         = amount / ticker_data["current_price"]
    projected     = amount * ((1 + cagr_decimal) ** years)
    gain          = projected - amount
    gain_pct      = (gain / amount) * 100

    return {
        "symbol":           symbol,
        "invested":         round(amount, 2),
        "units_bought":     round(units, 4),
        "current_price":    ticker_data["current_price"],
        "projected_years":  years,
        "projected_value":  round(projected, 2),
        "projected_gain":   round(gain, 2),
        "projected_gain_pct": round(gain_pct, 2),
        "based_on_cagr_pct": cagr,
        "note": "Projection based on 1-year historical CAGR. Past performance does not guarantee future results.",
    }


def fetch_news(symbols: list[str], max_per_symbol: int = 3, max_general: int = 5) -> dict:
    """
    Fetch recent company news for each symbol + general market headlines via Finnhub.
    Returns {"company": {symbol: [headlines]}, "market": [headlines]}
    """
    if not FINNHUB_API_KEY:
        return {"company": {}, "market": [], "error": "No Finnhub API key configured"}

    today     = datetime.now().strftime("%Y-%m-%d")
    week_ago  = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")
    result    = {"company": {}, "market": []}

    for symbol in symbols[:5]:  # cap to avoid rate limits
        try:
            resp = requests.get(
                f"{FINNHUB_BASE}/company-news",
                params={"symbol": symbol, "from": week_ago, "to": today, "token": FINNHUB_API_KEY},
                timeout=5,
            )
            if resp.status_code == 200:
                articles = resp.json()[:max_per_symbol]
                result["company"][symbol] = [
                    {"headline": a.get("headline", ""), "summary": a.get("summary", "")[:200]}
                    for a in articles
                ]
        except Exception as e:
            print(f"[finnhub] Company news failed for {symbol}: {e}")

    try:
        resp = requests.get(
            f"{FINNHUB_BASE}/news",
            params={"category": "general", "token": FINNHUB_API_KEY},
            timeout=5,
        )
        if resp.status_code == 200:
            articles = resp.json()[:max_general]
            result["market"] = [
                {"headline": a.get("headline", ""), "summary": a.get("summary", "")[:200]}
                for a in articles
            ]
    except Exception as e:
        print(f"[finnhub] Market news failed: {e}")

    return result


def parse_hypothetical(question: str) -> tuple[float | None, str | None]:
    """
    Try to extract (amount, ticker) from a "what if I invested $X in Y" question.
    Returns (None, None) if not a hypothetical question.
    """
    # Match patterns like "$5000 in AAPL", "10000 in TSLA", "$1k in BTC"
    pattern = r'\$?([\d,]+(?:\.\d+)?)\s*[kK]?\s*(?:dollars?|usd)?\s+(?:in|into)\s+\$?([A-Z]{1,5})\b'
    match   = re.search(pattern, question.upper())

    if not match:
        return None, None

    amount_str = match.group(1).replace(",", "")
    amount     = float(amount_str)

    # Handle "k" suffix (e.g. "10k")
    if "K" in question.upper()[match.start():match.end()]:
        amount *= 1000

    ticker = match.group(2)
    return amount, ticker


def detect_historical_year(question: str) -> int | None:
    """
    Extract a past year from a historical scenario question.
    e.g. "what if I bought in 2020" → 2020
    """
    current_year = datetime.now().year
    match = re.search(r'\b(20\d{2})\b', question)
    if match:
        year = int(match.group(1))
        if year < current_year:
            return year
    return None


_CRYPTO_SUFFIX = {"BTC", "ETH", "SOL", "DOGE", "ADA", "XRP", "BNB", "MATIC", "AVAX", "DOT"}

def _yf_symbol(symbol: str, asset_type: str = "") -> str:
    """Convert portfolio symbol to yfinance-compatible symbol."""
    s = symbol.upper()
    if s in _CRYPTO_SUFFIX or asset_type.lower() == "crypto":
        return s if s.endswith("-USD") else f"{s}-USD"
    return s


def calculate_historical_performance(holdings: list[dict], year: int) -> dict | None:
    """
    For each holding, fetch the price at the start of `year` via yfinance
    and calculate what the portfolio would be worth then vs now.
    Returns a structured comparison.
    """
    start_date = f"{year}-01-01"
    end_date   = f"{year}-03-31"  # use Q1 to ensure we get a trading day

    results        = []
    total_hist_cost   = 0.0
    total_curr_value  = 0.0
    skipped        = []

    for h in holdings:
        symbol     = h.get("symbol", "").upper()
        asset_type = h.get("asset_type", "")
        quantity   = h.get("quantity", 0)
        if not symbol or not quantity:
            continue

        yf_sym = _yf_symbol(symbol, asset_type)
        try:
            ticker = yf.Ticker(yf_sym)
            hist   = ticker.history(start=start_date, end=end_date)

            if hist.empty:
                skipped.append(symbol)
                continue

            hist_price   = float(hist["Close"].iloc[0])
            hist_cost    = hist_price * quantity

            # Current price — use what's already in the holding if available, else fetch
            curr_price = h.get("current_price")
            if not curr_price:
                info = ticker.info or {}
                curr_price = info.get("currentPrice") or info.get("regularMarketPrice")
                if not curr_price:
                    recent = ticker.history(period="1d")
                    curr_price = float(recent["Close"].iloc[-1]) if not recent.empty else None

            if not curr_price:
                skipped.append(symbol)
                continue

            curr_value = curr_price * quantity
            pnl        = curr_value - hist_cost
            ret_pct    = (pnl / hist_cost * 100) if hist_cost else 0

            results.append({
                "symbol":        symbol,
                "quantity":      quantity,
                "price_in_year": round(hist_price, 2),
                "cost_in_year":  round(hist_cost, 2),
                "current_price": round(curr_price, 2),
                "current_value": round(curr_value, 2),
                "profit_loss":   round(pnl, 2),
                "return_pct":    round(ret_pct, 2),
            })

            total_hist_cost  += hist_cost
            total_curr_value += curr_value

        except Exception as e:
            print(f"[historical] Failed for {symbol}: {e}")
            skipped.append(symbol)

    if not results:
        return None

    total_pnl     = total_curr_value - total_hist_cost
    total_ret_pct = (total_pnl / total_hist_cost * 100) if total_hist_cost else 0

    return {
        "year":               year,
        "holdings":           results,
        "total_cost_in_year": round(total_hist_cost, 2),
        "total_current_value": round(total_curr_value, 2),
        "total_profit_loss":  round(total_pnl, 2),
        "total_return_pct":   round(total_ret_pct, 2),
        "skipped_symbols":    skipped,
        "note": f"Prices taken from first available trading day of {year}. Past performance does not guarantee future results.",
    }


def fetch_geographic_exposure(holdings: list[dict]) -> dict:
    """
    For each portfolio holding, look up exchange via yfinance and map it to a
    region using EXCHANGE_MAP. Returns a weight-based breakdown by region.
    """
    region_weights: dict[str, float] = {}
    region_holdings: dict[str, list[str]] = {}
    detail = []
    skipped = []

    for h in holdings:
        symbol     = h.get("symbol", "").upper()
        asset_type = h.get("asset_type", "")
        weight     = h.get("weight") or 0

        if asset_type == "cash":
            continue

        if asset_type == "crypto" or symbol in _CRYPTO_SUFFIX:
            region = "Crypto (Global)"
            region_weights[region] = region_weights.get(region, 0) + weight
            region_holdings.setdefault(region, []).append(symbol)
            detail.append({"symbol": symbol, "region": region, "exchange": "N/A", "weight": weight})
            continue

        try:
            yf_sym   = _yf_symbol(symbol, asset_type)
            info     = yf.Ticker(yf_sym).info or {}
            exchange = info.get("exchange", "")
            country  = info.get("country", "")
            region   = EXCHANGE_MAP.get(exchange) or country or "Unknown"

            region_weights[region] = region_weights.get(region, 0) + weight
            region_holdings.setdefault(region, []).append(symbol)
            detail.append({"symbol": symbol, "exchange": exchange, "region": region, "weight": weight})
        except Exception as e:
            print(f"[geo_exposure] Failed for {symbol}: {e}")
            skipped.append(symbol)

    sorted_regions = sorted(region_weights.items(), key=lambda x: x[1], reverse=True)

    return {
        "by_region": [
            {"region": r, "weight_pct": round(w, 2), "symbols": region_holdings.get(r, [])}
            for r, w in sorted_regions
        ],
        "detail":  detail,
        "skipped": skipped,
    }
