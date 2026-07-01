# ElectraWireless Business Console

A full-stack business intelligence dashboard built for ElectraWireless. Combines financial forecasting, personal finance tracking, investment portfolio management, and AI-powered learning into a single console — powered by a FastAPI backend and a React/TypeScript frontend.

---

## Features

| # | Feature | Description |
|---|---------|-------------|
| 1 | **Revenue Forecasting** | Compound-growth projections with Prophet ML model, what-if scenario builder, anomaly detection |
| 2 | **Personal Finance** | Bank statement upload (CSV), transaction parsing, budget tracking, cash-flow analysis, AI insights |
| 3 | **Investment Portfolio** | Holdings management, live price feeds (yfinance), Markowitz optimisation, geographic exposure, market movers |
| 4 | **Spreadsheet View** | Editable grid with financial data import and document viewer |
| 5 | **Knowledge & Learning** | ELLY AI chat (Groq/Llama), cross-feature goal tracking, curated resources, live financial news |

---

## Tech Stack

**Backend** — Python 3.12, FastAPI, SQLAlchemy, SQLite (`pf_data.db`), Prophet, LightGBM, scikit-learn, yfinance, APScheduler, Groq SDK

**Frontend** — React 18, TypeScript, Vite, Recharts, Zustand, Tailwind CSS

---

## Project Structure

```
ElectraWireless-Business-Console/
├── backend/
│   ├── main.py               ← FastAPI app + all core routes
│   ├── investments.py        ← Investments router (/investments/*)
│   ├── knowledge.py          ← Knowledge & Learning router (/knowledge/*)
│   ├── forecast.py           ← Compound-growth projection logic
│   ├── ProphetModel.py       ← Prophet time-series model
│   ├── portfolio_analytics.py← Markowitz, allocation, geographic exposure
│   ├── market_data.py        ← yfinance price feeds + APScheduler refresh
│   ├── upload_parser.py      ← Bank statement / CSV parser
│   ├── database.py           ← SQLAlchemy engine + session factory
│   ├── models.py             ← All ORM models
│   ├── investments.py        ← Holdings CRUD + market data endpoints
│   ├── requirements.txt
│   ├── Feature2/             ← F2 insights module
│   └── Feature3/             ← F3 market research module
└── frontend/
    ├── src/
    │   ├── App.tsx
    │   ├── pages/
    │   │   ├── ConsoleHome.tsx
    │   │   ├── ProjectionPage.tsx
    │   │   ├── PersonalFinancePage.tsx
    │   │   ├── InvestmentPage.tsx
    │   │   ├── KnowledgePage.tsx
    │   │   └── SpreadsheetPage.tsx
    │   ├── components/        ← Feature-specific UI components
    │   ├── services/          ← API client modules per feature
    │   ├── store/             ← Zustand state
    │   └── hooks/
    ├── vite.config.ts
    └── package.json
```

---

## Team

| Person   | Role                          |
|----------|-------------------------------|
| Abdullah | Backend lead (FastAPI, DB)    |
| Jeffrey  | Frontend                      |
| Cole     | Backend                       |
| Quinn    | Backend                       |
| Nishant  | Backend                       |

---

## Prerequisites

- Python 3.12+
- Node.js 18+
- [Ollama](https://ollama.com) installed locally (optional — used for local LLM fallback)
- A `.env` file in `backend/` with:

```
GROQ_API_KEY=your_groq_api_key
```

---

## Running the Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```

> Alternatives if `pip` / `uvicorn` aren't on PATH:
> `python3 -m pip install -r requirements.txt`
> `python3 -m uvicorn main:app --reload`
> `py -3.12 -m uvicorn main:app --reload`

API available at `http://localhost:8000`. Interactive docs at `http://localhost:8000/docs`.

### Optional: local Ollama LLM

```bash
ollama pull llama3.2
ollama serve   # only needed if not already running
```

---

## Running the Frontend

```bash
cd frontend
npm install
npm run dev
```

App runs at `http://localhost:3000`. Vite proxies all `/api` requests to the backend — no CORS setup needed.

---

## API Overview

### Core

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | Health check |
| `GET` | `/sample-data` | 12 months of historical demo data |
| `POST` | `/forecast` | Compound-growth forecast |
| `POST` | `/prophet-forecast` | Prophet ML forecast |
| `POST` | `/analyze` | Spreadsheet / data analysis |
| `POST` | `/detect-anomalies` | Anomaly detection on financial data |
| `POST` | `/upload-financial-data` | Upload and parse financial file |

### Personal Finance (`/pf/`)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/pf/transactions/upload` | Upload bank statement CSV |
| `GET` | `/pf/transactions` | List transactions |
| `GET` | `/pf/summary` | Monthly summary |
| `GET` | `/pf/insights` | Rule-based insights |
| `POST` | `/pf/ai-insights` | AI-generated insights (Groq) |
| `POST` | `/pf/budgets` | Set budget |
| `GET` | `/pf/budgets` | List budgets |
| `POST` | `/pf/portfolio-analysis` | Full portfolio analysis |

### Investments (`/investments/`)

| Method | Path | Description |
|--------|------|-------------|
| `GET/POST` | `/investments/holdings` | List / add holdings |
| `DELETE` | `/investments/holdings/{id}` | Remove a holding |
| `POST` | `/investments/holdings/upload` | Bulk upload holdings CSV |
| `POST` | `/investments/holdings/load-demo` | Load demo portfolio |
| `GET` | `/investments/prices` | Current prices |
| `POST` | `/investments/prices/refresh` | Force price refresh |
| `GET` | `/investments/insights` | AI investment insights |
| `GET` | `/investments/summary` | Portfolio summary |
| `GET` | `/investments/allocation` | Asset allocation breakdown |
| `GET` | `/investments/geographic-exposure` | Geographic exposure |
| `GET` | `/investments/market-movers` | Top movers |
| `GET` | `/investments/markowitz` | Markowitz optimisation |
| `GET` | `/investments/snapshots` | Historical snapshots |

### Knowledge & Learning (`/knowledge/`)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/knowledge/chat` | ELLY AI chat (context-aware) |
| `GET` | `/knowledge/conversations` | Past ELLY conversations |
| `GET/POST` | `/knowledge/goals` | List / create goals |
| `PUT` | `/knowledge/goals/{id}` | Update goal stage / next step |
| `DELETE` | `/knowledge/goals/{id}` | Delete a goal |
| `GET` | `/knowledge/resources` | Curated articles & frameworks |
| `GET` | `/knowledge/news` | Live financial news |
| `GET` | `/knowledge/user-context` | Aggregated cross-feature user context |

### Users & Config

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/users` | Create user |
| `GET` | `/users/{user_id}` | Get user profile |
| `POST/GET` | `/investments/onboarding` | Investment onboarding flow |
| `POST` | `/forecast/config` | Save forecast config |
| `GET` | `/forecast/config/{user_id}` | Load forecast config |

---

## Example Request

```bash
curl -X POST http://localhost:8000/forecast \
  -H "Content-Type: application/json" \
  -d '{
    "revenue": 40100,
    "expenses": 26000,
    "growth_rate": 0.05,
    "cost_growth_rate": 0.02,
    "months": 12,
    "what_if_annual_cost": 0
  }'
```
