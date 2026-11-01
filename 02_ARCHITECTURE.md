# 02. Architecture blueprint

## 1. Principle
A **modular monolith**: one Next.js web app, one FastAPI backend, one PostgreSQL database, one scheduler process. Not microservices. Deadlines live in PostgreSQL, never only in memory. Keep it simple enough to finish and demo reliably.

```
Browser (Next.js, role-based portals)
        │  HTTPS, JSON, httpOnly cookie (JWT)
        ▼
FastAPI (api)  ── modules: auth, institutions, applications, workflow,
        │          deadlines, evc, obligations, documents, notifications,
        │          escalation, reports, audit, admin, demo
        ├── PostgreSQL  (all state, rule versions, audit chain)
        ├── File storage (local volume in dev, S3-compatible in prod)
        ├── Scheduler (APScheduler, separate process, idempotent tick every 30s)
        ├── SMTP (Mailpit in dev, real SMTP in prod)
        └── Optional: LLM API (summaries), OCR (PaddleOCR or Tesseract, local)
```

## 2. Stack (decided, do not change without asking)
| Layer | Choice | Reason |
|---|---|---|
| Frontend | Next.js (App Router) + TypeScript + Tailwind CSS + shadcn/ui | Fast, agency-grade, accessible components |
| Data fetching | TanStack Query | Caching and polling for live dashboards |
| Charts | shadcn chart (Recharts) | Fully themeable in our purple palette |
| Map | d3-geo SVG choropleth with India GeoJSON | No API key, full style control, crisp in slides |
| Icons | Phosphor Icons (`@phosphor-icons/react`) | One consistent curated set |
| Animation | `lottie-react` (few animations) and Framer Motion (subtle) | See UI spec |
| Forms | react-hook-form + zod | Validation |
| Backend | FastAPI, SQLModel or SQLAlchemy 2, Alembic, Pydantic v2 | Typed, quick |
| State machine | Own transition table driven by rule JSON (library `transitions` optional) | Transparent and testable |
| Scheduler | APScheduler (Postgres job state not required: our tick reads due items from tables) | No Redis needed |
| DB | PostgreSQL 16 | JSONB for rules and checklists |
| Auth | JWT in httpOnly cookie, argon2 password hashing, role claims | Simple and secure |
| Email | Mailpit (dev), SMTP (prod) | Visible emails for the demo |
| OCR | PaddleOCR (fallback Tesseract) + `dateparser` + regex | Suggest dates only |
| PDF export | WeasyPrint or ReportLab | Reports and case summary |
| Deploy | Docker Compose; web on Vercel or VPS, API + DB on Render, Railway or VPS | Reliable |

## 3. Repository layout
```
aicte-control-tower/
├── docs/                      # these md files + reference-ui/ images
├── apps/
│   ├── web/                   # Next.js
│   │   ├── app/
│   │   │   ├── (marketing)/   # /, /how-it-works, /roles, /about
│   │   │   ├── (auth)/        # /login, /forgot-password
│   │   │   └── (app)/         # role portals (see UI spec routes)
│   │   ├── components/        # ui/ (shadcn), layout/, charts/, map/, domain/
│   │   ├── lib/               # api client, auth, formatters, constants
│   │   └── public/lottie, public/geo
│   └── api/
│       ├── app/
│       │   ├── core/          # config, db, security, clock
│       │   ├── modules/       # one folder per module (router, service, models, schemas)
│       │   ├── engines/       # rules.py, workflow.py, deadlines.py, escalation.py, notify.py
│       │   ├── scheduler/     # tick.py
│       │   └── seed/          # seed.py, data files
│       ├── alembic/
│       └── tests/
├── docker-compose.yml
├── .env.example
├── PROGRESS.md
└── README.md
```

## 4. Data model (PostgreSQL)
Use UUID primary keys, `created_at`, `updated_at`. All times stored UTC, shown in IST.

