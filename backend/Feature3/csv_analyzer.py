import pandas as pd
import json
import numpy as np
import yfinance as yf
from prophet import Prophet
import os
import re
import requests
from datetime import datetime, timedelta
from concurrent.futures import ThreadPoolExecutor, as_completed

OUTPUT_FILE = "ydata/csv_analysis_output.json"
OUTPUT_FILE_PROPHET = "ydata/csv_prediction_output_analysis.json"

TEST_TICKERS = ["AMD", "NVDA"]

FINNHUB_BASE = "https://finnhub.io/api/v1"
FINNHUB_API_KEY = os.getenv("FINNHUB_API_KEY")

DATA_DIR = "ydata"
os.makedirs(DATA_DIR, exist_ok=True)

# ================= MARKET RESEARCH CONSTANTS =================
# Ported from the old market_research module so the new portfolio path runs
# entirely off csv_analyzer.

EXCHANGE_MAP = {
    "NMS": "United States", "NYQ": "United States", "NGM": "United States",
    "PCX": "United States", "BTS": "United States", "PNK": "United States",
    "NCM": "United States", "NYSEArca": "United States",
    "NSE": "India", "BSE": "India",
    "LSE": "United Kingdom", "IOB": "United Kingdom",
    "TYO": "Japan", "OSA": "Japan",
    "SHH": "China", "SHZ": "China", "HKG": "Hong Kong",
    "FRA": "Germany", "XETRA": "Germany",
    "TOR": "Canada", "VAN": "Canada", "CNQ": "Canada",
    "ASX": "Australia",
    "PAR": "France",
    "EBS": "Switzerland",
    "KSC": "South Korea", "KOE": "South Korea",
    "SAO": "Brazil",
    "SES": "Singapore",
    "AMS": "Netherlands",
    "STO": "Sweden",
    "MCE": "Spain",
    "MIL": "Italy",
}

_CRYPTO_SUFFIX = {"BTC", "ETH", "SOL", "DOGE", "ADA", "XRP", "BNB", "MATIC", "AVAX", "DOT"}

# Common English words that are valid 1-5 char uppercase strings but should
# never be treated as tickers when scanning free text.
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
    # extra words seen producing yfinance 404s in real traffic
    "RISKS", "TESLA", "FEW", "YEARS", "NEWS", "STOCK", "VALUE", "FAIR",
    "PERFORMANCE", "EARNINGS", "REPORTS", "SECTOR", "FUTURE", "IMPACT",
    "MARKET", "SENTIMENT",
}


def _yf_symbol(symbol: str, asset_type: str = "") -> str:
    """Convert portfolio symbol to yfinance-compatible symbol (adds -USD for crypto)."""
    s = symbol.upper()
    if s in _CRYPTO_SUFFIX or asset_type.lower() == "crypto":
        return s if s.endswith("-USD") else f"{s}-USD"
    return s


# ================= TICKER / TEXT EXTRACTION =================

def detect_tickers(text: str, portfolio_symbols: list[str] | None = None) -> list[str]:
    """Extract uppercase tickers from free text. Portfolio symbols ranked first."""
    portfolio_symbols = [s.upper() for s in (portfolio_symbols or [])]
    explicit   = re.findall(r"\$([A-Z]{1,5})\b", text.upper())
    candidates = re.findall(r"\b([A-Z]{1,5})\b", text.upper())

    found, seen = [], set()
    for t in explicit + candidates:
        if t in seen or t in _SKIP_WORDS:
            continue
        seen.add(t)
        found.append(t)

    portfolio_found = [t for t in found if t in portfolio_symbols]
    external_found  = [t for t in found if t not in portfolio_symbols]
    return portfolio_found + external_found


