# Feature 5 — Knowledge & Learning for Business: Overview & Plan Document
**ELLY Platform | Team A | 2026 | v1.0**
**Team: Jeffrey King · Cole · Abdullah Abdosh · Quinn Tanti · Nishant Manchanda**
**Status: Planning — not yet built**

---

## 1. What Is Feature 5?

Feature 5 is the **Knowledge & Learning for Business** module of the ELLY platform.

While Features 1–4 help users track, analyse, and manage their finances and investments, Feature 5 focuses on **helping users grow their business knowledge** — delivering contextual education, AI-guided explanations, and personalised learning based on what is actually happening in their ELLY data.

Feature 5 answers the question:
> "What do I need to learn to make better financial and business decisions — and can ELLY teach me in context?"

### How It Fits in the ELLY Ecosystem

| Feature | Focus |
|---|---|
| Feature 1 | Business financial projections and forecasting |
| Feature 2 | Personal income, expenses, budgeting, financial health |
| Feature 3 | Investment portfolio tracking and performance |
| Feature 4 | Business revenue sources, invoices, client payments |
| **Feature 5** | **Business knowledge, contextual learning, AI-guided education** |

The key connection is that Feature 5 uses data from all previous features as context — if a user's diversification score is low, ELLY explains what diversification means and why it matters. If their DSO is high, ELLY explains what DSO is and how to improve it. Learning is always tied to the user's real situation, not generic content.

---

## 2. Goals and Scope

**Primary goal:** Deliver contextual, personalised business and financial education directly within ELLY, powered by RAG (Retrieval Augmented Generation) and the existing Groq/LlamaModel AI layer.

### Users Must Be Able To:
- Ask ELLY business or financial questions in plain language
- Browse curated knowledge articles by topic
- Get contextual tips triggered by their own data (e.g. "Your DSO is high — here's what that means")
- Follow learning paths tailored to their experience level (set in Feature 3 onboarding)
- Save and revisit articles or explanations

### System Must Provide:
- A curated knowledge base covering key business, finance, and investment topics
- RAG-powered document retrieval so ELLY can answer questions from its knowledge base
- Contextual tips surfaced automatically based on user data from Features 1–4
- Personalised learning paths based on onboarding experience level
- Plain-English explanations of financial terms (CAGR, DSO, P&L, etc.)

### ELLY Should Help With:
- Answering "What does X mean?" questions grounded in the user's actual numbers
- Explaining why an alert was triggered (e.g. "You have an overexposure warning — here's why that matters")
- Suggesting next steps after analytics results
- Connecting learning to actionable decisions

### Out of Scope (MVP):
- Full LMS (Learning Management System) with quizzes or certifications
- Video content delivery
- Live human coaching or mentorship
- Paid content or subscription gating

---

## 3. System Architecture

### High-Level Data Flow

```
User Question / Data Trigger
        │
        ├── User asks a question (chat input)
        └── System detects a trigger from F1–F4 data
        │
        ▼
FastAPI Backend (main.py + knowledge.py router)
        │
        ├── knowledge_engine.py     (RAG pipeline — retrieval + generation)
        ├── LlamaModel.py           (existing Groq LLM — already built)
        ├── LlamaModelInternetSearch.py  (existing web search — already built)
        ├── contextLlamaTest.py     (existing context-aware analysis — already built)
        └── models.py               (extend with knowledge tables)
        │
        ▼
Knowledge Base (articles stored in DB + optional vector index)
        │
        ▼
Groq LLM → Grounded, contextual response
        │
        ▼
Frontend: Knowledge Panel / Chat / Tip Cards
```

### Backend Stack (reuses existing)
- Python + FastAPI
- SQLAlchemy + SQLite (same `database.py`)
- Groq LLM via `LlamaModel.py` (already integrated)
- LlamaIndex for RAG document retrieval (referenced in team docs)
- `LlamaModelInternetSearch.py` for live web context fallback

### New File Structure Proposed
```
backend/
  knowledge.py            ← new FastAPI router (/knowledge/*)
  knowledge_engine.py     ← RAG pipeline: retrieve → augment → generate
  models.py               ← extend with knowledge/learning tables
  knowledge_base/         ← folder of curated .md / .txt articles
    finance_basics.md
    investment_terms.md
    business_metrics.md
    ...
```

---

## 4. Database Tables (Proposed)

