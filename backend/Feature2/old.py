import json
import re
from fastapi import FastAPI
from pydantic import BaseModel
import os
from groq import Groq

app = FastAPI()

client = Groq(api_key=os.environ.get("GROQ_API_KEY"))

# File paths
INPUT_FILE = "../LLama Input/Feature_2_input.json"
OUTPUT_FILE_REPORT = "../Llama Output/Feature_2_output.json"
OUTPUT_FILE_QA = "../Llama Output/Feature_2_Qoutput.json"

# Request Model
class AIInsightsRequest(BaseModel):
    data: dict

# Load JSON input
def load_input():
    try:
        with open(INPUT_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        print(f"❌ File not found: {INPUT_FILE}")
        return None
    except json.JSONDecodeError:
        print("❌ Invalid JSON format")
        return None

# PARSER
def parse_llm_output(text):
    sections = {}

    pattern = r"\[SECTION:\s*([^\]]+)\]\s*(.*?)(?=\n\s*\[SECTION:|\Z)"
    matches = re.findall(pattern, text, re.DOTALL | re.IGNORECASE)

    for name, content in matches:
        key = name.strip().lower()
        sections[key] = content.strip()

    structured = {}

    # Q&A MODE
    if "answer" in sections:
        structured["answer"] = sections.get("answer", "")

        insights_raw = sections.get("supporting_insights", "")
        structured["supporting_insights"] = [
            line.strip("•-* ").strip()
            for line in insights_raw.split("\n")
            if line.strip()
        ]

        return structured

    # REPORT MODE

    structured["summary"] = sections.get("summary", "")

    # HEALTH SCORE (light + robust)
    health_raw = sections.get("health_score", "")
    structured["health_score"] = {
        "score": (
            int(m.group(1))
            if (m := re.search(r"\b(\d{2,3})\b", health_raw))
            else None
        ),
        "raw": health_raw.strip()
    }

    # ALERTS (simple + stable)
    alerts_raw = sections.get("alerts", "")
    alerts = []

    for line in alerts_raw.split("\n"):
        line = line.strip()
        if not line:
            continue

        line = re.sub(r"\*\*", "", line)
        alerts.append(line)

    structured["alerts"] = alerts

    # BULLETS
    def extract_bullets(text):
        return [
            re.sub(r"^[\*\-\•]\s*", "", line).strip()
            for line in text.split("\n")
            if line.strip()
        ]

    structured["risks"] = extract_bullets(sections.get("risks", ""))
    structured["opportunities"] = extract_bullets(sections.get("opportunities", ""))

    # ACTIONS
    actions_raw = sections.get("recommended_actions", "")
    structured["recommended_actions"] = [
        re.sub(r"^\d+\.\s*", "", line).strip()
        for line in actions_raw.split("\n")
        if re.match(r"^\d+\.", line.strip())
    ]

    structured["spending_patterns"] = sections.get("spending_patterns", "")

    return structured

# PROMPT (UPDATED VERSION)
def build_finance_prompt(data):
    question = data.get("question", "").strip()

    base_prompt = f"""
You are a financial and behavioral spending analysis assistant.

INPUT JSON:
{json.dumps(data, indent=2)}

CRITICAL RULES:
1. Only use values explicitly present in the JSON.
2. Do NOT fabricate data.
3. Keep language simple and direct.
"""

    # REPORT MODE
    if not question:
        return base_prompt + """

Your task is to generate a full financial report.

Follow this format:

[SECTION: SUMMARY]
- Provide a short overview of financial situation.
- Mention income, expenses, net cash flow if available.
- Keep it concise and readable.

[SECTION: HEALTH_SCORE]
- Explain financial health score in simple terms.
- Include score if available.
- Brief interpretation.

[SECTION: ALERTS]
- List important financial alerts or warnings.
- Use bullet points.
- If none, clearly state no alerts.

[SECTION: SPENDING_PATTERNS]
- Summarize spending behaviour.
- Show category breakdown if available.

[SECTION: RISKS]
- List financial risks based on data.
- Keep each point short.

[SECTION: OPPORTUNITIES]
- List improvements or optimisations.

[SECTION: RECOMMENDED_ACTIONS]
- Provide 4 clear next steps:
  1. Most urgent
  2. High impact
  3. Medium term
  4. Optional improvement

END OF REPORT
"""

    # Q&A MODE
    else:
        return base_prompt + f"""

The user has asked:

"{question}"

Your task:
- Answer directly using ONLY the data
- Be concise and focused
- Do NOT generate full report

OUTPUT FORMAT:

[SECTION: ANSWER]
- Direct answer (max 5 sentences)

[SECTION: SUPPORTING_INSIGHTS]
- Bullet points of relevant observations

END OF RESPONSE
"""

# GROQ CALL
def get_analysis(prompt):
    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=1500
    )

    return response.choices[0].message.content

# SAVE OUTPUT
def save_output(raw_text, output_path):
    parsed = parse_llm_output(raw_text)

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(parsed, f, indent=2)

    print(f"💾 Saved structured output to {output_path}")

# FASTAPI ENDPOINT
@app.post("/pf/ai-insights")
def ai_insights(request: AIInsightsRequest):
    data = request.data

    question = data.get("question", "").strip()
    has_question = bool(question)

    print("🔍 FastAPI /pf/ai-insights called...")

    prompt = build_finance_prompt(data)
    result = get_analysis(prompt)

    structured = parse_llm_output(result)

    if has_question:
        save_output(result, OUTPUT_FILE_QA)
    else:
        save_output(result, OUTPUT_FILE_REPORT)

    return structured

# RUN

def run():
    data = load_input()
    if not data:
        return

    question = data.get("question", "").strip()
    has_question = bool(question)

    print("🔍 Generating financial summary...\n")

    prompt = build_finance_prompt(data)
    result = get_analysis(prompt)

    print("=== LLM OUTPUT ===\n")
    print(result)

    if has_question:
        save_output(result, OUTPUT_FILE_QA)
    else:
        save_output(result, OUTPUT_FILE_REPORT)


if __name__ == "__main__":
    run()