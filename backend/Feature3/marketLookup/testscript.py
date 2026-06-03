import pandas as pd
import json
import re
import yfinance as yf
from concurrent.futures import ThreadPoolExecutor
import time
import random

# =========================
# CLEAN TICKER
# =========================
def clean_ticker(t):
    """Normalize Yahoo Finance ticker format"""
    if not isinstance(t, str):
        return None

    t = t.strip().upper()

    # remove invalid characters
    if not re.match(r"^[A-Z0-9.\-]+$", t):
        return None

    # Yahoo Finance uses '-' instead of '.'
    return t.replace(".", "-")


# =========================
# DOWNLOAD SP500 LIST
# =========================
def get_sp500():
    url = (
        "https://raw.githubusercontent.com/"
        "datasets/s-and-p-500-companies/master/data/constituents.csv"
    )

    df = pd.read_csv(url)

    if "Symbol" not in df.columns:
        raise ValueError("Invalid dataset format")

    raw_tickers = df["Symbol"].dropna().tolist()

    cleaned = []

    for t in raw_tickers:
        ct = clean_ticker(t)

        if ct:
            cleaned.append(ct)

    # deduplicate + stable ordering
    cleaned = sorted(list(set(cleaned)))

    return cleaned


# =========================
# GET STOCK DATA
# =========================
# =========================
# GET STOCK DATA
# =========================
def get_stock_data(symbol):
    time.sleep(random.uniform(0.1, 0.3))
    try:
        ticker = yf.Ticker(symbol)

        # 6 month history
        df = ticker.history(period="6mo")

        if df.empty or len(df) < 30:
            return None

        start = df["Close"].iloc[0]
        end = df["Close"].iloc[-1]

        return_pct = ((end - start) / start) * 100

        try:
            info = ticker.get_info()
        except:
            info = {}

        country = (
            info.get("country")
            or info.get("region")
            or "Unknown"
        )

        company_name = (
            info.get("shortName")
            or info.get("longName")
            or symbol
        )

        sector = info.get("sector") or "Unknown"

        return {
            "symbol": symbol,
            "company_name": company_name,
            "country": country,
            "sector": sector,
            "return_6m": round(float(return_pct), 2)
        }

    except Exception as e:
        print(f"Error for {symbol}: {e}")
    return None


# =========================
# PARALLEL SCAN
# =========================
def scan_universe(tickers, max_workers=5):
    results = []

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        outputs = executor.map(get_stock_data, tickers)

    for r in outputs:
        if r:
            results.append(r)

    return results


# =========================
# RANK STOCKS
# =========================
def rank_stocks(results):
    df = pd.DataFrame([r for r in results if r is not None])

    if df.empty or "return_6m" not in df.columns:
        raise ValueError("No valid stock data collected")

    df = df.sort_values("return_6m", ascending=False)

    df["rank"] = range(1, len(df) + 1)

    return df


# =========================
# MAIN
# =========================
if __name__ == "__main__":

    print("Downloading S&P 500 list...")

    tickers = get_sp500()

    print(f"Loaded {len(tickers)} tickers")

    print("\nScanning stock performance...")

    results = scan_universe(tickers, max_workers=10)

    ranked = rank_stocks(results)

    # replace NaN values so JSON is valid
    ranked = ranked.fillna("Unknown")

    # optional: ensure no weird infinities exist
    ranked = ranked.replace(
        [float("inf"), float("-inf")],
        "Unknown"
    )

    output = ranked.to_dict(orient="records")

    # save final ranked output
    with open("sp500_ranked.json", "w") as f:
        json.dump(output, f, indent=2, allow_nan=False)



    print("\n💾 Saved → sp500_ranked.json")