| Table | Purpose |
|---|---|
| `knowledge_articles` | Curated articles stored with topic tags |
| `learning_paths` | Ordered sequences of articles by topic/level |
| `user_learning_progress` | Tracks which articles a user has read |
| `contextual_tips` | Auto-triggered tips linked to F1–F4 data events |

### Key Fields

**`knowledge_articles`**
```
id · title · content · topic · tags · difficulty (beginner / intermediate / advanced)
source_url (optional) · created_at
```

**`learning_paths`**
```
id · name · description · experience_level · article_ids (ordered list)
```

**`user_learning_progress`**
```
user_id · article_id · read_at · saved (bool)
```

**`contextual_tips`**
```
id · user_id · trigger_type (low_diversification / high_dso / overexposure / revenue_drop / etc.)
message · article_id (optional link) · shown_at · dismissed (bool)
```

---

## 5. Proposed API Endpoints

### Knowledge Base
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/knowledge/articles` | Browse all articles (filterable by topic, difficulty) |
| `GET` | `/knowledge/articles/{id}` | Return a single article |
| `GET` | `/knowledge/topics` | Return available topic categories |

### Learning Paths
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/knowledge/paths` | Return all learning paths |
| `GET` | `/knowledge/paths/{id}` | Return a specific learning path with article list |
| `GET` | `/knowledge/paths/recommended` | Return recommended path based on user onboarding profile |

### User Progress
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/knowledge/progress` | Return user's reading progress and saved articles |
| `POST` | `/knowledge/progress/{article_id}/read` | Mark article as read |
| `POST` | `/knowledge/progress/{article_id}/save` | Save article for later |

### Contextual Tips
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/knowledge/tips` | Return active contextual tips for the user |
| `POST` | `/knowledge/tips/{id}/dismiss` | Dismiss a tip |

### AI Question & Answer
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/knowledge/ask` | Ask ELLY a question — RAG retrieval + Groq response |
| `POST` | `/knowledge/explain` | Explain a term or concept in context of user's data |

---

## 6. RAG Pipeline (knowledge_engine.py)

Following the same pattern as existing AI integrations but adding retrieval.

### How It Works

```
1. User asks a question or system detects a trigger
         ↓
2. knowledge_engine.retrieve(query)
   → Search knowledge_articles by keyword / topic match
   → Return top N relevant article excerpts
         ↓