def parse_hypothetical(question: str) -> tuple[float | None, str | None]:
    """Extract (amount, ticker) from a 'what if I invested $X in Y' question.

    Note: the original market_research version had a latent bug where the
    pattern hard-coded lowercase `in|into` but searched against `.upper()`, so
    it never matched. This port uses re.IGNORECASE so the function actually
    works.
    """
    pattern = r"\$?([\d,]+(?:\.\d+)?)\s*([kK])?\s*(?:dollars?|usd)?\s+(?:in|into)\s+\$?([A-Z]{1,5})\b"
    match   = re.search(pattern, question, re.IGNORECASE)
    if not match:
        return None, None

    amount = float(match.group(1).replace(",", ""))
    if match.group(2):  # the K suffix was present
        amount *= 1000
    return amount, match.group(3).upper()


def detect_historical_year(question: str) -> int | None:
    """Extract a past year from a historical-scenario question."""
    current_year = datetime.now().year
    match = re.search(r"\b(20\d{2})\b", question)
    if match:
        year = int(match.group(1))
        if year < current_year:
            return year
    return None


# ================= YFINANCE TICKER SNAPSHOT =================

def fetch_ticker_data(symbol: str) -> dict | None:
    """Single-ticker snapshot (price, 1y CAGR, vol, fundamentals)."""
    try:
        ticker = yf.Ticker(symbol)
        info   = ticker.info or {}
        hist   = ticker.history(period="1y")
        if hist.empty:
            return None

        current_price = info.get("currentPrice") or info.get("regularMarketPrice")
        if not current_price and not hist.empty:
            current_price = float(hist["Close"].iloc[-1])

        start_price = float(hist["Close"].iloc[0])
        end_price   = float(hist["Close"].iloc[-1])
        cagr        = ((end_price / start_price) - 1) * 100 if start_price else None

        daily_returns = hist["Close"].pct_change().dropna()
        volatility    = float(daily_returns.std() * np.sqrt(252) * 100) if not daily_returns.empty else None

        return {
            "symbol":              symbol,
            "current_price":       round(current_price, 2) if current_price else None,
            "one_year_cagr":       round(cagr, 2) if cagr is not None else None,
            "volatility_pct":      round(volatility, 2) if volatility is not None else None,
            "market_cap":          info.get("marketCap"),
            "pe_ratio":            info.get("trailingPE"),
            "sector":              info.get("sector"),
            "industry":            info.get("industry"),
            "fifty_two_week_high": info.get("fiftyTwoWeekHigh"),
            "fifty_two_week_low":  info.get("fiftyTwoWeekLow"),
        }
    except Exception as e:
        print(f"[csv_analyzer.fetch_ticker_data] {symbol}: {e}")
        return None


def project_investment_cagr(symbol: str, amount: float, years: float, ticker_data: dict) -> dict | None:
    """Project $amount in `symbol` forward by `years` using 1-year historical CAGR."""
    cagr = ticker_data.get("one_year_cagr")
    if cagr is None or ticker_data.get("current_price") is None:
        return None

    cagr_decimal = cagr / 100
    units        = amount / ticker_data["current_price"]
    projected    = amount * ((1 + cagr_decimal) ** years)
    gain         = projected - amount

    return {
        "symbol":             symbol,
        "invested":           round(amount, 2),
        "units_bought":       round(units, 4),
        "current_price":      ticker_data["current_price"],
        "projected_years":    years,
        "projected_value":    round(projected, 2),
        "projected_gain":     round(gain, 2),
        "projected_gain_pct": round((gain / amount) * 100, 2),
        "based_on_cagr_pct":  cagr,
        "note": "Projection based on 1-year historical CAGR. Past performance does not guarantee future results.",
    }


# ================= HISTORICAL SCENARIO =================

