# Feature 4 — Revenue Tracking: Overview & Plan Document
**ELLY Platform | Team A | 2026 | v1.0**
**Team: Jeffrey King · Cole · Abdullah Abdosh · Quinn Tanti · Nishant Manchanda**
**Status: Planning — not yet built**

---

## 1. What Is Feature 4?

Feature 4 is the **Revenue Tracking** module of the ELLY platform.

While Feature 2 covers personal financial health and Feature 3 covers investment portfolio performance, Feature 4 focuses specifically on **business revenue** — helping small-business owners, freelancers, and entrepreneurs track where their money is coming from, manage invoices, and understand revenue trends over time.

Feature 4 answers the question:
> "Where is my business revenue coming from, what is outstanding, and how is it trending?"

### How It Fits in the ELLY Ecosystem

| Feature | Focus |
|---|---|
| Feature 1 | Business financial projections and forecasting |
| Feature 2 | Personal income, expenses, budgeting, financial health |
| Feature 3 | Investment portfolio tracking and performance |
| **Feature 4** | **Business revenue sources, invoices, client payments, trends** |

The key connection is that Feature 4 revenue data feeds directly into Feature 1 forecasting (actual vs projected revenue) and connects with Feature 2 cashflow health (business income flowing into personal finances).

---

## 2. Goals and Scope

**Primary goal:** Allow users to monitor all revenue sources and invoices, view incoming cash flows, track pending payments, and understand revenue trends over time.

### Users Must Be Able To:
- Log and track revenue sources (sales, subscriptions, freelance gigs, recurring payments)
- Create and manage invoices (issue date, due date, paid/unpaid status)
- Import invoices or revenue data via CSV
- Track payments per client
- Monitor overdue invoices

### System Must Show:
- Revenue timeline chart
- Top clients / income sources by revenue
- Monthly earnings trend
- Cash-on-hand projections
- Outstanding and overdue invoice summary

### ELLY Should Help With:
- Flagging overdue invoices automatically
- Detecting revenue anomalies (e.g. sudden drop in monthly income)
- Cashflow projections based on recurring revenue streams
- AI-driven suggestions (e.g. "Invoice #12 is 14 days overdue — send a reminder")

