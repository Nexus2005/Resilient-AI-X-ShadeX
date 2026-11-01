# 03. Repositories and APIs

> Before cloning anything, the agent must open the repo, confirm it exists, read its licence (MIT or Apache-2.0 is fine), check the last commit date and check the framework version. If a repo is gone or the version conflicts, use the fallback, do not guess.

## 1. Honest verdict on the repos you shared
Your shared tools are excellent for a production rollout, but **too heavy to run, connect and theme inside a hackathon**. Each one adds a server, a database, a login system and its own look. Your judges will see a mixed, unthemed product and your demo will break more often.

| Repo | Verdict | Why | What we do instead |
|---|---|---|---|
| temporalio/temporal | **Do not run it.** Mention it as the production path. | Needs its own server cluster and SDK learning curve | Own transition table + scheduler tick. Pitch line: "workflow core is portable to Temporal or Camunda". |
| paperless-ngx/paperless-ngx | **Do not clone.** | A full Django app with its own UI and users | Our own document module + PaddleOCR/Tesseract + `dateparser`. |
| calcom (docs, cal.com) | **Do not clone.** | Built for booking links, not committee assignment with conflict rules | Own EVC scheduler + calendar UI (`react-big-calendar` or FullCalendar). |
| novuhq/novu (InsForge issue link) | **Do not self-host.** | Heavy stack | Own notification service (section 5.5 of architecture). |
| tooljet/tooljet, appsmith | **Do not use.** | Gives a generic admin look, not agency quality | Next.js + shadcn with our theme. |
| frappe, nocodb, keycloak, superset | **Do not use.** | Heavy, and visually foreign | Own auth, own dashboards. |

**You still get the benefit:** the architecture shows the same ideas (durable workflow, document metadata, scheduling, notifications), implemented lightweight and themed.

## 2. What to clone (to save time)
| # | Repo | Use it for | How |
|---|---|---|---|
| 1 | `fastapi/full-stack-fastapi-template` (verify) | Backend skeleton: FastAPI, Postgres, SQLModel, Alembic, JWT auth, Docker Compose, tests, email templates | Clone, **keep only the `backend/` and Docker setup**, delete its frontend. Rename to `apps/api`. Add our modules. |
| 2 | shadcn/ui via CLI (`npx shadcn@latest init`) | All UI primitives and chart components | Not a clone. Install components as needed. |
| 3 | A shadcn dashboard starter for the **app shell and layout ideas** only, such as `Kiranism/next-shadcn-dashboard-starter` or `arhamkhnz/next-shadcn-admin-dashboard` (verify both exist and licences) | Sidebar, header, table, data-grid patterns | Clone **into a scratch folder**, copy the layout patterns, **strip third-party auth (Clerk), sample data and their colours**, then restyle to our theme. Do not keep their look. |
| 4 | `datameet/maps` GeoJSON (or another official-boundary India states file) | India state boundaries | Download one states file, simplify with `mapshaper` to under 300 KB, store in `public/geo/india-states.json`. |
| 5 | `pytransitions/transitions` (optional) | State machine helper | `pip install transitions` only if it speeds up. Own table is fine. |

**India map caution (important for a government hackathon):** the boundary must show the official outline of India, including Jammu and Kashmir, Ladakh and Arunachal Pradesh as per Survey of India. Use a GeoJSON that follows it, and **check the rendered map visually** before the demo. Do not use default world-map datasets.

## 3. Python and Node packages (verify each exists before install)
**Backend:** `fastapi`, `uvicorn`, `sqlmodel` or `sqlalchemy`, `alembic`, `psycopg[binary]`, `pydantic-settings`, `argon2-cffi`, `python-jose` or `pyjwt`, `apscheduler`, `python-multipart`, `aiosmtplib` or `smtplib`, `dateparser`, `paddleocr` and `paddlepaddle` (or `pytesseract`), `pymupdf`, `weasyprint` or `reportlab`, `pandas` (reports), `faker` (seed), `pytest`, `httpx`.

**Frontend:** `next`, `react`, `typescript`, `tailwindcss`, `@tanstack/react-query`, `react-hook-form`, `zod`, `@hookform/resolvers`, `recharts` (via shadcn chart), `d3-geo`, `topojson-client` (if used), `@phosphor-icons/react`, `lottie-react`, `framer-motion`, `react-big-calendar` or `@fullcalendar/react`, `date-fns`, `sonner` (toasts), `openapi-typescript`, `playwright`.

If PaddleOCR is too heavy to install on the demo machine, **fall back to Tesseract** or to a stored OCR result for the three demo PDFs. Document the choice in `PROGRESS.md`.

## 4. External APIs and keys
| Need | Choose | Key needed? | Notes |
|---|---|---|---|
| **India map** | d3-geo + local GeoJSON | **No** | Preferred. Fully offline and styleable. |
| Optional street-level map (institution pins zoom) | MapLibre GL + MapTiler tiles | **Yes, free tier** | Only if time permits. Give the key as `NEXT_PUBLIC_MAPTILER_KEY`. |
| **Email** | Mailpit locally (no key). For live: Brevo, Resend or any SMTP | Optional | Demo with Mailpit open in a second tab. |
| **SMS** | Simulated adapter by default | Optional | If you want real SMS: MSG91 or Twilio. Note DLT registration is needed in India. Not worth it for the demo. |
| **LLM for case summary wording (optional)** | DeepSeek API (cheap, OpenAI-compatible) or Gemini free tier or Claude API | **Yes if used** | Behind one interface `summarise(facts) -> text`. Template fallback must always work. Env: `LLM_PROVIDER`, `LLM_API_KEY`, `LLM_MODEL`. |
| **OCR** | PaddleOCR or Tesseract | **No** | Local. |
| Lottie animations | LottieFiles free library (check each licence) | No | Download JSON, store in `public/lottie`. Use 4 only. |
| Fonts | Plus Jakarta Sans via `next/font/google` | No | Self-hosted by Next. |
| DigiLocker, NSWS, API Setu | **Do not integrate** | n/a | Show as "Planned integration" in Admin Settings only. |

## 5. Environment file (`.env.example`)
```
DATABASE_URL=postgresql+psycopg://aicte:aicte@db:5432/aicte
JWT_SECRET=change-me
WEB_ORIGIN=http://localhost:3000
DEMO_MODE=true
SMTP_HOST=mailpit
SMTP_PORT=1025
SMTP_FROM=no-reply@control-tower.local
SMS_PROVIDER=simulated
LLM_PROVIDER=none
LLM_API_KEY=
LLM_MODEL=
STORAGE_DIR=/data/files
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
NEXT_PUBLIC_MAPTILER_KEY=
```

## 6. Docker Compose services
`db` (postgres:16), `api` (uvicorn), `scheduler` (same image, runs `python -m app.scheduler.tick`), `web` (Next.js), `mailpit`. One command: `docker compose up --build`. Seed command: `docker compose exec api python -m app.seed.seed`.

## 7. Deployment (deployment-ready means this works)
- Option A (simplest): one VPS or a cloud VM, Docker Compose behind Caddy (automatic HTTPS).
- Option B: web on Vercel, API + scheduler + Postgres on Render or Railway. Scheduler must be a separate always-on worker.
- Keep `DEMO_MODE=true` on the demo deployment, `false` otherwise.
- Provide `README.md` with run, seed, test and deploy steps.
