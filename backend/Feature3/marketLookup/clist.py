import pandas as pd
import json
import re


def clean_ticker(t):
    """Normalize Yahoo Finance ticker format"""
    if not isinstance(t, str):
        return None

    t = t.strip().upper()

    # remove invalid characters (safety layer)
    if not re.match(r"^[A-Z0-9.\-]+$", t):
        return None

    # Yahoo Finance format fix
    return t.replace(".", "-")


def get_sp500():
    url = "https://raw.githubusercontent.com/datasets/s-and-p-500-companies/master/data/constituents.csv"

    df = pd.read_csv(url)

    if "Symbol" not in df.columns:
        raise ValueError("Invalid dataset format")

    raw_tickers = df["Symbol"].dropna().tolist()

    cleaned = []

    for t in raw_tickers:
        ct = clean_ticker(t)
        if ct:
            cleaned.append(ct)

    # remove duplicates (safety)
    cleaned = list(set(cleaned))

    # stable ordering (VERY important for reproducibility)
    cleaned.sort()

    return cleaned


if __name__ == "__main__":
    data = get_sp500()

    print("Total:", len(data))
    print(data[:20])

    with open("sp500.json", "w") as f:
        json.dump(data, f, indent=2)

    print("Saved → sp500.json")