# Database Connection Guide

This project uses a **Supabase-hosted PostgreSQL** database shared across teams. The backend connects to it via SQLAlchemy using a standard `DATABASE_URL` environment variable.

---

## Prerequisites

- Python 3.10+
- The packages below are already in `requirements.txt` — install with `pip install -r backend/requirements.txt`:
  - `sqlalchemy>=2.0.0`
  - `psycopg2-binary>=2.9.0`
  - `python-dotenv>=1.0.0`

---

## Setting Up Your `.env`

Create a file at `backend/.env` (never commit this file) and add:

```env
DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<dbname>
```

Contact the backend team to get the actual credentials. The connection uses Supabase's **connection pooler** endpoint — make sure you use the pooler host (format: `*.pooler.supabase.com`) rather than the direct host, as the pooler handles concurrent connections more efficiently.

### Connection string breakdown

| Part | Description |
|---|---|
| `postgresql://` | Driver — use this, not `postgres://` |
| `<user>` | Supabase DB user (usually `postgres.<project-ref>`) |
| `<password>` | DB password — get from the team |
| `<host>` | Pooler host, e.g. `aws-1-ap-southeast-2.pooler.supabase.com` |
| `<port>` | `5432` (pooler transaction mode) |
| `<dbname>` | `postgres` |

---

## How the Backend Uses It

The connection is initialized in `backend/database.py`. It uses SQLAlchemy and exposes:

- `engine` — the raw SQLAlchemy engine
- `SessionLocal` — session factory used throughout the app
- `get_db()` — FastAPI dependency injected into route handlers

```python
from database import get_db
from sqlalchemy.orm import Session
from fastapi import Depends

@app.get("/example")
def example(db: Session = Depends(get_db)):
    ...
```

If `DATABASE_URL` is not set, the app falls back to a local SQLite file (`pf_data.db`) for development — but this will not reflect the shared Supabase schema.

---

## Verify Your Connection

Run this from the `backend/` directory to confirm the connection works:

```python
from database import engine
from sqlalchemy import text

with engine.connect() as conn:
    result = conn.execute(text("SELECT 1"))
    print("Connected:", result.fetchone())
```

Or run it as a one-liner from the terminal:

```bash
cd backend
python -c "from database import engine; from sqlalchemy import text; print(engine.connect().execute(text('SELECT 1')).fetchone())"
```

A result of `(1,)` means the connection is working.

---

## Supabase Dashboard Access

The database can also be accessed through the Supabase web UI (table editor, SQL editor, logs). Ask the backend team to invite your email to the Supabase project if you need direct dashboard access.

---

## Notes

- Do **not** commit `backend/.env` — it is listed in `.gitignore`
- The pooler uses **transaction mode** — avoid session-level PostgreSQL features (e.g. `SET LOCAL`, advisory locks) as they may not persist across pooled connections
- If you add new tables or models, define them in `backend/models.py` and ensure they inherit from `Base` so `Base.metadata.create_all(engine)` picks them up
