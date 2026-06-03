import json
import requests
import re
from fastapi import FastAPI
from pydantic import BaseModel
from groq import Groq
import os
app = FastAPI()

# File paths
INPUT_FILE = "../LLama Input/Feature_2_input.json"
OUTPUT_FILE_REPORT = "../Llama Output/Feature_2_output.json"
OUTPUT_FILE_QA = "../Llama Output/Feature_2_Qoutput.json"

# ================= REQUEST MODEL =================
class AIInsightsRequest(BaseModel):
    data: dict

# ================= LOAD =================
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

# ================= PARSER =================
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

        goals_raw = sections.get("goals", "")
        if goals_raw:
            structured["goals"] = [
                re.sub(r"^[\*\-\•\d\.\s]*", "", line).strip()
                for line in goals_raw.split("\n")
                if line.strip()
            ]

        return structured

    # REPORT MODE
    structured["summary"] = sections.get("summary", "")

    health_raw = sections.get("health_score", "")
    structured["health_score"] = {
        "score": (
            int(m.group(1))
            if (m := re.search(r"\b(\d{2,3})\b", health_raw))
            else None
        ),
        "raw": health_raw.strip()
    }

    # Alerts
    alerts_raw = sections.get("alerts", "")
    structured["alerts"] = []

    for line in alerts_raw.split("\n"):
        line = line.strip()
        if not line:
            continue
        line = re.sub(r"\*\*", "", line)
        structured["alerts"].append(line)

    def extract_bullets(text):
        return [
            re.sub(r"^[\*\-\•]\s*", "", line).strip()
            for line in text.split("\n")
            if line.strip()
        ]

    structured["risks"] = extract_bullets(sections.get("risks", ""))
    structured["opportunities"] = extract_bullets(sections.get("opportunities", ""))

    # Actions
    actions_raw = sections.get("recommended_actions", "")
    structured["recommended_actions"] = [
        re.sub(r"^\d+\.\s*", "", line).strip()
        for line in actions_raw.split("\n")
        if re.match(r"^\d+\.", line.strip())
    ]

    structured["spending_patterns"] = sections.get("spending_patterns", "")

    # Goals (optional)
    goals_raw = sections.get("goals", "")
    if goals_raw:
        structured["goals"] = [
            re.sub(r"^[\*\-\•\d\.\s]*", "", line).strip()
            for line in goals_raw.split("\n")
            if line.strip()
        ]

    return structured

# ================= PROMPTS =================
def build_report_prompt(data):
    goal = data.get("Goals", "").strip()
    has_goal = bool(goal)

    prompt = f"""
You are a financial analysis assistant.

INPUT JSON:
{json.dumps(data, indent=2)}

CRITICAL RULES:
- Only use provided data and inferred data
- Do NOT fabricate information
- Keep responses concise
- You MUST output sections exactly in this format: [SECTION: NAME]

Your task is to generate a full financial report.
Follow this EXACT format:

[SECTION: SUMMARY]
- Provide a short overview of the user's overall financial situation.
- Mention key figures like income, expenses, net cash flow, and general financial health if available.
- Keep it clear and easy to read.

[SECTION: HEALTH_SCORE]
- Explain the user's financial health score in simple terms.
- Include the score if provided.
- Briefly describe what the score indicates.

[SECTION: ALERTS]
- List any important financial alerts or warnings.
- Use bullet points for each alert.
- If no alerts exist, state that clearly.

[SECTION: SPENDING_PATTERNS]
- Summarize how the user spends money overall.
- Break down key spending categories in bullet points if available.
- Highlight any noticeable patterns.

[SECTION: RISKS]
- List potential financial risks based on the data.
- Keep each point short and direct.

[SECTION: OPPORTUNITIES]
- List areas where the user could improve their financial situation.
- Focus on practical and realistic improvements.

[SECTION: RECOMMENDED_ACTIONS]
- Provide a short list of helpful next steps.
- Keep actions clear and easy to follow.
- No need for strict ordering unless naturally obvious.
"""

    if has_goal:
        prompt += f"""

[SECTION: GOALS]
- User goal: "{goal}"

Provide a structured response with TWO parts:

1. First line (NOT numbered):
- A few sentences describing the exact financial target required to achieve the goal
- If the goal is unrealistic, adjust the target slightly and state a more achievable version in the first line
- Include specific numbers where possible (e.g. how much to save or reduce)

2. Then provide a numbered list of 3–5 actionable steps:
- Make a numbered list only (1., 2., 3., ...)
- Each step must directly contribute to achieving the target above
- One action per line
- Keep each line short and single-sentence
- Use the financial data to guide suggestions

"""

    return prompt


