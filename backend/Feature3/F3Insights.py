import json
import re
import os
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from groq import Groq


try:
    from F3Insight_memory import (retrieve_memories_by_intent, store_memories_batch, 
    build_memory_fact, store_sectioned_memories, detect_intent)
    
    from csv_analyzer import (
        run as analyze_ticker,
        project_investment_prophet,
        format_market_data,
        fetch_market_news,
        build_news_block,
        # ported from market_research — F3Insights now sources all market
        # data through csv_analyzer
        detect_tickers,
        fetch_ticker_data,
        parse_hypothetical,
        project_investment_cagr,
        detect_historical_year,
        calculate_historical_performance,
        fetch_geographic_exposure,
    )
    from domestic import (
    get_top5_by_country
    )
except ImportError:
    from Feature3.F3Insight_memory import (retrieve_memories_by_intent, store_memories_batch,
    build_memory_fact, store_sectioned_memories, detect_intent)
    from Feature3.csv_analyzer import (
        run as analyze_ticker,
        project_investment_prophet,
        format_market_data,
        fetch_market_news,
        build_news_block,
        detect_tickers,
        fetch_ticker_data,
        parse_hypothetical,
        project_investment_cagr,
        detect_historical_year,
        calculate_historical_performance,
        fetch_geographic_exposure,
    )
    from Feature3.domestic import (
    get_top5_by_country
    )

DATA_DIR = "ydata"

os.makedirs(DATA_DIR, exist_ok=True)
api_key = os.getenv("GROQ_API_KEY")

client = Groq(api_key=api_key)

# ================= FILE PATHS =================
OUTPUT_FILE = "../Llama Output/Feature_3_output.json"
PROPHET_SNAPSHOT = os.path.join(DATA_DIR, "csv_prediction_output_analysis.json")

DEFAULT_INVESTMENT = 1000

with open("Feature3/ydata/sp500_ranked.json", "r", encoding="utf-8") as f:
    SP500_DATA = json.load(f)
    
def parse_predictions(text: str):
    # Only parse inside [SECTION: PREDICTIONS] — otherwise tickers from the
    # STOCKS / STOCKS_PORFOLIO sections leak in as phantom predictions.
    section_lines = []
    in_predictions = False
    for raw in text.split("\n"):
        line = raw.strip()
        if not line:
            continue
        if line.upper().startswith("[SECTION: PREDICTIONS"):
            in_predictions = True
            continue
        if line.startswith("[SECTION:"):
            in_predictions = False
            continue
        if in_predictions:
            section_lines.append(line)

    predictions = []
    for i in range(0, len(section_lines) - 2, 3):
        ticker    = section_lines[i]
        flag      = section_lines[i + 1].upper()
        timeframe = section_lines[i + 2]
        predictions.append({
            "ticker": ticker,
            "predict": flag == "YES",
            "years": extract_years(timeframe),
        })

    return predictions


def extract_years(text: str):
    match = re.search(r"-?\d+", text)
    return float(match.group()) if match else 3.0
# 

def run_prophet_predictions(predictions, default_amount=DEFAULT_INVESTMENT):
    for p in predictions:
        if not p["predict"]:
            continue

        project_investment_prophet(
            symbol=p["ticker"],
            amount=default_amount,
            years=p["years"]
        )

def extract_intent(data, portfolio_holdings, user_question=None):
    prompt = f"""
You are a STRICT stock ticker extraction system.

USER QUESTION:
{user_question}
TASK: 1
Output Yahoo Finance tickers ONLY for companies EXPLICITLY NAMED in the user question above.

RULES:
- Output ONLY tickers for companies the user literally typed
- If the question is vague (e.g. "this stock", "the market"), output NONE
- DO NOT add industry peers, competitors, or "related" stocks
- If uncertain output NONE
- Maximum 5 tickers — if the question lists more, pick the first 5
- One ticker per line
- No prose, no explanations, no notes

FORMAT:
[SECTION: STOCKS]
<TICKER>
<TICKER>

TASK: 2
USER PORTFOLIO:
{portfolio_holdings}
Output the Yahoo Finance tickers from the USER PORTFOLIO list above.
RULES:
- Output ONLY tickers that appear in the USER PORTFOLIO list
- DO NOT add tickers from outside the portfolio
- Skip cash entries
- Maximum 5 tickers
- One ticker per line
- No prose, no explanations

FORMAT:
[SECTION: STOCKS_PORFOLIO]
<TICKER>
<TICKER>

TASK 3:
For each detected ticker, determine if the user is asking about:
- future projection (YES)
- past performance or general analysis (NO)

Also extract timeframe:
RULES:
- If user says "in X years", output "X years"
- If user says "over next X years", output "X years"
- If user says "X years ago", output "-X years"
- If no timeframe is mentioned, state No timeframe given

OUTPUT FORMAT (exactly 3 lines per ticker — ticker, flag, timeframe):
[SECTION: PREDICTIONS]
<TICKER>
<YES | NO>
<TIMEFRAME>

TASK 4:
If the user mentions a country list out the countries mentioned in this exact format
IF the user asks for not a specific country list out 5 countries that aren't that specific country
OUTPUT FORMAT
[SECTION: COUNTRIES]
<COUNTRY>

FORMAT RULES:
- No Notes
- only exact output format
- Do not list out Tasks
- Do NOT add a country line — country is sourced separately
"""

    res = client.chat.completions.create(
        model="llama-3.1-8b-instant",
        messages=[
            {"role": "system", "content": "Return ONLY the three sections in the exact format requested: STOCKS, STOCKS_PORFOLIO, PREDICTIONS. No prose, no notes."},
            {"role": "user", "content": prompt}
        ],
        temperature=0,
        # Hard cap so a model that gets stuck repeating ("TESLA is not a valid
        # ticker, but TSLA is. However, ...") can't burn the request budget.
        # 300 tokens is enough for ~50 tickers across the three sections.
        max_tokens=300,
    )

    return res.choices[0].message.content.strip()
# 
# A valid Yahoo ticker: 1-10 alphanumeric chars, optional suffix like
# .NS / .L / .TO (foreign exchanges) or -USD (crypto). Rejects anything with
# spaces — when the 8b extractor goes off-prompt and emits prose, this filter
# stops the garbage from reaching yfinance and Finnhub.
_TICKER_PATTERN = re.compile(r"^[A-Z0-9]{1,10}(?:[.\-][A-Z0-9]{1,4})?$")