def _historical_per_holding(h: dict, start_date: str, end_date: str) -> dict | None:
    symbol     = h.get("symbol", "").upper()
    asset_type = h.get("asset_type", "")
    quantity   = h.get("quantity", 0)
    if not symbol or not quantity:
        return None
    try:
        ticker = yf.Ticker(_yf_symbol(symbol, asset_type))
        hist   = ticker.history(start=start_date, end=end_date)
        if hist.empty:
            return {"_skipped": symbol}

        hist_price = float(hist["Close"].iloc[0])
        hist_cost  = hist_price * quantity

        curr_price = h.get("current_price")
        if not curr_price:
            info       = ticker.info or {}
            curr_price = info.get("currentPrice") or info.get("regularMarketPrice")
            if not curr_price:
                recent = ticker.history(period="1d")
                curr_price = float(recent["Close"].iloc[-1]) if not recent.empty else None
        if not curr_price:
            return {"_skipped": symbol}

        curr_value = curr_price * quantity
        pnl        = curr_value - hist_cost
        ret_pct    = (pnl / hist_cost * 100) if hist_cost else 0

        return {
            "symbol":        symbol,
            "quantity":      quantity,
            "price_in_year": round(hist_price, 2),
            "cost_in_year":  round(hist_cost, 2),
            "current_price": round(curr_price, 2),
            "current_value": round(curr_value, 2),
            "profit_loss":   round(pnl, 2),
            "return_pct":    round(ret_pct, 2),
            "_hist_cost":    hist_cost,
            "_curr_value":   curr_value,
        }
    except Exception as e:
        print(f"[csv_analyzer.historical] {symbol}: {e}")
        return {"_skipped": symbol}


def calculate_historical_performance(holdings: list[dict], year: int) -> dict | None:
    """If the user had bought their current quantities in `year`, what would it look like now?"""
    start_date = f"{year}-01-01"
    end_date   = f"{year}-03-31"

    results, skipped = [], []
    total_hist_cost = total_curr_value = 0.0

    if not holdings:
        return None
    with ThreadPoolExecutor(max_workers=min(8, len(holdings))) as pool:
        for row in pool.map(lambda h: _historical_per_holding(h, start_date, end_date), holdings):
            if not row:
                continue
            if "_skipped" in row:
                skipped.append(row["_skipped"])
                continue
            total_hist_cost  += row.pop("_hist_cost")
            total_curr_value += row.pop("_curr_value")
            results.append(row)

    if not results:
        return None

    total_pnl     = total_curr_value - total_hist_cost
    total_ret_pct = (total_pnl / total_hist_cost * 100) if total_hist_cost else 0

    return {
        "year":                year,
        "holdings":            results,
        "total_cost_in_year":  round(total_hist_cost, 2),
        "total_current_value": round(total_curr_value, 2),
        "total_profit_loss":   round(total_pnl, 2),
        "total_return_pct":    round(total_ret_pct, 2),
        "skipped_symbols":     skipped,
        "note": f"Prices taken from first available trading day of {year}. Past performance does not guarantee future results.",
    }


# ================= GEOGRAPHIC EXPOSURE =================

def _geo_per_holding(h: dict) -> dict | None:
    symbol     = (h.get("symbol") or "").upper()
    asset_type = h.get("asset_type", "")
    weight     = h.get("weight") or 0

    if asset_type == "cash":
        return None
    if asset_type == "crypto" or symbol in _CRYPTO_SUFFIX:
        return {"symbol": symbol, "region": "Crypto (Global)", "exchange": "N/A", "weight": weight}
    try:
        info     = yf.Ticker(_yf_symbol(symbol, asset_type)).info or {}
        exchange = info.get("exchange", "")
        country  = info.get("country", "")
        region   = EXCHANGE_MAP.get(exchange) or country or "Unknown"
        return {"symbol": symbol, "exchange": exchange, "region": region, "weight": weight}
    except Exception as e:
        print(f"[csv_analyzer.geo] {symbol}: {e}")
        return {"_skipped": symbol}