### Out of Scope (MVP):
- Direct payment processing or sending money
- Full accounting/bookkeeping (that is Feature 2's domain)
- Multi-currency support (future enhancement)
- Broker or bank API integration (future enhancement)

---

## 3. System Architecture

### High-Level Data Flow

```
User Revenue Input
        │
        ├── Manual entry (invoice / revenue source)
        └── CSV import
        │
        ▼
FastAPI Backend (main.py + revenue.py router)
        │
        ├── revenue_analytics.py   (calculations — totals, trends, DSO)
        ├── models.py              (ORM table definitions — Nishant pattern)
        └── database.py           (SQLite via SQLAlchemy — existing)
        │
        ▼
pf_data.db (SQLite — existing DB, new tables added)
        │
        ▼
Dashboard + Revenue Insights + AI Alerts
```

### Backend Stack (reuses existing)
- Python + FastAPI
- SQLAlchemy + SQLite (same `database.py` as Features 2 & 3)
- Pandas for CSV import
- NumPy for trend calculations
- Groq LLM (same as existing AI layer) for revenue insights

### New File Structure Proposed
```
backend/
  revenue.py              ← new FastAPI router (/revenue/*)
  revenue_analytics.py    ← calculation logic (same pattern as portfolio_analytics.py)
  models.py               ← extend with new revenue tables
```

---

## 4. Database Tables (Proposed)

> Following the same pattern as Feature 3 — Nishant defines all models in `models.py`, others write to / consume each table.

| Table | Purpose |
|---|---|
| `invoices` | One invoice per client transaction |
| `revenue_sources` | Recurring or categorised revenue streams |
| `clients` | Client records linked to invoices |
| `revenue_snapshots` | Point-in-time revenue totals (for trend charts) |

### Key Fields

**`invoices`**
```
id · user_id · client_id · description · amount · currency
status (draft / sent / paid / overdue) · issue_date · due_date · paid_date · source
```

**`revenue_sources`**
```
id · user_id · name · type (invoice / subscription / one-time / recurring)
amount · frequency (monthly / annual / one-time) · start_date
```

**`clients`**
```
id · user_id · name · email · total_billed · total_paid
```

**`revenue_snapshots`**
```
user_id · snapshot_date · total_revenue · total_pending
total_overdue · invoice_count · paid_count
```

---

## 5. Proposed API Endpoints

### Invoices
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/revenue/invoices` | Return all invoices for the user |
| `POST` | `/revenue/invoices` | Create a new invoice |
| `PATCH` | `/revenue/invoices/{id}` | Update invoice status (e.g. mark as paid) |
| `DELETE` | `/revenue/invoices/{id}` | Delete an invoice |
| `POST` | `/revenue/invoices/upload` | Bulk CSV import of invoices |

### Revenue Sources
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/revenue/sources` | Return all revenue sources |
| `POST` | `/revenue/sources` | Add a revenue source |
| `DELETE` | `/revenue/sources/{id}` | Remove a revenue source |

### Clients
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/revenue/clients` | Return all clients with billed/paid totals |
| `POST` | `/revenue/clients` | Add a client |

### Analytics
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/revenue/summary` | Totals: revenue, pending, overdue, paid count |
| `GET` | `/revenue/trends` | Monthly revenue trend over time |
| `GET` | `/revenue/top-clients` | Top clients ranked by total revenue |
| `GET` | `/revenue/snapshots` | Historical revenue snapshots |

### Insights & Alerts
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/revenue/insights` | Rule-based alerts: overdue, anomaly, drop detection |

---

## 6. Analytics Logic (revenue_analytics.py)

Following the same pattern as `portfolio_analytics.py`.

### Revenue Summary
```
total_revenue  = sum(amount) for all paid invoices in period
total_pending  = sum(amount) for sent but unpaid invoices
total_overdue  = sum(amount) for invoices past due_date and unpaid
collection_rate = (total_revenue / total_billed) × 100
```

### Days Sales Outstanding (DSO)
```
DSO = (total_outstanding / total_revenue) × days_in_period
Lower DSO = faster payment collection
```

### Monthly Trend
```
Group paid invoices by month → sum(amount) per month
Compare current month vs previous month → growth %
```

### Overdue Detection
```
Flag any invoice where: status != "paid" AND due_date < today
Severity:
  low    → 1–7 days overdue
  medium → 8–30 days overdue
  high   → 30+ days overdue
```

---

## 7. Phased Execution Plan

| Phase | Name | Key Deliverables | Suggested Owner |
|---|---|---|---|
| Phase 0 | Business Setup | Onboarding: business type, revenue stream types | Jeffrey (Frontend) |
| Phase 1 | Data Models | Invoice, Client, RevenueSource, RevenueSnapshot ORM models + router scaffold | Nishant (Backend) |
| Phase 2 | Invoice & Revenue CRUD | Manual invoice creation, client management, revenue source logging | Abdullah (Backend + Frontend) |
| Phase 3 | CSV Import | Bulk import invoices/revenue from CSV, validation and error feedback | Abdullah (Backend + Frontend) |
| Phase 4 | Revenue Analytics | Summary totals, DSO, monthly trend, top clients, snapshot writing | Cole (Backend) |
| Phase 5 | Dashboard Frontend | Revenue timeline chart, top clients list, invoice status table, overdue banner | Abdullah (Frontend) |
| Phase 6 | Alerts & Insights | Overdue alerts, revenue drop detection, GET /revenue/insights endpoint | Jeffrey (Backend) |
| Phase 7 | AI Layer | Cashflow projections, payment reminder suggestions, revenue recommendations | Quinn (AI / Insights) |

---

## 8. Phase Detail Breakdown

### Phase 0 — Business Setup (Jeffrey)
- Onboarding question: business type (freelancer / small business / SaaS / other)
- Onboarding question: primary revenue types (invoiced work / subscriptions / product sales)
- Store responses and pass to AI insights layer

### Phase 1 — Data Models & Foundation (Nishant)
- Define `Invoice`, `Client`, `RevenueSource`, `RevenueSnapshot` in `models.py`
- Scaffold FastAPI router `revenue.py` with `/revenue/*` prefix
- Register router in `main.py` (`app.include_router(revenue_router)`)
- Run `Base.metadata.create_all()` to create new tables on startup

### Phase 2 — Invoice & Revenue CRUD (Abdullah)
- `POST /revenue/invoices` — create invoice with client, amount, due date, status
- `GET /revenue/invoices` — list all invoices (filterable by status)
- `PATCH /revenue/invoices/{id}` — update status (mark paid, sent, overdue)
- `DELETE /revenue/invoices/{id}` — delete invoice
- `POST /revenue/sources` — add recurring revenue source
- Frontend: invoice creation form, client picker, status management

### Phase 3 — CSV Import (Abdullah)
- `POST /revenue/invoices/upload` — parse CSV, validate required columns, bulk insert
- Required CSV columns: `client_name, description, amount, issue_date, due_date`
- Optional: `status, paid_date, currency`
- Frontend: drag-and-drop CSV upload with error feedback (same pattern as Feature 3)

### Phase 4 — Revenue Analytics (Cole)
- `revenue_analytics.py` module with:
  - `calculate_revenue_summary()` — totals, pending, overdue, collection rate
  - `calculate_dso()` — days sales outstanding
  - `calculate_monthly_trend()` — month-by-month revenue breakdown
  - `get_top_clients()` — ranked by total revenue
- `GET /revenue/summary` — calls above functions, writes `RevenueSnapshot`
- `GET /revenue/trends` — returns monthly trend data for chart
- `GET /revenue/top-clients` — returns ranked client list

### Phase 5 — Dashboard Frontend (Abdullah)
- Revenue timeline line chart (monthly totals)
- Invoice status summary cards (total revenue, pending, overdue)
- Top clients / top income sources list
- Invoice table: client, amount, due date, status, days overdue
- Overdue invoice banner / alert strip
- Cash-on-hand projection based on pending + recurring sources

### Phase 6 — Alerts & Insights (Jeffrey)
- Rule-based checks:
  - Invoice overdue → severity based on days past due (low / medium / high)
  - Revenue drop > 20% month-on-month → warning alert
  - No invoices issued in 30+ days → reminder alert
  - Collection rate below 70% → risk alert
- `GET /revenue/insights` — returns categorised alerts with severity
- Language personalised based on onboarding business type

### Phase 7 — AI Layer (Quinn)
- Connect onboarding business profile into AI prompt context
- Cashflow projection: "Based on your recurring sources, projected revenue next month is $X"
- Payment reminder suggestions: "Invoice #12 for Client Y is 14 days overdue — suggested action"
- Revenue growth recommendations: "Your top client accounts for 60% of revenue — consider diversifying"
- Integration with Feature 1 projections: actual revenue vs forecast comparison
- Integration with Feature 2 cashflow: business income informing personal financial health score

---

## 9. Integration With Other Features

### Feature 1 — Financial Projections
```
Revenue actuals from Feature 4
→ Feed into Feature 1 Prophet forecast as historical data
→ Compare actual vs projected → variance reporting
```

### Feature 2 — Personal Financial Health
```
Feature 4 business revenue
→ If strong recurring revenue → positive signal on personal financial health
→ If revenue dropping → ELLY warns about financial risk
```

### Feature 3 — Investment Intelligence
```
Feature 4 revenue + Feature 2 cashflow
→ Combined into AI investment recommendations
→ "Strong business month → consider increasing investment contributions"
```

---

## 10. Open Source Tools & References

| Tool | Purpose | Notes |
|---|---|---|
| FastAPI | API framework | Already in use |
| SQLAlchemy | ORM / database | Already in use |
| Pandas | CSV parsing | Already in use |
| NumPy | Trend calculations | Already in use |
| Akaunting | Reference accounting tool | Open-source, good for invoice patterns |
| Firefly III | Reference personal finance + invoicing | Open-source, self-hosted |
| Wave Accounting | Reference UI/UX | Free, used by freelancers |

---

## 11. Success Metrics

- Percentage of invoices marked paid on time
- User engagement with revenue dashboard
- Reduction in days sales outstanding (DSO)
- Number of revenue sources tracked per user
- Alert accuracy for overdue invoice detection
- Revenue forecast vs actuals variance

---

## 12. Open Questions for Team

- Should invoices support multi-currency in MVP, or single currency only?
- Should clients be a separate table, or just a text field on invoices for MVP?
- Should recurring revenue sources auto-generate invoices on schedule?
- Should Feature 4 integrate directly with Akaunting or Firefly III, or build standalone?
- Should revenue data link to Feature 2 transactions (avoiding double-counting)?
- What CSV format should be the standard for invoice import?
- Should overdue reminders be sent via email/notification, or just shown in the dashboard?

---

## 13. Phase Ownership Summary

| Phase | Owner | Type | Status |
|---|---|---|---|
| Phase 0 — Business Setup Onboarding | Jeffrey | Frontend | Not started |
| Phase 1 — Data Models & Foundation | Nishant | Backend | Not started |
| Phase 2 — Invoice & Revenue CRUD | Abdullah | Backend + Frontend | Not started |
| Phase 3 — CSV Import | Abdullah | Backend + Frontend | Not started |
| Phase 4 — Revenue Analytics | Cole | Backend | Not started |
| Phase 5 — Dashboard Frontend | Abdullah | Frontend | Not started |
| Phase 6 — Alerts & Insights | Jeffrey | Backend | Not started |
| Phase 7 — AI Layer & Projections | Quinn | AI / Insights | Not started |

---

## 14. Summary and Direction

Feature 4 extends ELLY from personal financial intelligence and investment tracking into **business revenue management** — giving small business owners and freelancers a clear view of where money is coming from, what is outstanding, and how revenue is trending.

The recommended approach is to start simple: manual invoice entry and CSV import, a basic revenue summary, and overdue detection. Then expand into trend analytics, AI-driven cashflow projections, and cross-feature integration with Features 1, 2, and 3.

The one-line principle from the brief applies here too:
> The system must help users **think, plan, and grow economically** — not just report historical data.

Feature 4 is the business income layer that, combined with Feature 2 (personal spending) and Feature 3 (investments), completes the full personal wealth intelligence picture within ELLY.
