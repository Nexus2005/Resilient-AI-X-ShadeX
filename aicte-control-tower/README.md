# AICTE Control Tower

Approval workflow automation, compliance monitoring and alert management for AICTE
(Institutional Regulatory Compliance Platform). Alerts, routing and recommendations assist officials;
every statutory decision is signed by a human and written to the audit trail.

Planning documents live in `docs/` (read `docs/00_START_HERE.md` first).

## Stack

- `apps/web` — Next.js 16 (App Router), TypeScript, Tailwind CSS 4, shadcn/ui
- `apps/api` — FastAPI, SQLAlchemy 2, Alembic, PostgreSQL 16
- `scheduler` — APScheduler process, idempotent tick every 30 seconds
- Mailpit for email in development

## Run

```bash
cp .env.example .env
docker compose up --build
docker compose exec api alembic upgrade head
docker compose exec api python -m app.seed.seed
```

Demonstration accounts (password `DemoPass!26`, same for all five):

| Role | Email |
|---|---|
| Institution | `institution@demo.controltower.in` |
| Regional Officer | `regional@demo.controltower.in` |
| EVC Coordinator | `evc@demo.controltower.in` |
| Bureau Officer | `bureau@demo.controltower.in` |
| Admin | `admin@demo.controltower.in` |

| Service | URL |
|---|---|
| Web | http://localhost:3000 |
| API docs | http://localhost:8000/api/v1/docs |
| Health | http://localhost:8000/api/v1/health |
| Mailpit | http://localhost:8025 |

## Local development without Docker

```bash
cd apps/api && pip install -r requirements.txt && uvicorn app.main:app --reload
cd apps/web && npm ci && npm run dev
```

`DATABASE_URL` must point at a running PostgreSQL 16 instance.
