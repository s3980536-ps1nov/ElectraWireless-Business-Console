import json
import re
import time
from F3Insight_memory import retrieve_memories_by_intent, store_memories_batch
import os
from groq import Groq
from csv_analyzer import run as analyze_ticker, project_investment_prophet, format_market_data, fetch_market_news, build_news_block

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

DEFAULT_INVESTMENT = 1000

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
# def parse_predictions(text: str):
#     lines = [l.strip() for l in text.split("\n") if l.strip()]

#     predictions = []
#     i = 0

#     while i < len(lines):
#         if lines[i].startswith("["):
#             i += 1
#             continue

#         if i + 2 < len(lines):
#             ticker = lines[i]
#             flag = lines[i + 1].upper()
#             timeframe = lines[i + 2]

#             predictions.append({
#                 "ticker": ticker,
#                 "predict": flag == "YES",
#                 "years": extract_years(timeframe)
#             })

#             i += 3
#         else:
#             break

#     return predictions

def parse_predictions(text: str):
    lines = [l.strip() for l in text.splitlines()]

    # Find prediction section
    start = None
    for i, line in enumerate(lines):
        if line.upper() == "[SECTION: PREDICTIONS]":
            start = i + 1
            break

    if start is None:
        return []

    # Only keep prediction lines
    lines = [l for l in lines[start:] if l]

    predictions = []
    i = 0

    while i + 3 < len(lines):
        ticker = lines[i]
        flag = lines[i + 1].upper()
        timeframe = lines[i + 2]
        country = lines[i + 3]

        predictions.append({
            "ticker": ticker,
            "predict": flag == "YES",
            "years": extract_years(timeframe),
            "country": country
        })

        i += 4

    return predictions

def extract_years(text: str):
    import re
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
Convert all mentioned companies in the user question into VALID Yahoo Finance ticker symbols.

RULES:
- Output ONLY valid Yahoo Finance tickers
- Do not include non stock or etfs
- NEVER output company names
- NEVER output misspellings
- If no stocks → output NONE
- One ticker per line
- No explanations
- Do not list out Tasks

FORMAT:
[SECTION: STOCKS]
<TICKER>
<TICKER>

TASK: 2
USER PORTFOLIO:
{portfolio_holdings}
Convert all mentioned companies in the user question into VALID Yahoo Finance ticker symbols.
RULES:
- Output ONLY valid Yahoo Finance tickers
- Do not include non stock or etfs
- NEVER output company names
- NEVER output misspellings
- If no stocks → output NONE
- One ticker per line
- No explanations
- Do not list out Tasks

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

Then list the country of origin of the stock/etf

OUTPUT FORMAT:
[SECTION: PREDICTIONS]
<TICKER>
<YES | NO>
<TIMEFRAME>
<COUNTRY OF ORIGIN>

FORMAT RULES:
- No Notes
- only exact output format
- Do not list out Tasks
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
    stocks = []
    portfolio = []

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

        if capture and line and line.upper() != "NONE":
            if capture == "stocks":
                stocks.append(line)
            elif capture == "portfolio":
                portfolio.append(line)

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

# ================= BUILD PROMPT =================
def build_prompt(
    data, portfolio_holdings, memories=None, user_question=None, onboarding=None,
    market_analysis_block="", market_prediction_block="", news_block=""):
    
    memory_block = "\n\n".join(memories) if memories else ""

    onboarding = onboarding or {}

    onboarding_available = onboarding.get("available", False)
    onboarding_age = onboarding.get("age", None)
    onboarding_experience = onboarding.get("experienceLevel", "unknown")
    onboarding_capital = onboarding.get("investmentCapital", 0)
    onboarding_style = onboarding.get("communicationStyle", "normal")
    onboarding_strategies = onboarding.get("investmentStrategies", [])
    onboarding_strategy_text = ", ".join(str(s).replace("_", " ").title() for s in onboarding_strategies) if onboarding_strategies else "none"

    return f"""

You are a financial portfolio assistant.

RELEVANT PAST CONVERSATIONS:
{memory_block}

Your task is to analyze the provided portfolio JSON.

IMPORTANT RULES:
- Use provided JSON AND STOCK MARKET DATA if available
- Do NOT invent data
- Keep responses concise
- Use plain English
- Do NOT include disclaimers
- If information cannot be determined, say so
- Bullet points must start with "-"

USER PORTFOLIO:
{json.dumps(data, indent=2)}

STRICT OUTPUT FORMAT:
- Section headers MUST match EXACTLY
- No extra sections
- No markdown headings

[SECTION: SUMMARY]
Write a short portfolio summary around 2 secntences in length

[SECTION: PROS]
- List portfolio strengths
- Max 5 bullets

[SECTION: CONS]
- List portfolio weaknesses or risks
- Max 5 bullets

[SECTION: NEXT_STEPS]
- List practical recommendations
- Max 5 bullets

[SECTION: QUESTION_RESPONSE]
Answer the user question using the provided data blocks.

USER QUESTION:
{user_question if user_question else "NO QUESTION PROVIDED"}

HARD RULES:
- You MUST use numbers from MARKET ANALYSIS and NEWS BLOCK where available
- Do NOT use vague phrases like "strong growth", "positive momentum", "performing well"
- Every claim about performance MUST include at least one metric (%, price, valuation, or ratio)
- If a metric exists in MARKET ANALYSIS, you MUST reference it
- If conflicting signals exist, mention both briefly
- Do NOT hallucinate external news or assumptions
- Make sure to abreviate any acryonyms used

AVAILABLE DATA SOURCES:
- {market_analysis_block} (primary numerical truth)
- {market_prediction_block} (forward-looking signals)
- {news_block} (sentiment/context only)

RESPONSE STYLE:
- Start with a direct conclusion based off of the available data then expand on this using numbers
- the response should be about 2 paragraphs in length
- Keep under 240 words
- Match complexity to user level: {onboarding_experience}
- Suggestions must be within the constraints of ${onboarding_capital}
- any investments should be recommended in line with this strategy {onboarding_strategy_text}

[SECTION: SOURCES]
- List which datasets were used if any
"""
# 