def build_qa_prompt(data):
    question = data.get("question", "").strip()
    goal = data.get("Goals", "").strip()
    has_goal = bool(goal)

    prompt = f"""
You are a financial assistant.

INPUT JSON:
{json.dumps(data, indent=2)}

QUESTION:
{question}

Your task:
- Answer the question using ONLY the provided data and inferred data
- Be concise and focused
- You MUST follow the exact output format below

STRICT OUTPUT FORMAT (DO NOT DEVIATE):

[SECTION: ANSWER]
- Direct answer to the question
- Include supporting numbers from the data
- Keep it under 5 sentences

[SECTION: SUPPORTING_INSIGHTS]
- Provide at least 2 bullet points
- If limited data, still extract relevant observations

[SECTION: RECOMMENDED_ACTIONS]
- Provide 4 clear next steps in regards to the question asked:
  1. Most urgent
  2. High impact
  3. Medium term
  4. Optional improvement

[SECTION: SUMMARY]
- Provide a summary of previous sections, keep it to around 1 paragraph, so 3 to 4 lines
"""
# ensure to add a part that when a question is asked referring to a goal, that if no goal is present
# make sure that the response will state that no goal was present
    if has_goal:
        prompt += f"""

[SECTION: GOALS]
- User goal: "{goal}"

Provide a structured response with TWO parts:

1. First line (NOT numbered):
- A few sentences describing the exact financial target required to achieve the goal
- Include specific numbers where possible (e.g. how much to save or reduce)

2. Then provide a numbered list of 3–5 actionable steps:
- Make a numbered list only (1., 2., 3., ...)
- Each step must directly contribute to achieving the target above
- One action per line
- Keep each line short and single-sentence
- Use the financial data to guide suggestions
"""

    return prompt

client = Groq(api_key=os.environ.get("GROQ_API_KEY"))

# ================= GROQ =================
def get_analysis(prompt):
    response = client.chat.completions.create(
        model="llama-3.1-8b-instant",  # ← equivalent to llama3.1:8b
        messages=[
            {"role": "user", "content": prompt}
        ],
        max_tokens=1500
    )

    return response.choices[0].message.content

# ================= SAVE =================
def save_output(raw_text, output_path):
    parsed = parse_llm_output(raw_text)

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(parsed, f, indent=2)

    print(f"💾 Saved structured output to {output_path}")

# ================= FASTAPI =================
@app.post("/pf/ai-insights")
def ai_insights(request: AIInsightsRequest):
    data = request.data

    question = data.get("question", "").strip()
    has_question = bool(question)

    print("🔍 FastAPI /pf/ai-insights called...")

    # ✅ ROUTER (same as new logic)
    if has_question:
        prompt = build_qa_prompt(data)
        result = get_analysis(prompt)
        save_output(result, OUTPUT_FILE_QA)
    else:
        prompt = build_report_prompt(data)
        result = get_analysis(prompt)
        save_output(result, OUTPUT_FILE_REPORT)

    structured = parse_llm_output(result)
    return structured

# ================= CLI RUN =================
def run():
    data = load_input()
    if not data:
        return

    question = data.get("question", "").strip()
    has_question = bool(question)

    print("🔍 Generating financial summary...\n")

    if has_question:
        prompt = build_qa_prompt(data)
        result = get_analysis(prompt)
        print(result)
        save_output(result, OUTPUT_FILE_QA)
    else:
        prompt = build_report_prompt(data)
        result = get_analysis(prompt)
        print(result)
        save_output(result, OUTPUT_FILE_REPORT)

if __name__ == "__main__":
    run()