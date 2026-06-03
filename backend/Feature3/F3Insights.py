import json
import re
import os
from concurrent.futures import ThreadPoolExecutor
from groq import Groq

try:
    from F3Insight_memory import retrieve_memories_by_intent, store_memories_batch
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
except ImportError:
    from Feature3.F3Insight_memory import retrieve_memories_by_intent, store_memories_batch
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

DATA_DIR = "ydata"

os.makedirs(DATA_DIR, exist_ok=True)
api_key = os.getenv("GROQ_API_KEY")

client = Groq(api_key=api_key)

# ================= FILE PATHS =================
OUTPUT_FILE = "../Llama Output/Feature_3_output.json"
PROPHET_SNAPSHOT = os.path.join(DATA_DIR, "csv_prediction_output_analysis.json")

DEFAULT_INVESTMENT = 1000


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
# 
def extract_intent(data, portfolio_holdings, user_question=None):
    prompt = f"""
You are a STRICT stock ticker extraction system.

USER QUESTION:
{user_question}
TASK: 1
Output Yahoo Finance tickers ONLY for companies EXPLICITLY NAMED in the user question above.

RULES:
- Output ONLY tickers for companies the user literally typed
- If the question is vague (e.g. "this stock", "the market", "my portfolio"), output NONE
- DO NOT add industry peers, competitors, or "related" stocks
- DO NOT list every tech / energy / index stock you know
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
    seen_q, seen_p = set(), set()

    capture = None  # None | "stocks" | "portfolio"

    for line in text.split("\n"):
        line = line.strip()

        if line.upper().startswith("[SECTION: STOCKS_PORFOLIO]"):
            capture = "portfolio"
            continue

        if line.upper().startswith("[SECTION: STOCKS]"):
            capture = "stocks"
            continue

        if line.startswith("[SECTION:"):
            capture = None
            continue

        if not (capture and _is_ticker_like(line)):
            continue

        sym = line.upper()
        if capture == "stocks" and sym not in seen_q and len(stocks) < MAX_QUESTION_TICKERS:
            seen_q.add(sym)
            stocks.append(sym)
        elif capture == "portfolio" and sym not in seen_p and len(portfolio) < MAX_PORTFOLIO_TICKERS:
            seen_p.add(sym)
            portfolio.append(sym)

    return stocks, portfolio
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
    "allocat", "invest in", "what should", "split", "distribute",
    "put my", "divide", "recommend", "suggest", "where should",
)


def _build_priority_block(user_question: str, onboarding: dict) -> str:
    if not user_question:
        return ""

    block = f"""
YOUR FIRST PRIORITY — ANSWER THIS QUESTION DIRECTLY:
"{user_question}"
Look at the portfolio data below and answer this specific question before doing anything else.
"""

    onboarding = onboarding or {}
    q_lower = user_question.lower()
    if not any(w in q_lower for w in _ALLOCATION_TRIGGERS):
        return block

    capital         = onboarding.get("investmentCapital") or onboarding.get("investment_capital")
    asset_interests = onboarding.get("assetInterests") or onboarding.get("asset_interests") or []
    strategies      = onboarding.get("investmentStrategies") or onboarding.get("investment_strategies") or []
    experience      = onboarding.get("experienceLevel") or onboarding.get("experience_level", "beginner")
    time_horizon    = onboarding.get("timeHorizon") or onboarding.get("time_horizon", "monthly")
    age             = onboarding.get("age", 30)

    primary_strategy = strategies[0] if strategies else "buy_and_hold"
    weights = STRATEGY_WEIGHTS.get(primary_strategy, STRATEGY_WEIGHTS["buy_and_hold"])
    tickers = STRATEGY_TICKERS.get(primary_strategy, STRATEGY_TICKERS["buy_and_hold"])

    if not (capital and asset_interests):
        return block

    n = len(asset_interests)
    total_w = sum(weights.get(a, 1 / n) for a in asset_interests)
    splits = []
    for asset in asset_interests:
        w = weights.get(asset, 1 / n) / total_w
        dollar_amt = round(capital * w)
        suggested = ", ".join(tickers.get(asset, [])[:3])
        splits.append(f"{asset}: {round(w*100)}% = ${dollar_amt:,}  →  e.g. {suggested}")

    block += f"""