| Table | Key fields |
|---|---|
| `users` | id, name, email, password_hash, role, region_id, institution_id, prefs (JSONB), active |
| `regions` | id, name, office_city, states[] |
| `institutions` | id, pid, name, state, district, lat, lng, region_id, type, status |
| `applications` | id, app_no (AICTE/2026/014 style), institution_id, type, academic_year, route (JSONB list), current_stage, rule_version_id, status, submitted_at, owner_user_id, locked_fields (JSONB) |
| `stage_instances` | id, application_id, stage, entered_at, due_at, completed_at, owner_user_id, paused_seconds, outcome |
| `stage_history` | id, application_id, from_stage, to_stage, actor_id, reason, created_at |
| `reverts` | id, application_id, issued_by, category, aph_reference, required_evidence, due_at, status, resolved_at |
| `evc_cases` | id, application_id, queued_at, priority, scheduled_for, completed_at, panel (JSONB expert ids), report_doc_id, status |
| `experts` | id, name, region_id, home_district, home_institution, past_employers[], active |
| `obligations` | id, institution_id, application_id, type, title, source_ref, evidence_required, due_at, state, owner_user_id, verified_by, verified_at |
| `documents` | id, institution_id, application_id, obligation_id, type, version, parent_id, file_path, sha256, issue_date, expiry_date, dates_confirmed (bool), ocr_suggestion (JSONB), verification_state |
| `notifications` | id, user_id, channel, template_key, subject, body, trigger, entity_type, entity_id, status, sent_at, read_at, error |
| `escalations` | id, entity_type, entity_id, level, to_user_id, triggered_at, acknowledged_at, resolved_at |
| `rule_versions` | id, name, version, status (draft/published/retired), effective_from, config (JSONB), created_by, notes |
| `holidays` | id, date, label, region_id nullable |
| `audit_events` | id (bigserial), at, actor_id, role, action, entity_type, entity_id, payload (JSONB), prev_hash, hash |
| `system_clock` | id=1, offset_seconds (demo only) |
| `summaries` | id, application_id, generated_at, method (template/llm), content |

Unique constraint on `(entity, trigger_key)` in `notifications` and `escalations` guarantees **idempotency**: the same reminder or escalation can never be created twice.

## 5. Engines

### 5.1 Rule engine (`engines/rules.py`)
`rule_versions.config` is one JSON document. Example shape (the agent must follow this shape):
```json
{
  "application_types": {
    "new_institution": {
      "route": ["scrutiny", "evc", "sac_shc"],
      "documents": ["land_document", "building_plan", "trust_deed", "fire_noc"],
      "aph_reference": "To be mapped from APH 2024-27"
    },
    "extension_of_approval": {
      "route": ["scrutiny"],
      "conditions": [{"if": "intake_change_pct > 25", "route": ["scrutiny", "evc"]}]
    }
  },
  "stage_targets_days": {"scrutiny": 7, "re_scrutiny": 5, "evc_schedule": 5, "evc_complete": 10, "sac_shc": 10},
  "clock": {"working_days_only": true, "pause_on": ["revert_open"]},
  "reminders_days_before": [90, 60, 30, 7],
  "stage_warning_at_pct": 80,
  "escalation_ladder": [
    {"level": 1, "after_hours": 0,  "to": "regional_officer"},
    {"level": 2, "after_hours": 72, "to": "bureau_officer"},
    {"level": 3, "after_hours": 168, "to": "member_secretary_view"}
  ]
}
```
Functions: `resolve_route(app)`, `target_for(stage, version)`, `required_documents(app)`. Publishing creates a new version with an effective date. Existing applications keep their `rule_version_id`. Unit-test every route and every condition.

### 5.2 Workflow engine (`engines/workflow.py`)
- Allowed transitions are a table: `(from_stage, event, required_role) -> to_stage`.
- Stages: `draft, submitted, scrutiny, reverted, re_scrutiny, evc_queue, evc_scheduled, evc_completed, sac_shc, approved_with_undertakings, approved, closed`.
- `advance(app, event, actor)` checks role and preconditions, runs inside one DB transaction, closes the current `stage_instance`, opens the next with `due_at` from the deadline engine, writes `stage_history` and an audit event, and emits notifications.
- Approval, rejection and revert events require a **signed action** (`POST /sign` with password re-entry, simulated e-sign). Never callable by the scheduler.

### 5.3 Deadline engine (`engines/deadlines.py`)
- `due_at = add_working_days(entered_at, target_days, holidays)` plus paused time.
- Status: `on_track` (<80%), `at_risk` (80 to 100%), `overdue` (>100%).
- Two clocks: `total_age` since submission and `stage_age`.
- **Delay-risk estimate**: transparent heuristic (elapsed %, officer open load, unresolved dependencies). Show the factors. Label it "Estimate", never as a finding.

