import pandas as pd
import json
import ssl
import certifi

ssl_context = ssl.create_default_context(cafile=certifi.where())
ssl._create_default_https_context = lambda: ssl_context
OUTPUT_FILE = "stocks.json"


# ================= DOWNLOAD NASDAQ LIST =================
def load_nasdaq():

    url = "https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt"

    df = pd.read_csv(url, sep="|")

    # remove test issues (bad tickers)
    df = df[df["Test Issue"] == "N"]

    # keep only useful columns
    df = df[["Symbol", "Security Name"]].dropna()

    return df


# ================= CLEAN NAME =================
def clean_name(name: str) -> str:

    name = name.lower()

    name = name.replace("&", " and ")

    return name.strip()


# ================= BUILD DATA =================
def build():

    df = load_nasdaq()

    data = []

    for _, row in df.iterrows():

        data.append({
            "ticker": row["Symbol"],
            "name": clean_name(row["Security Name"]),
            "type": "stock"
        })

    return data


# ================= SAVE =================
def save():

    data = build()

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)

    print(f"Saved {len(data)} stocks to {OUTPUT_FILE}")


if __name__ == "__main__":
    save()