def fetch_geographic_exposure(holdings: list[dict]) -> dict:
    """Region breakdown by exchange country for the user's holdings."""
    if not holdings:
        return {"by_region": [], "detail": [], "skipped": []}

    region_weights:  dict[str, float]   = {}
    region_holdings: dict[str, list[str]] = {}
    detail, skipped = [], []

    with ThreadPoolExecutor(max_workers=min(8, len(holdings))) as pool:
        for row in pool.map(_geo_per_holding, holdings):
            if row is None:
                continue
            if "_skipped" in row:
                skipped.append(row["_skipped"])
                continue
            region = row["region"]
            region_weights[region] = region_weights.get(region, 0) + (row.get("weight") or 0)
            region_holdings.setdefault(region, []).append(row["symbol"])
            detail.append(row)

    sorted_regions = sorted(region_weights.items(), key=lambda x: x[1], reverse=True)
    return {
        "by_region": [
            {"region": r, "weight_pct": round(w, 2), "symbols": region_holdings.get(r, [])}
            for r, w in sorted_regions
        ],
        "detail":  detail,
        "skipped": skipped,
    }

def build_news_block(news_data):
    """
    Converts raw news into richer LLM context with lightweight interpretation layer.
    """

    if not news_data:
        return "[NEWS] No news available"

    lines = ["[NEWS CONTEXT]"]

    company = news_data.get("company", {})

    for symbol, data in company.items():
        country = data.get("country", "Unknown")
        articles = data.get("articles", [])

        lines.append(f"\n{symbol} ({country})")

        for a in articles[:3]:
            headline = a.get("headline", "")
            summary = a.get("summary", "")

            # lightweight enrichment layer (heuristic, not LLM)
            context_hint = infer_news_context(headline, summary)

            lines.append(f"- Headline: {headline}")
            lines.append(f"  Context: {context_hint}")
            lines.append(f"  Summary: {summary}")

    return "\n".join(lines)

def infer_news_context(headline: str, summary: str) -> str:
    text = (headline + " " + summary).lower()

    if any(x in text for x in ["fed", "interest rate", "powell"]):
        return "Macroeconomic policy / interest rate expectations impacting market sentiment"

    if any(x in text for x in ["ai", "nvidia", "chip", "semiconductor"]):
        return "AI / semiconductor sector momentum and competitive positioning"

    if any(x in text for x in ["tesla", "waymo", "robotaxi", "autonomous"]):
        return "Autonomous driving competition and EV sector disruption"

    if any(x in text for x in ["etf", "index"]):
        return "Passive investment flows and broad market positioning"

    if any(x in text for x in ["buffett", "hold forever"]):
        return "Long-term value investing sentiment signal"

    return "General market or company-specific news with moderate impact"


def get_country(symbol: str):
    try:
        ticker = yf.Ticker(symbol)
        info = ticker.get_info()

        return (
            info.get("country")
            or info.get("region")
            or "Unknown"
        )
    except:
        return "Unknown"

def fetch_market_news(tickers: list[str], countries: list[str] = None):
    """
    Fetch company + market news using Finnhub and enrich with country via yfinance.
    Saves output to ydata/newsOutput.json
    """

    if countries is None:
        countries = []

    print("\n[NEWS PIPELINE RUNNING]")
    print("Tickers received:", tickers)

    result = {
        "company": {},
        "market": [],
        "meta": {
            "tickers_received": tickers,
            "countries_received": countries,
            "status": "active"
        }
    }

    today = datetime.now().strftime("%Y-%m-%d")
    week_ago = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")

    # =========================
    # COMPANY NEWS (per ticker) — parallelised
    # =========================
    # Each ticker = 1 yfinance get_country call + 1 Finnhub HTTP call. Done
    # sequentially this dominates the request when there are >5 tickers.
    # ThreadPoolExecutor with max 8 workers keeps us well under rate limits.
    def _fetch_one(symbol: str):
        try:
            country = get_country(symbol)
            resp = requests.get(
                f"{FINNHUB_BASE}/company-news",
                params={
                    "symbol": symbol,
                    "from": week_ago,
                    "to": today,
                    "token": FINNHUB_API_KEY,
                },
                timeout=8,
            )
            if resp.status_code != 200:
                return symbol, None
            articles = resp.json()[:5]
            return symbol, {
                "country": country,
                "articles": [
                    {
                        "headline": a.get("headline", ""),
                        "summary": (a.get("summary") or "")[:200],
                        "source": a.get("source", ""),
                        "url": a.get("url", ""),
                        "datetime": a.get("datetime", ""),
                    }
                    for a in articles
                ],
            }
        except Exception as e:
            print(f"[NEWS ERROR] {symbol}: {e}")
            return symbol, None

    if tickers:
        with ThreadPoolExecutor(max_workers=min(8, len(tickers))) as pool:
            for symbol, payload in pool.map(_fetch_one, tickers):
                if payload is not None:
                    result["company"][symbol] = payload

    # =========================
    # MARKET NEWS (global)
    # =========================
    try:
        resp = requests.get(
            f"{FINNHUB_BASE}/news",
            params={
                "category": "general",
                "token": FINNHUB_API_KEY
            },
            timeout=8
        )

        if resp.status_code == 200:
            articles = resp.json()[:5]

            result["market"] = [
                {
                    "headline": a.get("headline", ""),
                    "summary": (a.get("summary") or "")[:200],
                    "source": a.get("source", ""),
                    "url": a.get("url", ""),
                    "datetime": a.get("datetime", "")
                }
                for a in articles
            ]

    except Exception as e:
        print(f"[MARKET NEWS ERROR]: {e}")

    # =========================
    # SAVE OUTPUT
    # =========================
    output_path = os.path.join(DATA_DIR, "newsOutput.json")

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2)

    print(f"\n💾 Saved → {output_path}")

    return result