def _is_ticker_like(line: str) -> bool:
    candidate = line.strip().upper()
    if not candidate or candidate == "NONE":
        return False
    if " " in candidate or len(candidate) > 16:
        return False
    return bool(_TICKER_PATTERN.match(candidate))


# Hard caps on how many tickers we accept from extract_intent. The 8b model
# can hallucinate industry peers when the question is vague ("this stock"),
# so we bound the fan-out before it hits Finnhub / yfinance / Prophet.
MAX_QUESTION_TICKERS  = 5
MAX_PORTFOLIO_TICKERS = 5


def extract_stock_lines(text):
    stocks = []
    portfolio = []
    countries = []

    seen_q, seen_p, seen_c = set(), set(), set()

    capture = None  # None | "stocks" | "portfolio" | "countries"

    section_pattern = re.compile(r"^\[SECTION:\s*(.*?)\s*\]$", re.IGNORECASE)

    for line in text.split("\n"):
        line = line.strip()

        # Detect section headers
        match = section_pattern.match(line)
        if match:
            section = match.group(1).upper()

            if section == "STOCKS":
                capture = "stocks"
            elif section == "STOCKS_PORFOLIO":
                capture = "portfolio"
            elif section == "COUNTRIES":
                capture = "countries"
            else:
                capture = None

            continue

        if not capture:
            continue

        value = line.strip()

        if capture == "stocks":
            if _is_ticker_like(value):
                sym = value.upper()
                if sym not in seen_q and len(stocks) < MAX_QUESTION_TICKERS:
                    seen_q.add(sym)
                    stocks.append(sym)

        elif capture == "portfolio":
            if _is_ticker_like(value):
                sym = value.upper()
                if sym not in seen_p and len(portfolio) < MAX_PORTFOLIO_TICKERS:
                    seen_p.add(sym)
                    portfolio.append(sym)

        elif capture == "countries":
            if value and value.upper() not in seen_c:
                seen_c.add(value.upper())
                countries.append(value)

    return stocks, portfolio, countries
# 


def normalize_ticker(t):
    t = t.strip().upper()

    # simple crypto mapping
    if t == "BTC":
        return "BTC-USD"
    if t == "ETH":
        return "ETH-USD"

    return t

# ================= MARKET CONTEXT BLOCK =================
def _build_market_context_block(market_context: dict) -> str:
    if not market_context:
        return ""

    lines = ["\n=== LIVE MARKET DATA ==="]

    for sym, td in (market_context.get("ticker_data") or {}).items():
        lines.append(f"\n{sym}:")
        if td.get("current_price"):
            lines.append(f"  Current price:   ${td['current_price']}")
        if td.get("one_year_cagr") is not None:
            lines.append(f"  1-year CAGR:     {td['one_year_cagr']}%")
        if td.get("volatility_pct") is not None:
            lines.append(f"  Annualised vol:  {td['volatility_pct']}%")
        if td.get("pe_ratio"):
            lines.append(f"  P/E ratio:       {td['pe_ratio']}")
        if td.get("sector"):
            lines.append(f"  Sector:          {td['sector']}")
        if td.get("fifty_two_week_high") and td.get("fifty_two_week_low"):
            lines.append(f"  52-week range:   ${td['fifty_two_week_low']} – ${td['fifty_two_week_high']}")

    projection = market_context.get("hypothetical_projection")
    if projection:
        yrs = projection['projected_years']
        yrs_label = (
            f"{round(yrs * 12, 1)} month{'s' if round(yrs * 12) != 1 else ''}"
            if yrs < 1 else
            f"{yrs} year{'s' if yrs != 1 else ''}"
        )
        lines.append(f"\n=== HYPOTHETICAL PROJECTION (over {yrs_label}) ===")
        lines.append(f"If ${projection['invested']:,.2f} were invested in {projection['symbol']} today:")
        lines.append(f"  Units bought:      {projection['units_bought']} @ ${projection['current_price']}")
        lines.append(f"  Projected value:   ${projection['projected_value']:,.2f} after {yrs_label}")
        lines.append(f"  Projected gain:    ${projection['projected_gain']:,.2f} ({projection['projected_gain_pct']:+.2f}%)")
        lines.append(f"  Based on 1yr CAGR: {projection['based_on_cagr_pct']}%")
        lines.append(f"  IMPORTANT: You MUST mention '{yrs_label}' when presenting this — never present as an instant return.")
        lines.append(f"  Note: {projection['note']}")

    hist = market_context.get("historical_performance")
    if hist:
        lines.append(f"\n=== HISTORICAL SCENARIO: IF BOUGHT IN {hist['year']} ===")
        lines.append(f"Total cost if purchased in {hist['year']}: ${hist['total_cost_in_year']:,.2f}")
        lines.append(f"Current value today:                      ${hist['total_current_value']:,.2f}")
        lines.append(f"Total profit / loss:                      ${hist['total_profit_loss']:,.2f}")
        lines.append(f"Total return:                             {hist['total_return_pct']:+.2f}%")
        lines.append("\nPer-holding breakdown:")
        for h in hist["holdings"]:
            lines.append(
                f"  {h['symbol']}: bought at ${h['price_in_year']} → now ${h['current_price']} "
                f"({h['quantity']} units) | P&L: ${h['profit_loss']:,.2f} ({h['return_pct']:+.2f}%)"
            )
        if hist.get("skipped_symbols"):
            lines.append(f"  (No data available for: {', '.join(hist['skipped_symbols'])})")

    return "\n".join(lines)


# ================= GEOGRAPHIC EXPOSURE BLOCK =================
def _build_geographic_exposure_block(exposure: dict) -> str:
    if not exposure or not exposure.get("by_region"):
        return ""

    lines = ["\n=== GEOGRAPHIC EXPOSURE ==="]
    for r in exposure["by_region"]:
        symbols_str = ", ".join(r["symbols"])
        lines.append(f"  {r['region']:<22} {r['weight_pct']:>6.1f}%  —  {symbols_str}")

    if exposure.get("skipped"):
        lines.append(f"  (Could not determine exposure for: {', '.join(exposure['skipped'])})")

    return "\n".join(lines)


