import os
import json
import re
from groq import Groq
import requests
from fastapi import FastAPI
from pydantic import BaseModel
from pathlib import Path
try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).parent / ".env")
except ImportError:
    pass

# FastAPI setup
app = FastAPI()

class QuestionRequest(BaseModel):
    question: str

# FastAPI endpoint
@app.post("/analyze")
def analyze(request: QuestionRequest):
    historical, prophet_forecast, slider_forecast = get_forecast_context()
    analysis = get_analysis(request.question, historical, prophet_forecast, slider_forecast)
    structured = parse_output(analysis)
    return structured

def get_forecast_context(
    starting_mrr: float = 18000,
    growth_rate: float = 8.0,
    churn_rate: float = 3.0,
    cogs_percent: float = 22.0,
    marketing_spend: float = 4000.0,
    payroll: float = 35000.0,
    months: int = 12,
):
    url = "https://electrawireless-business-console.onrender.com/prophet-forecast"

    payload = {
        "starting_mrr": starting_mrr,
        "growth_rate": growth_rate,
        "churn_rate": churn_rate,
        "cogs_percent": cogs_percent,
        "marketing_spend": marketing_spend,
        "payroll": payroll,
        "months": months,
    }

    response = requests.post(url, json=payload)
    data = response.json()

    historical = data["historical"]
    prophet_forecast = data["prophet_forecast"]
    slider_forecast = data["slider_forecast"]

    return historical, prophet_forecast, slider_forecast

# Get user question
def get_user_question():
    print("=== Financial What-If Analysis Tool (JSON Input) ===\n")

    filename = "Llama Input/input.json"

    try:
        with open(filename, "r") as f:
            data = json.load(f)

        question = data.get("question", "").strip()

        if not question:
            raise ValueError("No 'question' field found in JSON.")

        return question

    except FileNotFoundError:
        print(f"❌ File not found: {filename}")
        return ""

    except json.JSONDecodeError:
        print("❌ Invalid JSON format.")
        return ""

    except Exception as e:
        print(f"❌ Error: {e}")
        return ""

# Send question directly to Ollama
def get_analysis(
    user_question,
    historical=None,
    prophet_forecast=None,
    slider_forecast=None,
    current_params: dict | None = None,
    market_context: dict | None = None,
):
    # Build a human-readable summary of current dashboard values if provided
    params_block = ""
    if current_params:
        params_block = f"""
    =========================
    CURRENT DASHBOARD VALUES
    =========================
    Starting MRR:     ${current_params.get('starting_mrr', 'N/A'):,}
    Monthly Growth Rate: {current_params.get('growth_rate', 'N/A')}%
    Monthly Churn Rate:  {current_params.get('churn_rate', 'N/A')}%
    COGS (% of revenue): {current_params.get('cogs_percent', 'N/A')}%
    Monthly Marketing Spend: ${current_params.get('marketing_spend', 'N/A'):,}
    Monthly Payroll:  ${current_params.get('payroll', 'N/A'):,}
    Forecast Horizon: {current_params.get('months', 'N/A')} months
"""

    # Build market research block if ticker/news data was fetched
    market_block = ""
    if market_context:
        lines = ["    =========================",
                 "    LIVE MARKET DATA",
                 "    ========================="]

        for sym, td in (market_context.get("ticker_data") or {}).items():
            lines.append(f"    {sym}:")
            if td.get("current_price"):
                lines.append(f"      Current price:  ${td['current_price']}")
            if td.get("one_year_cagr") is not None:
                lines.append(f"      1-year CAGR:    {td['one_year_cagr']}%")
            if td.get("volatility_pct") is not None:
                lines.append(f"      Annualised vol: {td['volatility_pct']}%")
            if td.get("pe_ratio"):
                lines.append(f"      P/E ratio:      {td['pe_ratio']}")
            if td.get("sector"):
                lines.append(f"      Sector:         {td['sector']}")
            if td.get("fifty_two_week_high") and td.get("fifty_two_week_low"):
                lines.append(f"      52-week range:  ${td['fifty_two_week_low']} – ${td['fifty_two_week_high']}")

        proj = market_context.get("hypothetical_projection")
        if proj:
            lines += [
                "    =========================",
                "    HYPOTHETICAL PROJECTION",
                "    =========================",
                f"    If ${proj['invested']:,.2f} invested in {proj['symbol']} today:",
                f"      Units: {proj['units_bought']} @ ${proj['current_price']}",
                f"      Projected value after {proj['projected_years']} yrs: ${proj['projected_value']:,.2f}",
                f"      Projected gain: ${proj['projected_gain']:,.2f} ({proj['projected_gain_pct']:+.2f}%)",
                f"      Based on 1yr CAGR: {proj['based_on_cagr_pct']}%",
            ]

        news = market_context.get("news", {})
        company_news = news.get("company", {})
        market_news  = news.get("market", [])

        if company_news:
            lines += ["    =========================", "    RECENT COMPANY NEWS", "    ========================="]
            for sym, articles in company_news.items():
                lines.append(f"    {sym} recent headlines:")
                for a in articles:
                    lines.append(f"      - {a['headline']}")
                    if a.get("summary"):
                        lines.append(f"        {a['summary'][:200]}")

        if market_news:
            lines += ["    =========================", "    GENERAL MARKET NEWS", "    ========================="]
            for a in market_news:
                lines.append(f"      - {a['headline']}")
                if a.get("summary"):
                    lines.append(f"        {a['summary'][:200]}")

        market_block = "\n".join(lines)

    prompt = f"""
    You are a financial analysis assistant with access to live market data and news.
{params_block}
{market_block}
    =========================
    CONTEXT (SYSTEM DATA)
    =========================

    Historical Data:
    {historical}

    Prophet Forecast:
    {prophet_forecast}

    Slider Forecast:
    {slider_forecast}

    =========================
    USER QUESTION
    =========================
    "{user_question}"

    Your goal is to provide a concise, actionable analysis
    that could be used to model financial impact or generate
    relevant search queries for further research.

    Rules:

    1. Use the CURRENT DASHBOARD VALUES above as the baseline for any what-if calculations.
       When the user says things like "decrease by X%" or "increase by Y", apply that
       change relative to the current dashboard value for that metric.
    2. If a metric is not in the dashboard values and the user gives no number, describe general trends only.
    3. Do NOT fabricate data or estimates beyond what can be derived from the provided context.
    4. Use clear, simple language (no jargon or acronyms).
    5. Do NOT ask for clarification.
    6. When referencing news headlines, always clearly state which company the headline is actually about.
       Do NOT attribute news about one company to another — e.g. if a headline mentions Company X in the
       context of Company Y, make clear it is Company Y's news, not Company X's.

    Output structure:

    === Analysis (Short Summary) ===
    - 2–3 concise sentences summarizing the overall impact

    === Analysis (Detailed) ===
    - A more detailed explanation of expected impact
    - Explain key drivers (costs, revenue, demand, efficiency, etc.)
    - Highlight cause-and-effect relationships clearly

    === Suggestions ===

    Positives:
    - List 2–3 potential benefits

    Negatives:
    - List 2–3 potential risks or downsides

    Next Steps (Priority Order):
    1. Highest priority action
    2. Second priority action
    3. Third priority action
    4. Lowest priority action (if applicable)

    End the response after the "Next Steps" section make sure to include the next steps section aswell; do not add any additional generic conclusions.
    """

    client = Groq(api_key=os.environ.get("GROQ_API_KEY"))
    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=1500,
    )

    return response.choices[0].message.content

