import json
import re
import time
try:
    from F3Insight_memory import retrieve_memories_by_intent, store_memories_batch
except ImportError:
    from Feature3.F3Insight_memory import retrieve_memories_by_intent, store_memories_batch
import os
from groq import Groq
try:
    from csv_analyzer import run as analyze_ticker
    from market_research import fetch_geographic_exposure
except ImportError:
    from Feature3.csv_analyzer import run as analyze_ticker
    from Feature3.market_research import fetch_geographic_exposure
from fastapi import FastAPI
from pydantic import BaseModel

# ================= FASTAPI APP =================
app = FastAPI()

# ================= REQUEST MODEL =================
class PortfolioRequest(BaseModel):
    data: dict

DATA_DIR = "ydata"

os.makedirs(DATA_DIR, exist_ok=True)
api_key = os.getenv("GROQ_API_KEY")

client = Groq(api_key=api_key)

# ================= FILE PATHS =================
INPUT_FILE = "../Llama Input/Feature_3_input.json"
OUTPUT_FILE = "../Llama Output/Feature_3_output.json"

# ================= CONFIG =================
MODEL_NAME = "llama3.1:8b"

EXPECTED_SECTIONS = [
    "summary",
    "pros",
    "cons",
    "next_steps",
    "question_response",
    "sources"
]

# ================= LOAD INPUT =================
def load_input():
    try:
        with open(INPUT_FILE, "r", encoding="utf-8") as f:
            return json.load(f)

    except FileNotFoundError:
        print(f"❌ Could not find {INPUT_FILE}")

    except json.JSONDecodeError:
        print("❌ Invalid JSON")

    return None

# 
def extract_stocks_only(data, user_question=None):

    prompt = f"""
You are a STRICT stock ticker extraction system.

USER QUESTION:
{user_question}

TASK:
Convert all mentioned companies into VALID Yahoo Finance ticker symbols.

RULES:
- Output ONLY valid Yahoo Finance tickers
- NEVER output company names
- NEVER output misspellings
- If unsure, guess the correct major ticker
- If no stocks → output NONE
- One ticker per line
- No explanations

FORMAT:
[SECTION: STOCKS]
<TICKER>
<TICKER>
"""

    res = client.chat.completions.create(
        model="llama-3.1-8b-instant",
        messages=[
            {"role": "system", "content": "Return ONLY STOCKS section."},
            {"role": "user", "content": prompt}
        ],
        temperature=0
    )

    return res.choices[0].message.content.strip()
# 
def extract_stock_lines(text):
    lines = []
    capture = False

    for line in text.split("\n"):
        line = line.strip()

        if line.lower().startswith("[section: stocks]"):
            capture = True
            continue

        if capture:
            if line.startswith("[SECTION:"):
                break

            if line and line.upper() != "NONE":
                lines.append(line)

    return lines
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

    news = market_context.get("news", {})
    company_news = news.get("company", {})
    market_news  = news.get("market", [])

    if company_news:
        lines.append("\n=== RECENT COMPANY NEWS ===")
        for sym, articles in company_news.items():
            if articles:
                lines.append(f"\n{sym} headlines:")
                for a in articles:
                    lines.append(f"  - {a['headline']}")
                    if a.get("summary"):
                        lines.append(f"    {a['summary'][:200]}")

    if market_news:
        lines.append("\n=== GENERAL MARKET NEWS ===")
        for a in market_news:
            lines.append(f"  - {a['headline']}")
            if a.get("summary"):
                lines.append(f"    {a['summary'][:200]}")

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


