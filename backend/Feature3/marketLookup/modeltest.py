import os
from groq import Groq

# ================= CLIENT =================
api_key = os.getenv("GROQ_API_KEY")
client = Groq(api_key=api_key)

MODEL_NAME = "llama-3.1-8b-instant"


# ================= SYSTEM PROMPT =================
SYSTEM_PROMPT = """
You are a stock name extractor.

TASK:
From the user message, detect any mentioned stocks (companies or ETFs).

RULES:
- Output ONLY the full official stock name(s)
- One per line
- No explanations
- No tickers
- No extra text
- If nothing is mentioned, output nothing

Examples:
User: compare Tesla and SPY
Output:
Tesla, Inc.
SPDR S&P 500 ETF Trust
"""


# ================= LLM CALL =================
def ask_llm(user_input: str):
    res = client.chat.completions.create(
        model=MODEL_NAME,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_input}
        ],
        temperature=0.1
    )

    return res.choices[0].message.content


# ================= MAIN LOOP =================
def run():
    print("Stock extractor (type 'exit' to quit)\n")

    while True:
        user_input = input("You: ")

        if user_input.lower() == "exit":
            break

        response = ask_llm(user_input)

        print("\nStocks detected:")
        print(response)
        print("\n")


if __name__ == "__main__":
    run()