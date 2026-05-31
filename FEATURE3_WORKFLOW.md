# Feature 3 — Investment Intelligence: Workflow Document
**ELLY Platform | Team A | 2026**
**Team: Jeffrey King · Cole · Abdullah Abdosh · Quinn Tanti · Nishant Manchanda**

---

## Overview

Feature 3 adds an Investment Intelligence module to the ELLY platform. Users can upload or manually enter their investment holdings, and the platform will calculate portfolio analytics, show live market prices, generate risk alerts, and provide AI-driven scenario planning.

---

## System Architecture

```
Frontend (React/TypeScript)
        │
        │  HTTP requests
        ▼
FastAPI Backend (main.py + investments.py)
        │
        ├── portfolio_analytics.py   (Cole — calculations)
        ├── market_data.py           (Nishant — yfinance / CoinGecko)
        ├── models.py                (Nishant — all ORM table definitions)
        └── database.py             (Nishant — SQLite via SQLAlchemy)
                │
                ▼
        pf_data.db  (SQLite — local dev)
```

---

## Database Tables

> All ORM models are defined by Nishant in `models.py`. Ownership below refers to which phase/person writes to or consumes each table.

| Table | Defined by | Used by | Purpose |
|---|---|---|---|
| `investment_holdings` | Nishant (Phase 1) | Abdullah (Phase 2) | One row per holding per user |
| `market_prices` | Nishant (Phase 1) | Nishant (Phase 3) | Latest cached price per symbol, refreshed every 15 min |
| `portfolio_snapshots` | Nishant (Phase 1) | Cole (Phase 4) | Point-in-time portfolio totals, written on each summary call |
| `investment_insights` | Nishant (Phase 1) | Jeffrey (Phase 6) | Rule-based alerts with severity levels |

### Key Fields

**`investment_holdings`**
`id · user_id · symbol · asset_type · quantity · buy_price · purchase_date · source`

**`market_prices`**
`symbol · current_price · daily_change · percentage_change · timestamp`

**`portfolio_snapshots`**
`user_id · total_value · total_cost · profit_loss · return_percentage · snapshot_date`

**`investment_insights`**
`user_id · insight_type · message · severity · created_at`

---

## Data Flow

### 1. User Onboarding (Jeffrey — Phase 0)
```
User → Onboarding flow (Frontend)
     → Age, financial background, experience level (beginner / intermediate / advanced)
     → Communication preference (simple explanations vs technical breakdowns)
     → Investment goal (short-term vs long-term horizon)
     → Responses stored and passed to AI insights layer as user context (Shared)
```

### 2. User Adds Holdings (Abdullah — Phase 2)
```
User → Manual form (Frontend)
     → POST /investments/holdings
     → InvestmentHolding saved to DB
     → market_data.refresh_all_prices() triggered
     → MarketPrice populated for that symbol
```
```
User → CSV upload (Frontend — drag-and-drop with error feedback)
     → POST /investments/holdings/upload
     → CSV parsed row by row
     → Holdings saved to DB (source = "csv")
     → Prices refreshed automatically
```

### 3. Price Refresh (Nishant — Phase 3)
```
APScheduler (every 15 min, Mon–Fri 9am–4pm AEST)
     → scheduled_price_refresh() in main.py
     → market_data.refresh_all_prices(db)
     → yfinance       → stocks / ETFs (current price, daily movement, % change)
     → CoinGecko      → crypto asset pricing
     → Manual fallback → if yfinance call fails
     → MarketPrice table updated
```

### 4. Portfolio Summary Request (Cole — Phase 4)
```
Frontend → GET /investments/summary
         → Query InvestmentHolding (all user holdings)
         → Query MarketPrice (join on symbol → live prices)
         → _holding_to_dict() → plain dict with current_price
         → portfolio_analytics.calculate_portfolio_summary()
              ├── total_value   = Σ(quantity × current_price)
              ├── total_cost    = Σ(quantity × buy_price)
              ├── profit_loss   = total_value − total_cost
              ├── return_%      = (profit_loss / total_cost) × 100
              └── per asset:
                   ├── cost_basis, current_value, P&L, return_%
                   └── CAGR = (current/buy)^(1/years) − 1
         → portfolio_analytics.calculate_diversification_score()
              ├── score = (distinct asset types held / 5) × 100
              ├── overexposed_holdings → any single holding > 25% of portfolio
              └── overexposed_types   → any single asset type > 60% of portfolio
         → Write PortfolioSnapshot to DB
         → Return full JSON response
```

### 5. Allocation Request (Cole — Phase 4)
```
Frontend → GET /investments/allocation
         → Query holdings + prices (same join as above)
         → portfolio_analytics.compute_allocation()
              ├── by_symbol     → value ($) + % per ticker
              └── by_asset_type → value ($) + % per type
         → Return JSON
```

### 6. Insights Engine (Jeffrey — Phase 6)
```
Frontend → GET /investments/insights
         → Rule-based checks against holdings + prices:
              ├── Overexposure alert      → single asset or asset type > 70%
              ├── High crypto warning     → crypto concentration above threshold
              ├── Low diversification     → diversification score below threshold
              └── Significant drop alert  → portfolio or single asset down > 10% today
         → Return categorised alerts with severity (low / medium / high)
         → Insight language personalised based on onboarding profile
              (beginner = plain English, advanced = technical tone) — AI/Insights
```

> **Note on overexposure thresholds:**
> Phase 4 flags holdings > **25%** as a detection signal used internally in analytics.
> Phase 6 uses **> 70%** as the threshold for generating a user-facing alert.
> These are separate — Phase 4 is a risk signal, Phase 6 is a user notification rule.