# ================= EMERGENCY CASH RESERVE BLOCK =================
def _build_reserve_block(onboarding: dict, summary: dict) -> str:
    # Prefer the user-declared emergencyCash (onboarding) over the PF-derived
    # cashBalance (summary) — the onboarding value is the cushion the user
    # explicitly says lives outside the portfolio.
    onboarding = onboarding or {}
    summary = summary or {}

    monthly_expenses = (
        onboarding.get("monthlyExpenses")
        or onboarding.get("monthly_expenses")
    )
    emergency_cash = (
        onboarding.get("emergencyCash")
        if onboarding.get("emergencyCash") not in (None, 0)
        else None
    )
    cash_balance = emergency_cash if emergency_cash is not None else summary.get("cashBalance")

    if monthly_expenses and cash_balance is not None:
        reserve_min = monthly_expenses * 3
        reserve_max = monthly_expenses * 6
        months_covered = cash_balance / monthly_expenses
        if months_covered >= 6:
            status = "STRONG — above 6-month target"
        elif months_covered >= 3:
            status = "ADEQUATE — within 3–6 month range"
        else:
            status = f"INSUFFICIENT — only {months_covered:.1f} months covered (minimum is 3)"

        return f"""
=== EMERGENCY CASH RESERVE ANALYSIS ===
Cash balance:              ${cash_balance:,.2f}
Monthly expenses:          ${monthly_expenses:,.2f}
Recommended reserve (3–6 months): ${reserve_min:,.2f} – ${reserve_max:,.2f}
Current coverage:          {months_covered:.1f} months
Status:                    {status}
"""

    if emergency_cash is not None:
        # Coverage analysis needs monthly_expenses (PF data) — without it we
        # can't compute months covered, but we still must surface the cushion
        # figure plainly so the LLM doesn't latch onto summary.cashBalance (= $0).
        return f"""
=== EMERGENCY CASH RESERVE ===
Emergency cash on hand:    ${emergency_cash:,.2f} (user-declared, held outside the market)
Monthly expenses:          not available — connect Personal Finance to compute months of coverage
When referencing the user's emergency cash, use this figure ${emergency_cash:,.2f}, NOT summary.cashBalance.
"""

    return ""


# ================= PERSONALISED ALLOCATION PRIORITY BLOCK =================
# Strategy-based weights and specific ticker suggestions used for personalised
# allocation answers ("what should I invest in / how should I split my capital").
STRATEGY_TICKERS = {
    "growth":              {"stock": ["NVDA", "TSLA", "MSFT", "AMZN"], "crypto": ["BTC", "ETH", "SOL"], "etf": ["QQQ", "ARKK"]},
    "income":              {"stock": ["JNJ", "KO", "PG", "T"],          "crypto": ["BTC"],               "etf": ["VYM", "SCHD", "JEPI"]},
    "day_trading":         {"stock": ["NVDA", "TSLA", "AMD", "AAPL"],   "crypto": ["BTC", "ETH", "SOL"], "etf": ["SQQQ", "TQQQ"]},
    "index":               {"stock": ["AAPL", "MSFT"],                  "crypto": ["BTC"],               "etf": ["VOO", "VTI", "SPY"]},
    "dollar_cost_average": {"stock": ["AAPL", "MSFT", "GOOGL"],         "crypto": ["BTC", "ETH"],        "etf": ["VOO", "VTI"]},
    "buy_and_hold":        {"stock": ["AAPL", "MSFT", "GOOGL", "AMZN"], "crypto": ["BTC", "ETH"],        "etf": ["VOO", "QQQ", "VTI"]},
}
STRATEGY_WEIGHTS = {
    "growth":              {"stock": 0.60, "crypto": 0.25, "etf": 0.15},
    "income":              {"stock": 0.30, "crypto": 0.10, "etf": 0.60},
    "day_trading":         {"stock": 0.50, "crypto": 0.40, "etf": 0.10},
    "index":               {"stock": 0.20, "crypto": 0.10, "etf": 0.70},
    "dollar_cost_average": {"stock": 0.30, "crypto": 0.15, "etf": 0.55},
    "buy_and_hold":        {"stock": 0.50, "crypto": 0.20, "etf": 0.30},
}

_ALLOCATION_TRIGGERS = (
    "allocat", "what should i invest", "split", "distribute",
    "put my money", "divide my", "where should i put",
    "how should i invest", "how do i invest", "how to invest my",
)

_PREDICTION_TRIGGERS = (
    "predict", "forecast", "worth in", "value in", "price in",
    "1 year", "3 year", "5 year", "next year", "what will", "future price",
    "in a year", "in 5 year", "in 1 year", "in 3 year", "could be worth",
    "price target", "by 2027", "by 2028", "by 2029", "by 2030", "by 2031",
)

_OPPORTUNITY_TRIGGERS = (
    "top 5", "top five", "best investment", "opportunit",
    "what to buy", "best stock", "where to invest",
    "which stock", "what are the best", "buy right now", "buy now",
    "right now", "current market",
    "domestic stock", "domestic shares", "recommend stock", "recommend share",
    "suggest stock", "suggest share", "stocks to invest", "shares to invest",
    "stock to buy", "stocks to buy", "good stock", "which stock",
)