PERSONALISED RECOMMENDATION REQUIRED — answer using these exact figures:

User profile:
- Capital available: ${capital:,}
- Age: {age}
- Strategy: {', '.join(strategies)}
- Time horizon: {time_horizon}
- Experience: {experience}
- Asset interests: {', '.join(asset_interests)}

Suggested allocation (use these numbers exactly):
{chr(10).join('- ' + s for s in splits)}

In QUESTION_RESPONSE:
1. Open with: "Based on your ${capital:,} capital, {time_horizon} horizon, and {primary_strategy.replace('_', ' ')} strategy, here's what I'd recommend:"
2. For each asset class above, give the dollar amount AND 2-3 specific ticker examples from the list
3. Add 1 sentence explaining why this suits their strategy and age
4. Keep it under 150 words
"""
    return block


# ================= BUILD PROMPT =================
def build_prompt(
    data, memories=None, user_question=None, onboarding=None,
    market_analysis_block="", market_prediction_block="", news_block=""
):

    memory_block = "\n\n".join(memories) if memories else ""

    onboarding = onboarding if onboarding is not None else (data.get("onboarding") or {})

    onboarding_experience    = onboarding.get("experienceLevel", "unknown")
    onboarding_capital       = onboarding.get("investmentCapital", 0)
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
    priority_block       = _build_priority_block(user_question, onboarding)

    portfolio_json = {k: v for k, v in data.items() if k != "market_context"}

    return f"""
You are a financial portfolio assistant with access to live market data and recent news.
{priority_block}
RELEVANT PAST CONVERSATIONS:
{memory_block}

IMPORTANT RULES:
- Use the portfolio JSON, live market data, and news provided below
- Do NOT invent data or prices
- Keep responses concise and use plain English
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
- Section headers MUST match EXACTLY
- No extra sections
- No markdown headings

[SECTION: SUMMARY]
Write a short portfolio summary (2-3 sentences).

[SECTION: PROS]
- List portfolio strengths
- Max 5 bullets

[SECTION: CONS]
- List portfolio weaknesses or risks
- Max 5 bullets

[SECTION: NEXT_STEPS]
- List practical recommendations based on portfolio and any market data provided
- Max 5 bullets
- Must always include at least 1 bullet

[SECTION: QUESTION_RESPONSE]
Answer the question "{user_question if user_question else ''}" directly using the portfolio data, MARKET ANALYSIS, MARKET PREDICTIONS, and NEWS CONTEXT above.
Start with a direct conclusion grounded in the data, then expand with specific numbers (%, prices, ratios) from MARKET ANALYSIS.
Use specific holding names. Keep under 240 words.
If the question is about allocation or what to invest in, give concrete percentage splits AND dollar amounts based on onboarding.investmentCapital, broken down by asset class (stocks/crypto/ETFs) matching onboarding.assetInterests.
Match complexity to user experience level: {onboarding_experience}.
Suggestions must stay within ${onboarding_capital:,} and align with strategy: {onboarding_strategy_text}.
If no question was provided write: No question provided.

[SECTION: SOURCES]
- List which datasets were used if any
"""


# ================= GROQ ANALYSIS =================
def get_analysis(prompt):
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
        print(f"❌ Groq request error: {e}")
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


def build_memory_fact(parsed):

    summary = parsed.get("summary", "").strip()

    pros = parsed.get("pros", [])
    cons = parsed.get("cons", [])
    next_steps = parsed.get("next_steps", [])
    question_response = parsed.get("question_response", "").strip()
    sources = parsed.get("sources", [])

    key_strengths = ", ".join(pros[:2]) if pros else "none identified"
    key_risks = ", ".join(cons[:2]) if cons else "none identified"
    key_actions = ", ".join(next_steps[:2]) if next_steps else "none identified"
    key_sources = ", ".join(sources[:2]) if sources else "none identified"

    memory_text = f"""