### 7. AI Layer & Scenario Planning (Quinn — Phase 7)
```
Frontend → AI scenario queries
         → User onboarding context (age, horizon, experience) injected into prompt
         → Holdings + portfolio summary injected into prompt
         → Groq LLM
         → Personalised recommendations / scenario answers:
              ├── Hypothetical: "What if I invested $X in Y asset today?"
              ├── Historical:   "How would my portfolio have performed if I bought in 2020?"
              ├── Projection:   "Where could this portfolio be in 5 years at current growth?"
              └── Rebalancing:  AI-generated portfolio rebalancing suggestions
         → Industry-level market research (sector trends, macro signals)
```

### 8. Feature 2 → Feature 3 Integration (Shared)
```
Feature 2 cashflow health score
     → If savings rate is low → AI/insights warns against high-risk assets
     → Connects personal finance health to investment decision-making
```

---

## API Endpoints — Full Reference

### Holdings (Phase 2 — Abdullah)
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/investments/holdings` | Return all holdings for demo-user |
| `POST` | `/investments/holdings` | Manually add a holding |
| `DELETE` | `/investments/holdings/{id}` | Delete a holding by ID |
| `DELETE` | `/investments/holdings` | Clear all holdings and snapshots |
| `POST` | `/investments/holdings/upload` | Bulk CSV import |

### Market Prices (Phase 3 — Nishant)
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/investments/prices` | Return latest cached prices |
| `POST` | `/investments/prices/refresh` | Manually trigger a price refresh |
| `POST` | `/investments/prices/manual` | Set a manual price for a symbol (fallback) |

### Analytics (Phase 4 — Cole)
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/investments/summary` | Full portfolio analytics + diversification score |
| `GET` | `/investments/summary?include_volatility=true` | Same + annualised volatility (slower, stocks/ETFs only) |
| `GET` | `/investments/allocation` | Allocation by symbol and asset type |
| `GET` | `/investments/snapshots` | Historical portfolio snapshots (one per day) |

### Insights (Phase 6 — Jeffrey)
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/investments/insights` | Categorised rule-based alerts with severity |

---

## Analytics Logic Reference (portfolio_analytics.py)

### CAGR
```
CAGR = (current_price / buy_price) ^ (1 / years_held) − 1
```

### Annualised Volatility (opt-in, stocks/ETFs only)
```
volatility = std(daily_returns) × √252
daily_returns sourced from 1 year of yfinance closing prices
```

### Diversification Score
```
score = (number of distinct known asset types held / 5) × 100

Known types: stock · etf · crypto · fund · real_estate
e.g. holds stock + crypto + etf → 3/5 = 60
```

### Overexposure Thresholds (Phase 4 — detection)
```python
HOLDING_OVEREXPOSURE_PCT = 25.0   # any single holding > 25% of total portfolio
TYPE_OVEREXPOSURE_PCT    = 60.0   # any single asset type > 60% of total portfolio
```
Both constants sit at the top of `portfolio_analytics.py` and are easy to adjust.

### Overexposure Thresholds (Phase 6 — user-facing alert rules)
```
> 70% in one asset or asset type → overexposure alert (Jeffrey)
crypto concentration > threshold  → high crypto warning (Jeffrey)
```

---

## Phase Ownership Summary

| Phase | Owner | Type | Status |
|---|---|---|---|
| Phase 0 — User Onboarding | Jeffrey | Frontend | In progress |
| Phase 1 — Data Models & DB | Nishant | Backend | ✅ Done |
| Phase 2 — Holdings CRUD | Abdullah | Backend + Frontend | ✅ Done |
| Phase 3 — Market Data Integration | Nishant | Backend | ✅ Done |
| Phase 4 — Portfolio Analytics | Cole | Backend | ✅ Done |
| Phase 5 — Dashboard Frontend | Abdullah | Frontend | In progress |
| Phase 6 — Insights Engine | Jeffrey | Backend + AI | In progress |
| Phase 7 — AI Layer & Scenario Planning | Quinn | AI / Insights | In progress |
| Cross-feature — Feature 2 + Feature 3 link | Shared | Shared | Pending |

---

## Phase 5 Dashboard — Frontend Tasks (Abdullah)

| Task | Type |
|---|---|
| Total portfolio value and P/L summary stat cards | Frontend |
| Asset allocation pie chart (by asset type and by symbol) | Frontend |
| Portfolio growth line chart with historic snapshots | Frontend |
| Top gainers / losers list | Frontend |
| Holdings table: symbol, quantity, buy price, current price, P/L per asset | Frontend |
| Market news / price alert banner (e.g. "AAPL dropped 10% today") | Frontend |
| Markowitz risk-return bullet plot using PyPortfolioOpt output | Shared |

---

## Integration Notes

- **Live prices**: `GET /investments/summary` and `GET /investments/allocation` both join against `MarketPrice` automatically. If a symbol has no price yet, analytics fall back to `buy_price` — nothing crashes.
- **Price refresh**: Happens automatically every 15 min on weekdays via APScheduler. Can also be triggered manually via `POST /investments/prices/refresh`.
- **PortfolioSnapshot**: Written to DB on every `GET /investments/summary` call — powers the historical growth chart on the dashboard.
- **Volatility**: Off by default. Pass `?include_volatility=true` to enable. Only works for stocks and ETFs. Returns `null` for crypto, funds, real estate.
- **Overexposure**: Phase 4 (25% per holding) is an internal risk signal. Phase 6 (>70%) is the user-facing alert rule. Both coexist independently.
- **Onboarding context**: Jeffrey's Phase 0 onboarding responses (experience level, goal horizon) feed into Quinn's Phase 7 AI prompt and Jeffrey's Phase 6 insight language personalisation.