def _build_priority_block(user_question: str, onboarding: dict, domestic_suggestions: dict = None, user_country: str = "") -> str:
    if not user_question:
        return ""

    block = f"""
YOUR FIRST PRIORITY — ANSWER THIS QUESTION DIRECTLY:
"{user_question}"
Look at the portfolio data and all market data provided below. Answer this specific question before anything else.
"""

    onboarding = onboarding or {}
    q_lower    = user_question.lower()
    now        = datetime.now()

    # ── PRICE PREDICTION QUESTION ──────────────────────────────────────────────
    if any(t in q_lower for t in _PREDICTION_TRIGGERS):
        year1 = now.year + 1
        year3 = now.year + 3
        year5 = now.year + 5
        block += f"""
PRICE PREDICTION FORMAT — produce your QUESTION_RESPONSE using EXACTLY this structure.
Use ## and **bold** markdown formatting inside QUESTION_RESPONSE only.

## [TICKER] — Price Prediction & Outlook

**Current Position**
- Current price: $[exact figure from MARKET ANALYSIS — do not approximate]
- 52-week range: $[low] / $[high]
- Market cap: $[X]B | P/E: [X]x | Forward P/E: [X]x

**1-Year Outlook (by {year1})**
- Base case: $[price] ([+/-X]% return) — [1-sentence reasoning grounded in current data or news]
- Bull case: $[price] ([+X]% return) — [specific catalyst: product launch, earnings beat, macro tailwind]
- Bear case: $[price] ([-X]% return) — [specific risk trigger: regulation, competition, macro headwind]

**3-Year Outlook (by {year3})**
- Base case: $[price] ([+/-X]% total return) | Bull: $[price] | Bear: $[price]
- Primary driver: [key factor with a specific metric or growth rate]

**5-Year Outlook (by {year5})**
- Base case: $[price] ([+/-X]% total, ~X% annualised CAGR) | Bull: $[price] | Bear: $[price]
- Long-term thesis: [fundamental structural reason with market size or penetration rate]

**Key Growth Drivers**
- [driver 1 — include TAM size, revenue growth %, or unit volume data]
- [driver 2 — cite specific metric from market data or news]
- [driver 3 — product cycle, geography, or competitive moat with evidence]

**Risks & Uncertainties**
- [risk 1 with specific scenario] — Impact: High
- [risk 2 with specific scenario] — Impact: Medium
- [risk 3 with specific scenario] — Impact: Medium

**Industry Outlook**
[2-3 sentences: sector TAM projection, competitive dynamics, regulatory environment — all with specific figures and timeframes]

**Confidence Level**: [High / Medium / Low]
**Reasoning**: [1-2 sentences explaining confidence rating based on data quality, market predictability, and how far out the horizon is]

If Prophet MARKET PREDICTIONS are provided above, incorporate those exact projected prices and timeframes.
If live MARKET ANALYSIS data is present, use those exact current prices and fundamentals.

CRITICAL — output ALL six sections in this exact order. The full prediction analysis above goes inside [SECTION: QUESTION_RESPONSE]:
[SECTION: SUMMARY] → 2-3 sentences on the stock and its current portfolio context
[SECTION: PROS] → 2-4 bullets (strengths / bull case evidence)
[SECTION: CONS] → 2-4 bullets (risks / bear case evidence)
[SECTION: NEXT_STEPS] → 2-3 actionable bullets
[SECTION: QUESTION_RESPONSE] → paste the FULL formatted prediction analysis here
[SECTION: SOURCES] → list data sources (yfinance, news, prophet, portfolio, onboarding)
"""
        return block

    # ── TOP OPPORTUNITIES QUESTION ─────────────────────────────────────────────
    if any(t in q_lower for t in _OPPORTUNITY_TRIGGERS):
        strategies      = onboarding.get("investmentStrategies") or onboarding.get("investment_strategies") or []
        asset_interests = onboarding.get("assetInterests") or onboarding.get("asset_interests") or ["stock", "etf"]
        experience      = onboarding.get("experienceLevel") or onboarding.get("experience_level", "intermediate")
        _raw_cap_opp    = onboarding.get("investmentCapital") or onboarding.get("investment_capital") or 0
        capital         = float(_raw_cap_opp) if _raw_cap_opp not in (None, "") else 0

        _SP500_COVERED = {"United States", "US", "Canada", "Ireland", "Netherlands",
                          "Singapore", "Switzerland", "Bermuda", "United Kingdom"}
        domestic_block = ""
        if user_country and user_country not in _SP500_COVERED:
            # User is in a country not covered by sp500_ranked.json (e.g. Australia, India).
            # domestic_suggestions only has SP500-country picks from portfolio holdings — those are
            # NOT domestic for the user. Use LLM knowledge for the user's actual exchange instead.
            domestic_block = (
                f"\n\nUSER COUNTRY: {user_country}\n"
                f"The user is based in {user_country}. When suggesting domestic stocks, recommend stocks listed "
                f"on {user_country}'s primary stock exchange (e.g. ASX for Australia, TSX for Canada, LSE for UK, "
                f"NSE/BSE for India, SGX for Singapore). "
                f"Use your knowledge of {user_country}'s market to suggest underrated, high-potential domestic stocks — "
                f"NOT just mega-caps. Include specific tickers from that exchange. "
                f"Label them with '⭐ Domestic Pick' in the heading. Include at least 2–3 domestic picks in the top 5."
            )
        elif domestic_suggestions:
            lines = []
            for country, tickers in domestic_suggestions.items():
                if tickers:
                    lines.append(f"- {country}: {', '.join(tickers)}")
            if lines:
                domestic_block = (
                    "\n\nDOMESTIC UNDERRATED PICKS (ranked by 6-month return from sp500_ranked.json — "
                    "these are high-momentum, lesser-known stocks, NOT mega-caps):\n"
                    + "\n".join(lines)
                    + "\nYou MUST include at least 1–2 of these domestic picks in your top 5 where they "
                    "fit the user's strategy and asset interests. Label them with '⭐ Domestic Pick' in the heading."
                )
        elif user_country or any(w in q_lower for w in ("domestic", "local stock", "local share")):
            country_label = user_country or "the user's home country"
            domestic_block = (
                f"\n\nUSER COUNTRY: {country_label}\n"
                f"The user is based in {country_label}. When suggesting domestic stocks, recommend stocks listed "
                f"on {country_label}'s primary stock exchange (e.g. ASX for Australia, TSX for Canada, LSE for UK, "
                f"NSE/BSE for India, SGX for Singapore). "
                f"Use your knowledge of {country_label}'s market to suggest underrated, high-potential domestic stocks — "
                f"NOT just mega-caps. Include specific tickers from that exchange. "
                f"Label them with '⭐ Domestic Pick' in the heading. Include at least 2–3 domestic picks in the top 5."
            )

        block += f"""
TOP OPPORTUNITIES FORMAT — produce your QUESTION_RESPONSE using EXACTLY this structure.
Use ## and **bold** markdown formatting inside QUESTION_RESPONSE only.
Limit to asset classes in: {', '.join(asset_interests)}.
Align picks with strategy: {', '.join(strategies) if strategies else 'buy and hold'}.
{domestic_block}

## Top 5 Investment Opportunities — {now.strftime('%B %Y')}

**Selection Criteria**: Ranked by a combination of valuation attractiveness, earnings momentum, sector tailwinds, news sentiment, and risk-adjusted upside potential. Mix of well-known and underrated domestic picks.

**#1 [TICKER] — [Company Name]** | Confidence: [X]/10
- Current price: $[X] | P/E: [X]x | Forward P/E: [X]x | Market cap: $[X]B
- **Why selected**: [1-2 sentences — specific catalyst: earnings beat, product cycle, market position, valuation discount vs peers]
- **Sector analysis**: [market share %, TAM size, sector CAGR — all with figures]
- **Risk**: [Low / Medium / High] — [primary risk with specific detail]
- **Growth potential**: +[X]–[X]% over [timeframe]
- **Investment horizon**: [Short-term <1yr / Medium-term 1–3yr / Long-term 3yr+]

[Repeat #2, #3, #4, #5 in identical format]

**Portfolio fit for your profile**: [1 sentence on which picks best match the {', '.join(strategies) if strategies else 'buy and hold'} strategy and {experience} experience level{f', and fit within ${capital:,} capital' if capital else ''}]
**Methodology**: Selections based on live market data, news sentiment analysis, earnings signals, sector rotation, valuation vs. historical averages, and domestic momentum rankings.

Use MARKET ANALYSIS data for current prices. For any tickers not in the provided data, use your knowledge and mark figures as (est.).

CRITICAL — output ALL six sections in this exact order. The full opportunities list above goes inside [SECTION: QUESTION_RESPONSE]:
[SECTION: SUMMARY] → 2-3 sentences on current market conditions and theme
[SECTION: PROS] → 2-4 bullets (general market tailwinds supporting these picks)
[SECTION: CONS] → 2-4 bullets (market risks or headwinds to watch)
[SECTION: NEXT_STEPS] → 2-3 actionable bullets (how to act on these opportunities)
[SECTION: QUESTION_RESPONSE] → paste the FULL formatted top-5 list here
[SECTION: SOURCES] → list data sources (market data, news, earnings, sector analysis, sp500_ranked.json)
"""
        return block

    # ── ALLOCATION QUESTION ────────────────────────────────────────────────────
    if any(w in q_lower for w in _ALLOCATION_TRIGGERS):
        _raw_cap        = onboarding.get("investmentCapital") or onboarding.get("investment_capital")
        capital         = float(_raw_cap) if _raw_cap not in (None, "") else None
        asset_interests = onboarding.get("assetInterests") or onboarding.get("asset_interests") or []
        strategies      = onboarding.get("investmentStrategies") or onboarding.get("investment_strategies") or []
        experience      = onboarding.get("experienceLevel") or onboarding.get("experience_level", "beginner")
        time_horizon    = onboarding.get("timeHorizon") or onboarding.get("time_horizon", "monthly")
        age             = int(float(onboarding.get("age") or 30))
        _raw_ec         = onboarding.get("emergencyCash") or onboarding.get("emergency_cash") or 0
        emergency_cash  = float(_raw_ec) if _raw_ec not in (None, "") else 0

        primary_strategy = strategies[0] if strategies else "buy_and_hold"
        weights          = STRATEGY_WEIGHTS.get(primary_strategy, STRATEGY_WEIGHTS["buy_and_hold"])
        tickers          = STRATEGY_TICKERS.get(primary_strategy, STRATEGY_TICKERS["buy_and_hold"])

        if not (capital and asset_interests):
            return block

        n       = len(asset_interests)
        total_w = sum(weights.get(a, 1 / n) for a in asset_interests)
        splits  = []
        alloc_sections = []
        for asset in asset_interests:
            w          = weights.get(asset, 1 / n) / total_w
            dollar_amt = round(capital * w)
            pct        = round(w * 100)
            suggested  = ", ".join(tickers.get(asset, [])[:4])
            splits.append(f"{asset}: {pct}% = ${dollar_amt:,}  →  e.g. {suggested}")
            alloc_sections.append(
                f"### {asset.title()} ({pct}% = ${dollar_amt:,})\n"
                f"Suggested tickers: {suggested}\n"
                f"[Write 2-3 bullets explaining WHY each ticker fits the "
                f"{primary_strategy.replace('_', ' ')} strategy — include specific rationale such as "
                f"dividend yield, growth rate, liquidity, or sector exposure]"
            )

        target_year = now.year + 10

        block += f"""
ALLOCATION FORMAT — produce your QUESTION_RESPONSE using EXACTLY this structure.
Use ## and **bold** markdown formatting inside QUESTION_RESPONSE only.
Use these exact figures — do not change the dollar amounts or percentages:

## Portfolio Allocation Plan — ${capital:,} Capital | {time_horizon.title()} Horizon

**Your Investment Profile**
- Capital available: ${capital:,}
- Primary strategy: {primary_strategy.replace('_', ' ').title()}
- Time horizon: {time_horizon} | Age: {age} | Experience: {experience.title()}
- Asset interests: {', '.join(asset_interests)}

**Recommended Allocation**
{chr(10).join('- ' + s for s in splits)}

{chr(10).join(alloc_sections)}

**Why This Allocation?**
[2-3 sentences: explain the logic behind this specific mix given age {age}, strategy {primary_strategy.replace('_', ' ')}, and {time_horizon} horizon. Include the risk-return trade-off and why these weightings fit their profile.]

**Risk Management**
- Rebalancing: [recommend frequency appropriate to {time_horizon} horizon]
- Position sizing: [max % per single holding recommendation]
- Diversification note: [sector or geographic spread comment]
{f'- Emergency reserve: Keep ${emergency_cash:,} in cash outside the market — do not invest this' if emergency_cash > 0 else ''}

**10-Year Growth Projection**
At a [X]% estimated average annual return (based on historical benchmarks for this strategy), ${capital:,} could grow to approximately $[capital × (1+r)^10 calculated] by {target_year}.
If Prophet predictions are available for any suggested tickers, cite those figures.

CRITICAL — output ALL six sections in this exact order. The full allocation plan above goes inside [SECTION: QUESTION_RESPONSE]:
[SECTION: SUMMARY] → 2-3 sentences summarising the recommended allocation and rationale
[SECTION: PROS] → 2-4 bullets (strengths of this allocation for this profile)
[SECTION: CONS] → 2-4 bullets (risks or limitations of this plan)
[SECTION: NEXT_STEPS] → 2-3 bullets (immediate actions: open accounts, first purchases, set alerts)
[SECTION: QUESTION_RESPONSE] → paste the FULL formatted allocation plan here
[SECTION: SOURCES] → list data sources (onboarding profile, portfolio data, market data)
"""
        return block

    return block