# output parse
def parse_output(text):
    sections = {
        "analysis_short": "",
        "analysis_detailed": "",
        "positives": [],
        "negatives": [],
        "next_steps": []
    }

    current_section = None

    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue

        # Detect section headers
        if line.startswith("==="):
            if "Short Summary" in line:
                current_section = "analysis_short"
            elif "Detailed" in line:
                current_section = "analysis_detailed"
            elif "Next Steps" in line:
                current_section = "next_steps"
            else:
                current_section = None
            continue

        # Detect keyword-based sections for Positives/Negatives
        if line.startswith("Positives:"):
            current_section = "positives"
            continue
        elif line.startswith("Negatives:"):
            current_section = "negatives"
            continue
        elif line.startswith("Next Steps"):
            current_section = "next_steps"
            continue

        # Append content to the appropriate section
        if current_section in ["analysis_short", "analysis_detailed"]:
            sections[current_section] += (" " + line if sections[current_section] else line)
        elif current_section in ["positives", "negatives", "next_steps"]:
            # Remove bullets, numbers, or dashes at the start
            line_clean = re.sub(r"^[-*\d.\s]+", "", line)
            if line_clean:
                sections[current_section].append(clean_text(line_clean))

    # Final cleanup: remove extra spaces
    sections["analysis_short"] = clean_text(sections["analysis_short"])
    sections["analysis_detailed"] = clean_text(sections["analysis_detailed"])

    return sections

def clean_text(text):
    # Replace newlines and excessive whitespace
    return " ".join(text.split())

# output parse
# save as json
def save_to_json(data):
    filename = "Llama Output/analysis_output.json"
    with open(filename, "w") as f:
        json.dump(data, f, indent=4)
    print(f"\n💾 Saved structured output to {filename}")
# save as json

# Main flow
def run():
    user_question = get_user_question()

    # NEW: fetch forecast context
    historical, prophet_forecast, slider_forecast = get_forecast_context()

    print("\n🔍 Generating analysis...\n")
    analysis = get_analysis(user_question)

    print("=== Analysis Output ===\n")
    print(analysis)

    structured = parse_output(analysis)

    # OPTIONAL (NEW): attach context into saved output
    structured["historical_context"] = historical
    structured["prophet_forecast_context"] = prophet_forecast
    structured["slider_forecast_context"] = slider_forecast

    save_to_json(structured)


if __name__ == "__main__":
    run()