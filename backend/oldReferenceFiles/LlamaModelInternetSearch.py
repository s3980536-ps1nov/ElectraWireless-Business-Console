import ollama
import json
import re
import requests
from bs4 import BeautifulSoup
from fastapi import FastAPI
from pydantic import BaseModel

# =========================
# FastAPI setup
# =========================
app = FastAPI()

class QuestionRequest(BaseModel):
    question: str

# =========================
# Web search functions for RAG
# =========================
def fetch_web_content(url):
    try:
        response = requests.get(url, timeout=5)
        if response.status_code == 200:
            soup = BeautifulSoup(response.text, "html.parser")
            for script in soup(["script", "style"]):
                script.decompose()
            return soup.get_text(separator=" ", strip=True)
        else:
            return ""
    except Exception as e:
        print(f"Error fetching {url}: {e}")
        return ""

def search_duckduckgo(query, max_results=3):
    """Simple DuckDuckGo HTML search scraper"""
    search_url = f"https://html.duckduckgo.com/html/?q={query.replace(' ', '+')}"
    html = requests.get(search_url, headers={"User-Agent": "Mozilla/5.0"}).text
    soup = BeautifulSoup(html, "html.parser")
    links = []
    for a in soup.find_all("a", {"class": "result__a"}, href=True):
        if len(links) >= max_results:
            break
        links.append(a["href"])
    return links

def build_context_from_web(question):
    links = search_duckduckgo(question)
    context_texts = []
    for link in links:
        text = fetch_web_content(link)
        if text:
            # limit text per page to avoid huge prompts
            context_texts.append(text[:1000])
    return "\n\n".join(context_texts)

# =========================
# FastAPI endpoint
# =========================
@app.post("/analyze")
def analyze(request: QuestionRequest):
    context = build_context_from_web(request.question)
    analysis = get_analysis(request.question, context)
    structured = parse_output(analysis)
    return structured

# =========================
# Get user question
# =========================
def get_user_question():
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

# =========================
# Send question to Ollama with context
# =========================
def get_analysis(user_question, context=""):
    prompt = f"""
You are a financial analysis assistant. Use the following context to answer the question accurately.

Context:
{context}

User question:
{user_question}

Your goal is to provide a concise, actionable analysis
that could be used to model financial impact or generate
relevant search queries for further research.

Rules:
1. Only use numbers if they are explicitly given by the user.
2. If no numeric information is provided, describe general trends only.
3. Do NOT fabricate any data or estimates.
4. Use clear, simple language (no jargon or acronyms).
5. Do NOT ask for clarification.

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

End the response after the "Next Steps" section. Do not add any additional generic conclusions.
"""

    response = ollama.chat(
        model="llama3.2",
        messages=[{"role": "user", "content": prompt}],
        options={"num_predict": 1500}
    )
    return response.message.content

# =========================
# Output parse
# =========================
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

        # Keyword-based sections
        if line.startswith("Positives:"):
            current_section = "positives"
            continue
        elif line.startswith("Negatives:"):
            current_section = "negatives"
            continue
        elif line.startswith("Next Steps"):
            current_section = "next_steps"
            continue

        # Append content
        if current_section in ["analysis_short", "analysis_detailed"]:
            sections[current_section] += (" " + line if sections[current_section] else line)
        elif current_section in ["positives", "negatives", "next_steps"]:
            line_clean = re.sub(r"^[-*\d.\s]+", "", line)
            if line_clean:
                sections[current_section].append(line_clean)

    sections["analysis_short"] = clean_text(sections["analysis_short"])
    sections["analysis_detailed"] = clean_text(sections["analysis_detailed"])
    return sections

def clean_text(text):
    return " ".join(text.split())

# =========================
# Save output
# =========================
def save_to_json(data):
    filename = "Llama Output/analysis_output.json"
    with open(filename, "w") as f:
        json.dump(data, f, indent=4)
    print(f"\n💾 Saved structured output to {filename}")

# =========================
# Main flow
# =========================
def run():
    user_question = get_user_question()
    print("\n🔍 Generating analysis...\n")
    context = build_context_from_web(user_question)
    analysis = get_analysis(user_question, context)
    print("=== Analysis Output ===\n")
    print(analysis)
    structured = parse_output(analysis)
    save_to_json(structured)

if __name__ == "__main__":
    run()