# ================= BUILD PROMPT =================
def build_prompt(
    data, memories=None, user_question=None, onboarding=None,
    market_analysis_block="", market_prediction_block="", news_block="",
    domestic_suggestions=None, chat_history=None, user_country=""
):

    memory_block = "\n\n".join(m[:500] for m in memories) if memories else ""

    history_block = ""
    if chat_history:
        turns = []
        for msg in chat_history[-6:]:
            role    = msg.get("role", "")
            content = (msg.get("content") or "").strip()
            if not content:
                continue
            # Truncate long assistant responses to keep prompt under token limit
            if role == "user":
                turns.append(f"User: {content[:400]}")
            elif role == "assistant":
                turns.append(f"Elly: {content[:600]}")
        if turns:
            history_block = "CONVERSATION HISTORY (most recent exchanges — use this to answer follow-up questions):\n" + "\n".join(turns)

    onboarding = onboarding if onboarding is not None else (data.get("onboarding") or {})

    onboarding_experience    = onboarding.get("experienceLevel", "unknown")
    _raw_cap                 = onboarding.get("investmentCapital") or 0
    onboarding_capital       = int(float(_raw_cap)) if _raw_cap else 0
    onboarding_strategies    = onboarding.get("investmentStrategies", [])
    onboarding_strategy_text = (
        ", ".join(str(s).replace("_", " ").title() for s in onboarding_strategies)
        if onboarding_strategies else "none"
    )

    # Pop enrichment containers out of `data` so they don't get re-printed as JSON.
    market_context = data.pop("market_context", None) or {}
    geo_exposure   = data.pop("geographic_exposure", None) or {}

    market_context_block = _build_market_context_block(market_context)
    geo_block            = _build_geographic_exposure_block(geo_exposure)
    reserve_block        = _build_reserve_block(onboarding, data.get("summary") or {})
    priority_block       = _build_priority_block(user_question, onboarding, domestic_suggestions, user_country)

    portfolio_json = {k: v for k, v in data.items() if k != "market_context"}

    return f"""
You are a financial portfolio assistant with access to live market data and recent news.
{priority_block}
{history_block}
RELEVANT PAST CONVERSATIONS:
{memory_block}

IMPORTANT RULES:
- Use the portfolio JSON, live market data, and news provided below
- Do NOT invent data or prices — use MARKET ANALYSIS as the primary source for current prices and fundamentals
- Be thorough and data-driven — every claim must include at least one specific metric (%, price, ratio, or dollar amount)
- Do NOT include disclaimers
- Bullet points must start with "-"
- If market data or news is present, reference it directly in your answer
- Every claim about performance MUST include at least one metric (%, price, valuation, or ratio) — no vague phrases like "strong growth" or "positive momentum"
- If a hypothetical projection is provided, use those exact numbers and always state the timeframe
- If a Prophet prediction is provided in MARKET PREDICTIONS, cite the projected price, gain %, and timeframe explicitly
- When citing news, always state which company the headline is actually about
- Only reference news directly relevant to the holdings — ignore unrelated general market headlines
- Abbreviate any acronyms used
- The onboarding field contains the user's profile — always tailor advice to match it exactly
- onboarding.investmentCapital is their total available capital in dollars — use it for specific dollar allocation amounts
- onboarding.emergencyCash is the user's declared cash cushion held OUTSIDE the market — never recommend allocating it; treat it as separate from investmentCapital and use it (not investmentCapital) when discussing emergency reserve adequacy
- onboarding.investmentStrategies drives the allocation style: buy_and_hold → stable long-term assets; growth → high-growth stocks; income → dividend ETFs; day_trading → liquid high-volatility assets; index → broad index ETFs; dollar_cost_average → staggered entries
- onboarding.assetInterests lists which asset classes they want exposure to (stock, crypto, etf) — only recommend assets from this list
- onboarding.timeHorizon is their trading frequency (daily/weekly/monthly/annually/indefinitely) — factor this into how actively they should manage positions
- onboarding.experienceLevel affects complexity: beginner → keep it simple with 2-3 asset classes; advanced → can handle more granular splits
- When allocation is asked, give concrete percentage splits AND dollar amounts based on investmentCapital (e.g. "40% stocks = $20,000")
- If geographic exposure is provided, use it to describe domestic vs international spread in SUMMARY and reference specific exchanges (e.g. "your RELIANCE holding trades on the NSE in India")
- If more than 70% of the portfolio is concentrated in a single region, flag it as geographic concentration risk in CONS
- Crypto holdings are global and should be noted as such, not as domestic or international
- If the emergency reserve analysis shows coverage < 3 months, add it as a bullet in CONS using the exact coverage figure, and add a NEXT_STEPS bullet recommending they build cash savings to the 3-month minimum shown in the reserve analysis before investing further
- If coverage is 3–6 months, mention it as a strength in PROS
- If coverage is above 6 months, mention it as a strength in PROS
- Always cite the specific months covered when referencing emergency reserve (e.g. "0.8 months covered")

PORTFOLIO DATA:
{json.dumps(portfolio_json, indent=2)}
{reserve_block}{geo_block}{market_context_block}

MARKET ANALYSIS (primary numerical truth — yfinance snapshot):
{market_analysis_block}

MARKET PREDICTIONS (forward-looking Prophet projections — only present when user asked about future performance):
{market_prediction_block}

NEWS CONTEXT (sentiment / qualitative only — do not invent quotes):
{news_block}

STRICT OUTPUT FORMAT:
- You MUST output ALL six sections: SUMMARY, PROS, CONS, NEXT_STEPS, QUESTION_RESPONSE, SOURCES
- Section headers MUST match EXACTLY — every response must contain all six [SECTION: ...] markers
- No extra sections
- Markdown (##, ###, **bold**) is ONLY permitted inside QUESTION_RESPONSE — keep SUMMARY, PROS, CONS, and NEXT_STEPS as plain text with no headings

[SECTION: SUMMARY]
Write a comprehensive portfolio summary (3-5 sentences) covering overall performance, allocation breakdown, geographic spread, and the primary risk or opportunity. Include specific return percentages and dollar values where available.

[SECTION: PROS]
- List portfolio strengths with specific metrics (e.g. return %, P/E ratio, diversification score, yield)
- Up to 7 bullets — each must include at least one data point or figure

[SECTION: CONS]
- List portfolio weaknesses or risks with specific data points
- Up to 7 bullets — each must include at least one metric, percentage, or dollar figure

[SECTION: NEXT_STEPS]
- List concrete, actionable recommendations with specific amounts, percentages, or timeframes
- Up to 7 bullets — include dollar targets or percentage thresholds where relevant
- Must always include at least 1 bullet

[SECTION: QUESTION_RESPONSE]
If YOUR FIRST PRIORITY above specifies an exact format structure, follow that structure precisely using ## and **bold** markdown.
Otherwise: answer "{user_question if user_question else ''}" directly using portfolio data, MARKET ANALYSIS, MARKET PREDICTIONS, and NEWS CONTEXT.
Start with a direct conclusion grounded in data, then expand with specific numbers (%, prices, ratios).
Match complexity to experience level: {onboarding_experience}. Suggestions must stay within ${onboarding_capital:,} and align with strategy: {onboarding_strategy_text}.
If no question was provided write: No question provided.

[SECTION: SOURCES]
- List which datasets were used if any
"""