3. Build augmented prompt:
   [Relevant article excerpts]
   + [User's current ELLY data context — portfolio, revenue, cashflow]
   + [User's experience level from onboarding]
   + [User's question]
         ↓
4. Send to Groq LLM via LlamaModel.py
         ↓
5. Return grounded, contextual response
```

### Contextual Tip Triggers

Contextual tips are generated automatically when analytics events occur:

```
Trigger: low_diversification     → "Your diversification score is X. Here's what that means..."
Trigger: overexposure_holding    → "One holding is X% of your portfolio. Here's why that's a risk..."
Trigger: high_dso                → "Your DSO is X days. Here's how to reduce it..."
Trigger: revenue_drop            → "Revenue dropped X% this month. Here's what to check..."
Trigger: overdue_invoice         → "You have X overdue invoices. Here's how to follow up..."
Trigger: low_savings_rate        → "Your savings rate is below 10%. Here's how to improve it..."
```

### Plain-English Term Explainer

```
POST /knowledge/explain
{
  "term": "CAGR",
  "user_context": { "cagr": 0.12, "holding": "AAPL" }
}

→ "Your AAPL holding has grown at a CAGR of 12% annually.
   CAGR (Compound Annual Growth Rate) means your investment
   has grown by 12% on average each year since you bought it..."
```

---

## 7. Knowledge Base Content (Seed Articles)

The knowledge base should be seeded with articles covering:

### Finance Basics
- What is profit and loss?
- What is cash flow?
- Understanding your financial health score
- What is a savings rate and why does it matter?

### Investment Concepts
- What is CAGR and how is it calculated?
- What is portfolio diversification?
- What is volatility and why does it matter?
- Understanding asset types: stocks, ETFs, crypto, funds
- What is overexposure and how do you fix it?

### Business & Revenue
- What is Days Sales Outstanding (DSO)?
- How to manage overdue invoices
- Understanding recurring vs one-time revenue
- What is a revenue trend and how do you read it?

### Business Growth
- Introduction to financial projections
- What is break-even analysis?
- How to read a P&L statement
- Understanding cost structure

### Advanced (optional for MVP)
- What is the Markowitz Efficient Frontier?
- Introduction to portfolio optimisation
- Understanding the Herfindahl-Hirschman Index

---

## 8. Phased Execution Plan

| Phase | Name | Key Deliverables | Suggested Owner |
|---|---|---|---|
| Phase 0 | Learning Profile | Onboarding: experience level, learning goals, preferred explanation style | Jeffrey (Frontend) |
| Phase 1 | Data Models | KnowledgeArticle, LearningPath, UserProgress, ContextualTip models + router scaffold | Nishant (Backend) |
| Phase 2 | Knowledge Base Seed | Curate and load initial article library, topic taxonomy | Quinn (AI / Content) |
| Phase 3 | RAG Pipeline | knowledge_engine.py — article retrieval, prompt augmentation, Groq response | Quinn (AI) |
| Phase 4 | Contextual Tips Engine | Trigger detection from F1–F4 events, tip generation, GET /knowledge/tips | Cole (Backend) |
| Phase 5 | Ask ELLY Q&A | POST /knowledge/ask and POST /knowledge/explain endpoints | Quinn (AI) |
| Phase 6 | Dashboard & Learning UI | Article browser, learning paths, progress tracker, tip cards | Abdullah (Frontend) |
| Phase 7 | Personalisation | Recommended paths, difficulty adaptation, cross-feature context injection | Quinn (AI / Insights) |

---

## 9. Phase Detail Breakdown

### Phase 0 — Learning Profile (Jeffrey)
- Onboarding question: experience level (beginner / intermediate / advanced) — note: already captured in Feature 3 onboarding, can reuse
- Onboarding question: learning goals (understand my investments / grow my business / manage money better)
- Onboarding question: explanation preference (plain English / technical detail)
- Store responses and pass to knowledge engine as user context

### Phase 1 — Data Models & Foundation (Nishant)
- Define `KnowledgeArticle`, `LearningPath`, `UserLearningProgress`, `ContextualTip` in `models.py`
- Scaffold `knowledge.py` router with `/knowledge/*` prefix
- Register router in `main.py`
- Create `backend/knowledge_base/` folder for seed content files

### Phase 2 — Knowledge Base Seed (Quinn)
- Write initial set of articles in Markdown (see Section 7 topics)
- Load articles into `knowledge_articles` DB table on startup
- Define topic taxonomy and difficulty levels
- Tag articles with trigger types (e.g. article on diversification tagged `low_diversification`)

### Phase 3 — RAG Pipeline (Quinn)
- `knowledge_engine.py` with:
  - `retrieve(query, top_n)` — keyword/topic search against article table
  - `build_prompt(question, articles, user_context)` — augmented prompt builder
  - `ask(question, user_context)` — full RAG pipeline calling Groq via `LlamaModel.py`
- `POST /knowledge/ask` endpoint
- `POST /knowledge/explain` term explainer endpoint
- Fallback to `LlamaModelInternetSearch.py` if no relevant articles found

### Phase 4 — Contextual Tips Engine (Cole)
- `detect_tips(user_id, db)` — checks F1–F4 analytics for trigger conditions
- Trigger conditions defined in `contextual_tips` trigger table (see Section 6)
- Write `ContextualTip` rows when triggers fire
- `GET /knowledge/tips` — returns active, non-dismissed tips for the user
- `POST /knowledge/tips/{id}/dismiss` — mark tip as dismissed
- Tips include a linked article where relevant

### Phase 5 — Ask ELLY Q&A (Quinn)
- Full RAG Q&A via `POST /knowledge/ask`
- Plain-English term explainer via `POST /knowledge/explain`
- Inject user's live data context (portfolio summary, revenue summary, cashflow health) into every prompt
- Personalise response tone based on onboarding experience level

### Phase 6 — Dashboard & Learning UI (Abdullah)
- Knowledge panel: searchable article browser filtered by topic / difficulty
- Learning path view: ordered article sequence with progress tracking
- Contextual tip cards: shown on relevant dashboard pages (e.g. tip about diversification shown on investments page)
- "Ask ELLY" chat input on each feature page
- Saved articles list
- Reading progress indicator

### Phase 7 — Personalisation (Quinn)
- `GET /knowledge/paths/recommended` — returns path matched to user's experience level and learning goals
- Difficulty adaptation: if user dismisses beginner tips repeatedly, auto-promote to intermediate
- Cross-feature context: ELLY references data across all features in answers
  ("Your portfolio return is 12% CAGR and your savings rate is 8% — here's how those connect...")
- Internet search fallback via `LlamaModelInternetSearch.py` for questions outside the knowledge base

---

## 10. Integration With Other Features

### Feature 1 — Financial Projections
```
If forecast shows declining revenue → tip: "Understanding revenue forecasting"
If break-even is far out → explain: "What is break-even analysis?"
```

### Feature 2 — Personal Financial Health
```
If health score drops → tip: "How to improve your financial health score"
If savings rate < 10% → explain: "Why savings rate matters and how to improve it"
```

### Feature 3 — Investment Intelligence
```
If diversification score is low → tip: "What is portfolio diversification?"
If a holding shows overexposure → explain: "What is overexposure and what should you do?"
If CAGR needs explanation → explain in context of user's actual holding performance
```

### Feature 4 — Revenue Tracking
```
If DSO is high → tip: "How to reduce Days Sales Outstanding"
If overdue invoices accumulate → tip: "Best practices for invoice follow-up"
If revenue drops → explain: "Understanding revenue trends"
```

---

## 11. Open Source Tools & References

| Tool | Purpose | Notes |
|---|---|---|
| LlamaIndex (RAG) | Document retrieval + prompt augmentation | Referenced in team docs [17] |
| Groq LLM | AI response generation | Already integrated via LlamaModel.py |
| LlamaModelInternetSearch.py | Live web search fallback | Already built in codebase |
| MIT OpenCourseWare | Reference content source | Free business/finance courses [15] |
| MOBI (My Own Business Institute) | Reference content source | Free business education [16] |
| FastAPI / SQLAlchemy / SQLite | Backend / storage | Already in use |

---

## 12. Success Metrics

- Number of questions asked via Ask ELLY
- Article read rate (articles read / articles shown)
- Contextual tip engagement rate (tips acted on vs dismissed)
- Learning path completion rate
- User-reported confidence improvement (survey)
- Reduction in repeated support questions (if applicable)
- Cross-feature insight usage (tips from F3 data viewed on F3 page)

---

## 13. Open Questions for Team

- Should articles be stored as DB rows or flat Markdown files in the codebase?
- Should the knowledge base be editable by admins via an endpoint, or code-only?
- Should "Ask ELLY" be a floating chat widget across all pages, or a dedicated Knowledge page?
- How much internet search should be allowed — only when no article matches, or always?
- Should learning progress sync across devices (needs auth layer) or be local only for MVP?
- Should contextual tips auto-dismiss after a period, or stay until manually dismissed?
- Should articles have version history or be static for MVP?

---

## 14. Phase Ownership Summary

| Phase | Owner | Type | Status |
|---|---|---|---|
| Phase 0 — Learning Profile Onboarding | Jeffrey | Frontend | Not started |
| Phase 1 — Data Models & Foundation | Nishant | Backend | Not started |
| Phase 2 — Knowledge Base Seed Content | Quinn | AI / Content | Not started |
| Phase 3 — RAG Pipeline | Quinn | AI / Backend | Not started |
| Phase 4 — Contextual Tips Engine | Cole | Backend | Not started |
| Phase 5 — Ask ELLY Q&A Endpoints | Quinn | AI / Backend | Not started |
| Phase 6 — Dashboard & Learning UI | Abdullah | Frontend | Not started |
| Phase 7 — Personalisation & Adaptation | Quinn | AI / Insights | Not started |

---

## 15. Summary and Direction

Feature 5 is what transforms ELLY from a data dashboard into a genuine business intelligence advisor. The platform already tracks finances, investments, and revenue — Feature 5 is the layer that helps users understand what all of it means and what to do about it.

The technical foundation is already in the codebase: `LlamaModel.py`, `contextLlamaTest.py`, and `LlamaModelInternetSearch.py` are all built and working. Feature 5 layers a curated knowledge base and a RAG pipeline on top of these to ground AI responses in both the knowledge base and the user's real data.

The one-line principle from the brief applies most directly here:
> The system must help users **think, plan, and grow economically** — not just crunch numbers.

Feature 5 is how ELLY delivers on that promise.
