import yfinance as yf
import pandas as pd
import matplotlib.pyplot as plt

# ================= SETTINGS =================

TICKER = "AAPL"

# Examples:
# "5d"   = 5 days
# "1mo"  = 1 month
# "6mo"  = 6 months
# "1y"   = 1 year
# "5y"   = 5 years
TIMEFRAME = "6mo"

# Examples:
# "1m", "5m", "15m", "1h", "1d", "1wk"
INTERVAL = "1d"

# ================= DOWNLOAD =================

data = yf.download(
    TICKER,
    period=TIMEFRAME,
    interval=INTERVAL
)

# ================= OUTPUT =================

print("\n=== DATA ===")
print(data.tail())

# Save CSV
csv_name = f"{TICKER}_{TIMEFRAME}.csv"
data.to_csv(csv_name)

# ================= INDICATORS =================

data["SMA_5"] = data["Close"].rolling(5).mean()

# ================= PLOT =================

plt.figure(figsize=(12, 6))

plt.plot(data.index, data["Close"], label="Close Price")
plt.plot(data.index, data["SMA_5"], label="5 Day SMA")

plt.title(f"{TICKER} Stock Price ({TIMEFRAME})")
plt.xlabel("Date")
plt.ylabel("Price")

plt.legend()

plt.show()