# ================= GROQ ANALYSIS =================
def get_analysis(prompt):
    import time
    for attempt in range(3):
        try:
            response = client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[
                    {
                        "role": "system",
                        "content": "You are a financial portfolio assistant."
                    },
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
                temperature=0.2
            )
            return response.choices[0].message.content
        except Exception as e:
            err = str(e)
            print(f"❌ Groq request error: {e}")
            # 413 = prompt too large — retrying won't help
            if "413" in err or ("rate_limit_exceeded" in err and "reduce your message" in err):
                print("[groq] Prompt too large — no retry.")
                return ""
            # TPD = daily limit exhausted — retrying won't help until tomorrow
            if "rate_limit_exceeded" in err and "tokens per day" in err.lower():
                print("[groq] Daily token limit reached — no retry.")
                return ""
            # TPM = per-minute limit — short wait may help
            if "rate_limit_exceeded" in err and attempt < 2:
                wait = 5 * (attempt + 1)
                print(f"[groq] Rate limited — retrying in {wait}s...")
                time.sleep(wait)
            else:
                return ""
    return ""


# ================= GENERIC SECTION PARSER =================
def extract_sections(text):

    pattern = r"\[SECTION:\s*([^\]]+)\]\s*(.*?)(?=\n\s*\[SECTION:|\Z)"

    matches = re.findall(
        pattern,
        text,
        re.DOTALL | re.IGNORECASE
    )

    sections = {}

    for name, content in matches:
        key = name.strip().lower()
        sections[key] = content.strip()

    return sections