def project_investment_prophet(symbol: str, amount: float, years: float) -> dict | None:
    try:
        ticker = yf.Ticker(symbol)
        df = ticker.history(period="2y", auto_adjust=True)

        if df.empty or len(df) < 30:
            return None

        data = df.reset_index()[["Date", "Close"]].rename(
            columns={"Date": "ds", "Close": "y"}
        )

        # FIX timezone issue
        data["ds"] = pd.to_datetime(data["ds"]).dt.tz_localize(None)

        model = Prophet(
            daily_seasonality=False,
            weekly_seasonality=True,
            yearly_seasonality=True
        )

        model.fit(data)

        future_days = int(years * 365)
        future = model.make_future_dataframe(periods=future_days)

        forecast = model.predict(future)

        current_price = float(data["y"].iloc[-1])
        projected_price = float(forecast["yhat"].iloc[-1])

        units = amount / current_price
        projected_value = units * projected_price

        result = {
            "symbol": symbol,
            "invested": round(amount, 2),
            "units_bought": round(units, 4),
            "current_price": round(current_price, 2),
            "projected_price": round(projected_price, 2),
            "projected_years": years,
            "projected_value": round(projected_value, 2),
            "projected_gain": round(projected_value - amount, 2),
            "projected_gain_pct": round(((projected_value - amount) / amount) * 100, 2),
            "model": "prophet"
        }

# ================= SAVE ONLY TO PROPHET FILE (append-safe) =================
        os.makedirs(os.path.dirname(OUTPUT_FILE_PROPHET), exist_ok=True)

        try:
            with open(OUTPUT_FILE_PROPHET, "r", encoding="utf-8") as f:
                existing = json.load(f)
                if not isinstance(existing, list):
                    existing = []
        except:
            existing = []

        # Remove only duplicate symbol + timeframe combinations
        existing = [
            x for x in existing
            if not (
                x.get("symbol") == symbol and
                float(x.get("projected_years", 0)) == float(years)
            )
        ]

        existing.append(result)

        with open(OUTPUT_FILE_PROPHET, "w", encoding="utf-8") as f:
            json.dump(existing, f, indent=2)

        return result

    except Exception as e:
        print(f"[ERROR Prophet Projection {symbol}]: {e}")
        return None