### 5.4 Scheduler tick (`scheduler/tick.py`)
Runs every 30 seconds, uses `core/clock.now()` (real time plus demo offset). Idempotent. On each tick:
1. Stage instances crossing 80% -> warning notification to owner.
2. Stage instances past due -> mark overdue, create escalation level 1.
3. Open escalations unacknowledged beyond ladder delay -> next level.
4. Obligations and documents hitting a reminder offset -> reminder to institution (+ officer dashboard flag).
5. Obligations past due -> state `overdue`, escalation.
6. Reverts past `due_at` -> notify officer. **Do not auto-escalate to SAC/SHC and do not auto-reject.** The officer decides.
7. EVC queued and not scheduled within target -> alert.
Every created row uses a unique key so a second tick does nothing.

### 5.5 Notification service (`engines/notify.py`)
`notify(user, template_key, context, channels)` renders a versioned template, respects the user's preferences, inserts a `notifications` row per channel, sends email through SMTP, SMS through an adapter (`SimulatedSms` by default). Failures are retried with backoff and stored in `error`.

### 5.6 Audit chain (`modules/audit`)
`hash = sha256(prev_hash + canonical_json(event))`. Insert only. Database role used by the app has no UPDATE or DELETE on `audit_events`. `GET /audit/verify` recomputes the chain and returns the first broken row if any.

### 5.7 Document intelligence (`modules/documents`)
Upload -> store file, compute sha256 -> OCR first two pages -> regex and `dateparser` find candidate dates near words like "expiry", "valid till", "lease period", "from", "to" -> save `ocr_suggestion` with confidence and snippet -> UI asks a human to confirm. `dates_confirmed` must be true before the document starts any clock.

### 5.8 Case summary
Build a structured JSON of the case (stages, deficiencies, EVC result, obligations, document validity). Render a fixed template to PDF. Optional: send the JSON to an LLM to rewrite as short prose, with instruction "use only the provided facts". Show a "Generated from record" label and the method used. Fallback to the template if no API key.

## 6. API surface (REST, `/api/v1`)
```
POST /auth/login   POST /auth/logout   GET /auth/me   POST /auth/change-password
GET/PATCH /me/preferences

GET/POST /institutions          GET /institutions/{id}
GET/POST /applications          GET /applications/{id}      POST /applications/{id}/submit
GET /applications/{id}/timeline GET /applications/{id}/explain
POST /applications/{id}/actions    # body: event, payload; signed events need /sign token
POST /sign                         # re-enter password, returns short-lived sign token
POST /applications/{id}/revert     POST /applications/{id}/resubmit
GET /applications/{id}/summary     GET /applications/{id}/summary.pdf

GET /evc/queue    POST /evc/{id}/panel/check   POST /evc/{id}/panel   POST /evc/{id}/schedule   POST /evc/{id}/complete

GET/POST /obligations    POST /obligations/{id}/submit    POST /obligations/{id}/verify    POST /obligations/{id}/deficient
GET/POST /documents      POST /documents/{id}/confirm-dates    POST /documents/{id}/renew    POST /documents/{id}/verify

GET /notifications   POST /notifications/{id}/read   POST /notifications/read-all
GET /escalations     POST /escalations/{id}/acknowledge

GET /dashboard/regional   GET /dashboard/bureau   GET /dashboard/institution
GET /analytics/pendency-by-stage   /by-region   /bottlenecks   /workload   /map/institutions   /map/applications
GET /reports/{type}?filters...&format=json|csv|pdf

GET /audit   GET /audit/verify
Admin:  GET/POST /admin/users   GET/POST /admin/rules  POST /admin/rules/{id}/publish  POST /admin/rules/{id}/test
        GET/PUT /admin/templates  GET/POST /admin/holidays
Demo:   GET /demo/clock   POST /demo/clock/advance   POST /demo/clock/reset
```
Every list endpoint supports pagination, sorting and filters. Every response has typed schemas. OpenAPI must be generated and the web client typed from it (`openapi-typescript`).

## 7. Security baseline
Argon2 hashing, httpOnly + SameSite cookies, CSRF token for state-changing calls, role checks as FastAPI dependencies, row filtering by region and institution in the service layer, file type and size checks (OWASP upload cheat sheet), randomised stored file names, rate limit on login, CORS locked to the web origin, secrets only in `.env`.

## 8. Testing minimum
- Unit: rule resolution, working-day maths, status thresholds, audit chain, notification idempotency.
- Integration: full lifecycle test through the API (acceptance tests 1 to 12).
- Playwright: login for each role, the hero case flow, one report export.
Run all in CI-style script `make verify`.