# ================= BULLET CLEANER =================
def clean_bullets(text):

    bullets = []

    for line in text.split("\n"):

        line = line.strip()

        if not line:
            continue

        cleaned = re.sub(r"^[\-\*\•]\s*", "", line)

        bullets.append(cleaned)

    return bullets


# ================= STRUCTURED PARSER =================
def parse_output(text):

    sections = extract_sections(text)

    structured = {
        "summary": sections.get("summary", ""),
        "pros": clean_bullets(sections.get("pros", "")),
        "cons": clean_bullets(sections.get("cons", "")),
        "next_steps": clean_bullets(sections.get("next_steps", "")),
        "question_response": sections.get("question_response", ""),
        "sources": clean_bullets(sections.get("sources", ""))
    }

    # Fallback: when the LLM ignores section headers entirely (outputs raw markdown),
    # capture the full output as question_response so nothing is silently discarded.
    if not any([structured["summary"], structured["question_response"],
                structured["pros"], structured["cons"]]) and text.strip():
        structured["question_response"] = text.strip()

    return structured


# ================= SAVE OUTPUT =================
def save_output(parsed_data):
    """Best-effort debug snapshot. Never raises — a missing output directory
    must not turn a successful analysis into an HTTP 500."""
    try:
        out_dir = os.path.dirname(OUTPUT_FILE)
        if out_dir:
            os.makedirs(out_dir, exist_ok=True)
        with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
            json.dump(parsed_data, f, indent=2)
        print(f"💾 Saved to {OUTPUT_FILE}")
    except Exception as e:
        print(f"[save_output] non-fatal: {e}")


# 
def extract_portfolio_holdings(data):
    holdings = data.get("holdings", [])

    cleaned = []

    for h in holdings:
        asset_type = h.get("asset_type", "").lower()

        # skip cash
        if asset_type == "cash":
            continue

        cleaned.append({
            "symbol": normalize_ticker(h.get("symbol", "")),
            "name": h.get("name", ""),
            "type": asset_type,
            "quantity": h.get("quantity", 0),
            "market_value": h.get("marketValue", 0),
            "return_pct": h.get("returnPercentage", 0)
        })

    return cleaned


def _enrich_market_context(data: dict) -> None:
    """Populate data['market_context'] and data['geographic_exposure'] using
    csv_analyzer. Runs in parallel where the underlying yfinance calls can fan
    out (ticker_data lookups, geo exposure per holding).

    Safe to call whether or not the caller has already added these keys —
    pre-populated values from main.py are preserved.
    """
    user_question = (data.get("question") or "").strip()
    holdings      = data.get("holdings", [])

    # ---- market_context (ticker_data / hypothetical / historical) ----
    if user_question:
        portfolio_syms = [h.get("symbol", "") for h in holdings]
        try:
            mc = data.get("market_context") or {}

            # Live ticker data for any tickers named in the question
            if "ticker_data" not in mc:
                tickers = detect_tickers(user_question, portfolio_symbols=portfolio_syms)[:5]
                if tickers:
                    with ThreadPoolExecutor(max_workers=min(5, len(tickers))) as pool:
                        rows = list(pool.map(fetch_ticker_data, tickers))
                    ticker_data = {sym: td for sym, td in zip(tickers, rows) if td}
                    if ticker_data:
                        mc["ticker_data"] = ticker_data

            # "What if I invested $X in Y" CAGR projection
            if "hypothetical_projection" not in mc:
                amount, hyp_ticker = parse_hypothetical(user_question)
                if amount and hyp_ticker:
                    td = mc.get("ticker_data", {}).get(hyp_ticker) or fetch_ticker_data(hyp_ticker)
                    if td:
                        time_horizon = (data.get("onboarding") or {}).get("timeHorizon", "5 years")
                        years_match  = re.search(r"(\d+)", str(time_horizon))
                        years        = float(years_match.group(1)) if years_match else 5.0
                        projection   = project_investment_cagr(hyp_ticker, amount, years, td)
                        if projection:
                            mc["hypothetical_projection"] = projection

            # "If I'd bought in 2020" historical scenario
            if "historical_performance" not in mc:
                hist_year = detect_historical_year(user_question)
                if hist_year:
                    hist = calculate_historical_performance(holdings, hist_year)
                    if hist:
                        mc["historical_performance"] = hist

            if mc:
                data["market_context"] = mc
        except Exception as e:
            print(f"[csv_analyzer enrichment] non-fatal: {e}")

    # ---- geographic_exposure (parallel per holding) ----
    if "geographic_exposure" not in data and holdings:
        try:
            data["geographic_exposure"] = fetch_geographic_exposure(holdings)
        except Exception as e:
            print(f"[csv_analyzer geo_exposure] non-fatal: {e}")