# ================= BUILD PROMPT =================
def build_prompt(data, memories=None, user_question=None):

    memory_block        = ""
    market_context_block = ""
    priority_block      = ""

    if user_question:
        priority_block = f"""
YOUR FIRST PRIORITY — ANSWER THIS QUESTION DIRECTLY:
"{user_question}"
Look at the portfolio data below and answer this specific question before doing anything else.
"""
        # For allocation / "what should I invest in" questions, inject profile + splits + specific tickers
        onboarding = data.get("onboarding") or {}
        q_lower = user_question.lower()
        if any(w in q_lower for w in ["allocat", "invest in", "what should", "split", "distribute", "put my", "divide", "recommend", "suggest", "where should"]):
            capital = onboarding.get("investmentCapital") or onboarding.get("investment_capital")
            asset_interests = onboarding.get("assetInterests") or onboarding.get("asset_interests") or []
            strategies = onboarding.get("investmentStrategies") or onboarding.get("investment_strategies") or []
            experience = onboarding.get("experienceLevel") or onboarding.get("experience_level", "beginner")
            time_horizon = onboarding.get("timeHorizon") or onboarding.get("time_horizon", "monthly")
            age = onboarding.get("age", 30)

            # Strategy-based weights and specific ticker suggestions
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

            primary_strategy = strategies[0] if strategies else "buy_and_hold"
            weights = STRATEGY_WEIGHTS.get(primary_strategy, STRATEGY_WEIGHTS["buy_and_hold"])
            tickers = STRATEGY_TICKERS.get(primary_strategy, STRATEGY_TICKERS["buy_and_hold"])

            if capital and asset_interests:
                n = len(asset_interests)
                total_w = sum(weights.get(a, 1/n) for a in asset_interests)
                splits = []
                for asset in asset_interests:
                    w = weights.get(asset, 1/n) / total_w
                    dollar_amt = round(capital * w)
                    suggested = ", ".join(tickers.get(asset, [])[:3])
                    splits.append(f"{asset}: {round(w*100)}% = ${dollar_amt:,}  →  e.g. {suggested}")

                priority_block += f"""
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

    if memories:
        memory_block = "\n\n".join(memories)

    market_context = data.pop("market_context", None) or {}
    if market_context:
        market_context_block = _build_market_context_block(market_context)

    geo_exposure = data.pop("geographic_exposure", None) or {}
    geo_block = _build_geographic_exposure_block(geo_exposure)

    # ================= EMERGENCY CASH RESERVE =================
    # Prefer the user-declared emergencyCash (onboarding) over the PF-derived
    # cashBalance (summary) — the onboarding value is the cushion the user
    # explicitly says lives outside the portfolio.
    reserve_block = ""
    _onboarding = data.get("onboarding") or {}
    _summary = data.get("summary") or {}
    monthly_expenses = (
        _onboarding.get("monthlyExpenses")
        or _onboarding.get("monthly_expenses")
    )
    emergency_cash = (
        _onboarding.get("emergencyCash")
        if _onboarding.get("emergencyCash") not in (None, 0)
        else None
    )
    cash_balance = emergency_cash if emergency_cash is not None else _summary.get("cashBalance")

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

        reserve_block = f"""
=== EMERGENCY CASH RESERVE ANALYSIS ===
Cash balance:              ${cash_balance:,.2f}
Monthly expenses:          ${monthly_expenses:,.2f}
Recommended reserve (3–6 months): ${reserve_min:,.2f} – ${reserve_max:,.2f}
Current coverage:          {months_covered:.1f} months
Status:                    {status}
"""
    elif emergency_cash is not None:
        # Coverage analysis needs monthly_expenses (PF data) — without it we
        # can't compute months covered, but we still must surface the cushion
        # figure plainly so the LLM doesn't latch onto summary.cashBalance (= $0).
        reserve_block = f"""