# [SECTION: QUESTION_RESPONSE]
# Answer without repeating the question:
# {user_question if user_question else "NO QUESTION PROVIDED"}
# Only answer if a question exists. If not, respond: "No question provided."
# Adapt to user level: {onboarding_experience}
# Beginner or Similar: simple terms, basic strategies and analysis only, no complex instruments
# Intermediate or Similar: moderate strategies and analysis with brief explanations
# Advanced or Similar: allow complex strategies and analysis but keep explanations clear
# Always match advice complexity to user understanding level
# Answer it directly in under 240 words.
# Any suggestions made must be within the limit of ${onboarding_capital}
# Use context from {news_block}, {market_analysis_block} and {market_prediction_block} where relevant, include relevant numbers

# [SECTION: PROFILE]
# - Available: {onboarding_available}
# - Age: {onboarding_age}
# - Experience Level: {onboarding_experience}
# - Investment Capital: ${onboarding_capital}
# - Communication Style: {onboarding_style}
# - Preferred Strategies: {onboarding_strategy_text}
# 

# ================= LOCAL OLLAMA =================
def get_analysis(prompt):
# 
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

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(parsed_data, f, indent=2)

    print(f"💾 Saved to {OUTPUT_FILE}")


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
# 

def build_market_data_block(csv_analysis_data, csv_prediction_data):
    return f"""
[MARKET_DATA: ANALYSIS]
{json.dumps(csv_analysis_data, indent=2)}

[MARKET_DATA: PREDICTIONS]
{json.dumps(csv_prediction_data, indent=2)}
"""
# 

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
def run():
    start = time.perf_counter()
    data = load_input()
    # ================= RESET PROPHET SNAPSHOT =================
    predicitonOutput = "ydata/csv_prediction_output_analysis.json"
    with open(predicitonOutput, "w", encoding="utf-8") as f:
        json.dump([], f)
    # ================= RESET PROPHET SNAPSHOT =================
    if not data:
        return
    print("🔍 Generating analysis...\n")
# ================= ONBOARDING EXTRACTION =================
    onboarding = data.get("onboarding", {})
    user_question = data.get("question", None)
    portfolio_holdings = extract_portfolio_holdings(data)
# ================= ONBOARDING EXTRACTION =================
    # STEP 2: STOCK EXTRACTION
    stock_section = extract_intent(data, portfolio_holdings, user_question)
    print("\n=== STOCK EXTRACTION ===")
    print(stock_section)
    stocks, portfolio_stocks = extract_stock_lines(stock_section)
    all_tickers = stocks + portfolio_stocks
    all_tickers = list(set([t.strip().upper() for t in all_tickers if t]))
    # news_data =
    news_data = fetch_market_news(all_tickers, [])
    news_block = build_news_block(news_data)

    print("\n🔧 YFINANCE LIVE MODE:")
    csv_analysis_data = analyze_ticker(stocks)
    predictions = parse_predictions(stock_section)
    print("\n=== PARSED PREDICTIONS ===")
    print(json.dumps(predictions, indent=2))

    active_predictions = [p for p in predictions if p["predict"]]
    if active_predictions:
        print("\n🚀 Running Prophet Predictions...\n")
        run_prophet_predictions(active_predictions)
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
    csv_prediction_path = os.path.join(DATA_DIR, "csv_prediction_output_analysis.json")

    csv_analysis_data = []
    csv_prediction_data = []

    if os.path.exists(csv_analysis_path):
        with open(csv_analysis_path, "r", encoding="utf-8") as f:
            csv_analysis_data = json.load(f)
    if os.path.exists(csv_prediction_path):
        with open(csv_prediction_path, "r", encoding="utf-8") as f:
            csv_prediction_data = json.load(f)
    # COMPACT MARKET DATA BLOCK (NEW FORMATTER)
    market_analysis_block, market_prediction_block = format_market_data(
        csv_analysis_data,
        csv_prediction_data
    )
    # ================= BUILD FINAL PROMPT =================
    prompt = build_prompt(
        data,
        portfolio_holdings,
        memories,
        user_question,
        onboarding,
        market_analysis_block,
        market_prediction_block,
        news_block
    )
    raw_output = get_analysis(prompt)
    print("\n=== FINAL ANALYSIS ===")
    print(raw_output)
    parsed = parse_output(raw_output)
    save_output(parsed)
    store_sectioned_memories(user_question, parsed)

    print("\nTOTAL TIME:", time.perf_counter() - start)
if __name__ == "__main__":
    run()