def _reset_prophet_snapshot():
    """Clear the Prophet projection snapshot so stale predictions from prior
    requests don't leak into this run's market_prediction_block."""
    try:
        with open(PROPHET_SNAPSHOT, "w", encoding="utf-8") as f:
            json.dump([], f)
    except Exception as e:
        print(f"[prophet] Could not reset snapshot: {e}")

def get_country_list(tickers):
    lookup = {item["symbol"].upper(): item.get("country") for item in SP500_DATA}

    countries = set()

    for t in tickers:
        t = t.strip().upper()
        country = lookup.get(t)

        if country and country != "Unknown":
            countries.add(country)

    return list(countries)

def run_analysis(data: dict, memories=None) -> dict:
    """End-to-end analysis pipeline used by main.py /pf/portfolio-analysis.

    Pulls market_context (ticker_data / hypothetical / historical) and
    geographic_exposure via csv_analyzer. Memories may be passed in; if omitted
    they are retrieved here using the question's detected intent.
    """
    _reset_prophet_snapshot()

    # Run all market enrichment via csv_analyzer before building the prompt.
    _enrich_market_context(data)

    onboarding         = data.get("onboarding") or {}
    user_question      = data.get("question")
    chat_history       = data.get("history") or []
    portfolio_holdings = extract_portfolio_holdings(data)

    # ---- intent extraction: question tickers, portfolio tickers, predictions ----
    stock_section = extract_intent(data, portfolio_holdings, user_question)
    print("\n=== STOCK EXTRACTION ===")
    print(stock_section)

    stocks, portfolio_stocks, countriesMention = extract_stock_lines(stock_section)
    all_tickers = list({t.strip().upper() for t in (stocks + portfolio_stocks) if t})
    ticker_country_map = get_country_list(all_tickers)
    ticker_country_map.extend(c for c in countriesMention if c not in ticker_country_map)
    # Add user's declared country to the country list for domestic suggestions.
    user_country = (onboarding.get("country") or "").strip()
    print(f"[domestic] user_country={user_country!r}")
    SP500_COUNTRIES = {"United States", "US", "Canada", "Ireland", "Netherlands", "Singapore", "Switzerland", "Bermuda", "United Kingdom"}
    
    if user_country and user_country not in ticker_country_map:
        ticker_country_map.append(user_country)
    if not ticker_country_map:
        ticker_country_map = [user_country or "United States"]

    # Only query sp500_ranked.json for countries it actually covers.
    sp500_query_countries = [c for c in ticker_country_map if c in SP500_COUNTRIES]
    suggestions = get_top5_by_country("Feature3/ydata/sp500_ranked.json", sp500_query_countries) if sp500_query_countries else {}



    # ---- news (Finnhub via csv_analyzer — adds country + heuristic context) ----
    news_block = build_news_block(fetch_market_news(all_tickers, []))

    # ---- yfinance snapshot for the question tickers ----
    print("\n🔧 YFINANCE LIVE MODE:")
    analyze_ticker(stocks, portfolio_stocks)

    # ---- Prophet projections only for tickers the LLM flagged YES ----
    # Cap at 2 — each Prophet training takes ~1-3s and the 8b model tends to
    # over-flag YES on vague questions. Two predictions is plenty of context.
    MAX_PROPHET_RUNS = 2
    active_predictions = [p for p in parse_predictions(stock_section) if p["predict"]][:MAX_PROPHET_RUNS]
    if active_predictions:
        print(f"\n🚀 Running Prophet Predictions ({len(active_predictions)})...\n")
        run_prophet_predictions(active_predictions)

    # ---- memories ----
    print("\n=== CONTEXT MEMORIES ===")
    if memories:
        for i, m in enumerate(memories):
            print(f"\n--- MEMORY {i+1} ---")
            print(m)
    else:
        print("No memories retrieved")

    if memories is None:
        memories = retrieve_memories_by_intent(
            query=user_question or "portfolio analysis",
            intent=detect_intent(user_question or ""),
        )


    # ---- load on-disk snapshots written by analyze_ticker / Prophet ----
    csv_analysis_data   = _load_json(os.path.join(DATA_DIR, "csv_analysis_output.json"))
    csv_prediction_data = _load_json(PROPHET_SNAPSHOT)

    market_analysis_block, market_prediction_block = format_market_data(
        csv_analysis_data, csv_prediction_data
    )

    prompt = build_prompt(
        data,
        memories=memories,
        user_question=user_question,
        onboarding=onboarding,
        market_analysis_block=market_analysis_block,
        market_prediction_block=market_prediction_block,
        news_block=news_block,
        domestic_suggestions=suggestions,
        chat_history=chat_history,
        user_country=user_country,
    )

    raw_output = get_analysis(prompt)
    print("\n=== FINAL ANALYSIS ===")
    print(raw_output)

    parsed = parse_output(raw_output)
    save_output(parsed)
    try:
        store_sectioned_memories(user_question, parsed)
    except Exception as e:
        print(f"[memory] store_sectioned_memories failed (non-fatal): {e}")
    return parsed


def _load_json(path: str):
    if not os.path.exists(path):
        return []
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return []