=== EMERGENCY CASH RESERVE ===
Emergency cash on hand:    ${emergency_cash:,.2f} (user-declared, held outside the market)
Monthly expenses:          not available — connect Personal Finance to compute months of coverage
When referencing the user's emergency cash, use this figure ${emergency_cash:,.2f}, NOT summary.cashBalance.
"""

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
- If a hypothetical projection is provided, use those exact numbers and always state the timeframe
- When citing news, always state which company the headline is actually about
- Only reference news directly relevant to the holdings — ignore unrelated general market headlines
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
Answer the question "{user_question if user_question else ''}" directly using the portfolio data and market data above.
Use specific numbers and holding names. Keep under 200 words.
If the question is about allocation or what to invest in, give concrete percentage splits AND dollar amounts based on onboarding.investmentCapital, broken down by asset class (stocks/crypto/ETFs) matching onboarding.assetInterests.
If no question was provided write: No question provided.

[SECTION: SOURCES]
- List which datasets were used if any
"""


# ================= LOCAL OLLAMA =================
def get_analysis(prompt):

    try:
        response = client.chat.completions.create(
            model="llama-3.1-8b-instant",
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

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(parsed_data, f, indent=2)

    print(f"💾 Saved to {OUTPUT_FILE}")


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

# ================= MAIN =================

@app.post("/pf/portfolio-analysis")
def portfolio_analysis(request: PortfolioRequest):
    start = time.perf_counter()

    data = load_input()
    if not data:
        return

    print("🔍 Generating analysis...\n")

    user_question = data.get("question", None)

    # STEP 2: GEOGRAPHIC EXPOSURE
    holdings = data.get("holdings", [])
    data["geographic_exposure"] = fetch_geographic_exposure(holdings)

    # STEP 3: STOCK EXTRACTION
    stock_section = extract_stocks_only(data, user_question)

    print("\n=== STOCK EXTRACTION ===")
    print(stock_section)

    stocks = extract_stock_lines(stock_section)
    
    csv_analysis_data = analyze_ticker(stocks)

    # ================= MEMORY RETRIEVAL =================
    user_question = data.get("question", None)

    intent = detect_intent(user_question or "")
    query = user_question or "portfolio analysis"

    memories = retrieve_memories_by_intent(
        query=query,
        intent=intent
    )

    print("\n=== CONTEXT MEMORIES ===")
    if memories:
        for i, m in enumerate(memories):
            print(f"\n--- MEMORY {i+1} ---")
            print(m)
    else:
        print("No memories retrieved")

    # STEP 4: MAIN LLM ANALYSIS
    # ================= LOAD CSV ANALYSIS JSON =================
    csv_analysis_path = os.path.join(DATA_DIR, "csv_analysis_output.json")
    csv_analysis_data = []

    if os.path.exists(csv_analysis_path):
        with open(csv_analysis_path, "r", encoding="utf-8") as f:
            csv_analysis_data = json.load(f)

    # ================= BUILD FINAL PROMPT =================
    prompt = build_prompt(
        data,
        memories,
        user_question
    ) + f"""

    STOCK MARKET DATA ANALYSIS:
    {json.dumps(csv_analysis_data, indent=2)}

    IMPORTANT:
    - Use this stock market data when answering stock-related questions
    - Compare stock performance using change_pct
    - Mention stronger performers when relevant
    - Use ticker performance trends when suggesting additions to portfolio
    """

    raw_output = get_analysis(prompt)

    print("\n=== FINAL ANALYSIS ===")
    print(raw_output)

    parsed = parse_output(raw_output)
    save_output(parsed)

    store_sectioned_memories(user_question, parsed)

    # ================= BUILD ALLOCATION RESPONSE =================
    geo_exposure = data.get("geographic_exposure") or {}
    by_geography = {
        r["region"]: r["weight_pct"]
        for r in geo_exposure.get("by_region", [])
    }

    existing_allocation = data.get("allocation") or {}
    allocation = {
        "byAssetType":  existing_allocation.get("byAssetType", {}),
        "bySymbol":     existing_allocation.get("bySymbol", {}),
        "byGeography":  by_geography,
    }

    print("\nTOTAL TIME:", time.perf_counter() - start)
    return {**parsed, "allocation": allocation}