Portfolio insight: {summary}
Key strengths: {key_strengths}
Key risks: {key_risks}
Recommended actions: {key_actions}
User question response: {question_response}
Data sources used: {key_sources}
""".strip()

    return memory_text

def store_sectioned_memories(user_question, parsed):

    base = user_question or "portfolio analysis"

    memories = []

    # 1. SUMMARY (single memory)
    if parsed.get("summary"):
        memories.append({
            "user": base + " summary",
            "assistant": parsed["summary"],
            "section": "summary"
        })

    # 2. PROS (single block memory)
    if parsed.get("pros"):
        pros_block = "\n".join(parsed["pros"])
        memories.append({
            "user": base + " pros",
            "assistant": pros_block,
            "section": "pros"
        })

    # 3. CONS (single block memory)
    if parsed.get("cons"):
        cons_block = "\n".join(parsed["cons"])
        memories.append({
            "user": base + " cons",
            "assistant": cons_block,
            "section": "cons"
        })

    # 4. NEXT STEPS (single block memory)
    if parsed.get("next_steps"):
        next_block = "\n".join(parsed["next_steps"])
        memories.append({
            "user": base + " next_steps",
            "assistant": next_block,
            "section": "next_steps"
        })

    # 5. RESPONSE (single memory)
    if parsed.get("question_response"):
        memories.append({
            "user": base + " response",
            "assistant": parsed["question_response"],
            "section": "response"
        })

    if memories:
        store_memories_batch(memories)

def detect_intent(question):

    q = question.lower()

    if any(x in q for x in ["risk", "reduce", "safe", "loss"]):
        return "cons"

    if any(x in q for x in ["next", "what should", "do", "improve"]):
        return "next_steps"

    if any(x in q for x in ["performance", "how is", "portfolio"]):
        return "summary"

    return "general"


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
    portfolio_holdings = extract_portfolio_holdings(data)

    # ---- intent extraction: question tickers, portfolio tickers, predictions ----
    stock_section = extract_intent(data, portfolio_holdings, user_question)
    print("\n=== STOCK EXTRACTION ===")
    print(stock_section)

    stocks, portfolio_stocks = extract_stock_lines(stock_section)
    all_tickers = list({t.strip().upper() for t in (stocks + portfolio_stocks) if t})

    # ---- news (Finnhub via csv_analyzer — adds country + heuristic context) ----
    news_block = build_news_block(fetch_market_news(all_tickers, []))

    # ---- yfinance snapshot for the question tickers ----
    print("\n🔧 YFINANCE LIVE MODE:")
    analyze_ticker(stocks)

    # ---- Prophet projections only for tickers the LLM flagged YES ----
    # Cap at 2 — each Prophet training takes ~1-3s and the 8b model tends to
    # over-flag YES on vague questions. Two predictions is plenty of context.
    MAX_PROPHET_RUNS = 2
    active_predictions = [p for p in parse_predictions(stock_section) if p["predict"]][:MAX_PROPHET_RUNS]
    if active_predictions:
        print(f"\n🚀 Running Prophet Predictions ({len(active_predictions)})...\n")
        run_prophet_predictions(active_predictions)

    # ---- memories ----
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
    )

    raw_output = get_analysis(prompt)
    print("\n=== FINAL ANALYSIS ===")
    print(raw_output)

    parsed = parse_output(raw_output)
    save_output(parsed)
    store_sectioned_memories(user_question, parsed)
    return parsed


def _load_json(path: str):
    if not os.path.exists(path):
        return []
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return []