# ================= CORE ANALYSIS =================
def analyze_ticker(symbol: str) -> dict | None:
    try:
        ticker = yf.Ticker(symbol)

        # ================= PRICE HISTORY =================
        df = ticker.history(period="6mo", auto_adjust=True)

        if df.empty:
            print(f"❌ No data for {symbol}")
            return None

        close = df["Close"].dropna()

        if len(close) < 2:
            print(f"❌ Not enough data for {symbol}")
            return None

        start = float(close.iloc[0])
        end = float(close.iloc[-1])

        change_abs = end - start
        change_pct = (change_abs / start) * 100

        # ================= VOLATILITY =================
        daily_returns = close.pct_change().dropna()
        volatility_pct = (
            float(daily_returns.std() * np.sqrt(252) * 100)
            if not daily_returns.empty
            else None
        )

        # ================= PRICE RANGE =================
        high = float(close.max())
        low = float(close.min())

        # ================= FUNDAMENTALS =================
        info = ticker.info or {}

        return {
            "ticker": symbol,

            # price movement
            "start_price": round(start, 2),
            "end_price": round(end, 2),
            "change_abs": round(change_abs, 2),
            "change_pct": round(change_pct, 2),

            # dataset info
            "data_points": int(len(close)),

            # risk / stats
            "volatility_pct": round(volatility_pct, 2) if volatility_pct else None,
            "fifty_two_week_high": high,
            "fifty_two_week_low": low,

            # fundamentals
            "market_cap": info.get("marketCap"),
            "pe_ratio": info.get("trailingPE"),
            "sector": info.get("sector"),
            "industry": info.get("industry"),
            "exchange": info.get("exchange"),
            "country": info.get("country"),

            # convenience
            "current_price": round(end, 2),
        }

    except Exception as e:
        print(f"[ERROR] {symbol}: {e}")
        return None

def format_market_data(csv_analysis_data, csv_prediction_data):

    analysis_lines = []
    prediction_lines = []

    # ===== ANALYSIS =====
    for x in csv_analysis_data:
        analysis_lines.append(
            f"{x.get('ticker')} | "
            f"chg={x.get('change_pct')}% | "
            f"vol={x.get('volatility_pct')}% | "
            f"pe={x.get('pe_ratio')} | "
            f"mcap={x.get('market_cap')} | "
            f"price={x.get('current_price')}"
        )

    # ===== PREDICTIONS =====
    for p in csv_prediction_data:
        prediction_lines.append(
            f"{p.get('symbol')} | "
            f"gain={p.get('projected_gain_pct')}% | "
            f"proj={p.get('projected_price')} | "
            f"yrs={p.get('projected_years')} | "
            f"model={p.get('model')}"
        )

    market_analysis = (analysis_lines)
    market_predictions = (prediction_lines)

    return market_analysis, market_predictions




# ================= RUN FUNCTION =================
def run(tickers, portfolioTickers):
    tickersCombined = (tickers or []) + (portfolioTickers or [])

    if not tickersCombined:
        print("❌ No tickers provided")
        return []

    # yfinance does one 6-month history call + one .info call per ticker.
    # Sequentially that's 1-3s per symbol; threading gets 5-10x speedup well
    # under yfinance's per-IP rate limits.
    results = []
    with ThreadPoolExecutor(max_workers=min(8, len(tickersCombined))) as pool:
        for data in pool.map(analyze_ticker, tickersCombined):
            if data:
                results.append(data)

    with open(OUTPUT_FILE, "w") as f:
        json.dump(results, f, indent=2)

    print(f"✅ Saved analysis → {OUTPUT_FILE}")

    return results


# ================= MANUAL TEST =================
if __name__ == "__main__":
    print("🧪 Running YFinance Analyzer Test...")

    # --- existing ticker analysis test ---
    output = run(TEST_TICKERS)

    print("\n📊 ANALYSIS RESULTS:")
    print(json.dumps(output, indent=2))

    # ================= PROPHET PROJECTION TEST =================
    print("\n🚀 Running Prophet Projection Test...")

    test_symbol = "NVDA"
    test_amount = 1000
    test_years = 3

    projection = project_investment_prophet(
        symbol=test_symbol,
        amount=test_amount,
        years=test_years
    )

    print("\n📈 PROJECTION RESULT:")
    print(json.dumps(projection, indent=2))