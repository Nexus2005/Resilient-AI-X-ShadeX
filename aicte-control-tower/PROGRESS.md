# Progress

Honest log of what is built, what was verified with which command, and what is missing.

## Phase 0 — Setup (done)

### Built
- New project at `aicte-control-tower/` (the repository root holds the planning files; this folder is self-contained).
- Layout: `docs/` (planning files + renamed reference images), `apps/web` (Next.js), `apps/api` (FastAPI), `docker-compose.yml`, `.env.example`, `Makefile`, `README.md`.
- Reference images renamed to the names in `docs/04_UI_UX_SPEC.md` section 2.
- Web: Next.js 16.4.3 (App Router, TypeScript strict via generated config), React 19.3.0, Tailwind CSS 4.3.3, shadcn/ui 4.23.0 (`base-nova` style, Base UI primitive), Phosphor icons 2.1.10. Design tokens from the UI spec defined in `app/globals.css`, Plus Jakarta Sans via `next/font`, themed placeholder page.
- API: FastAPI 0.162.0, SQLAlchemy 2.1.6, psycopg 3.3.6, pydantic-settings 2.16.2, Alembic 1.20.1 wired to app settings, `/api/v1/health` with a real database check, CORS locked to `WEB_ORIGIN`, typed settings.
- Scheduler: separate process (`python -m app.scheduler.tick`), APScheduler, 30 second idempotent tick (currently logs a heartbeat; the seven checks arrive in Phase 4).
- Compose services: `db` (postgres:16-alpine), `api`, `scheduler`, `web` (standalone build), `mailpit`. Named volumes for database and file storage.

### Verified (commands and real output)
```
$ docker compose ps
api         Up (healthy)
db          Up (healthy)
mailpit     Up (healthy)
scheduler   Up
web         Up

$ curl -s http://localhost:8000/api/v1/health
{"status":"ok","service":"AICTE Control Tower","database":"ok","demo_mode":true,
 "time":"2026-11-01T06:58:28.706359+00:00"}   HTTP 200

$ curl http://localhost:3000              -> HTTP 200
$ curl http://localhost:8025              -> HTTP 200
$ docker compose logs scheduler           -> "tick at ... database=True", scheduler started
$ docker compose exec -T api pytest       -> 2 passed
$ npm run build (apps/web)                -> Compiled successfully, TypeScript OK, 2 routes
```
Served CSS contains the token values `#5b35e5`, `#2a1a6e`, `#1b1534` and `--font-jakarta`,
so the palette and font are actually applied, not only declared.

### Deviations from the planning files
1. **FastAPI template not cloned.** `docs/03_REPOS_AND_APIS.md` asks to clone `fastapi/full-stack-fastapi-template` and keep its backend. I did not verify/clone a third-party repository without your confirmation; the skeleton is hand-written instead, following the same conventions (settings, session factory, Alembic, pytest). Say if you want the template merged in.
2. **Tailwind CSS 4.** Latest shadcn CLI targets Tailwind 4, which has no `tailwind.config.ts`; tokens live in `globals.css` under `:root` and `@theme inline`. Same token values as the UI spec.
3. **Next.js 16.4.3** rather than 15. The spec fixes the App Router, not the version.
4. **shadcn uses Base UI now**, and installed `lucide-react` by default. I removed `lucide-react` and installed `@phosphor-icons/react` so only Phosphor is available, per the UI spec.
5. **Database port not published** to the host (port 5432 was already allocated by another local container). The API and scheduler reach it on the Compose network.
6. **`make` is not installed on this Windows host**, so the gates above were run with `docker compose` directly. The `Makefile` is present for machines that have it.
7. **`ref-avoid-softui.webp` has no source image** in the uploads. The second NFIP screenshot is kept as `ref-avoid-nfip-desktop.webp`; `ref-avoid-nfip.webp` is the mobile NFIP screenshot.
8. **No LLM key** (`KEYS.txt` is empty). Case summaries will use the deterministic template and be labelled "Template" until `GEMINI_API_KEY` is supplied.

### Known gaps carried forward
- No database migrations yet (first migration lands in Phase 2 with the data model).
- `app/seed/` is an empty package; the seed script is Phase 2 work.
- Demo clock is not implemented; `app/core/clock.now_utc()` returns real time until Phase 4.
- Login, portals, the design system route and the public site are Phase 1 and later.

## Phase 1 — Design system and public site (done)

### Built
- Tokens from the UI spec in `app/globals.css` (`:root` variables plus `@theme inline` mappings), Plus Jakarta Sans, tabular figures, 44px buttons with 12px radius, 12px minimum badge text, soft purple pill nav.
- shadcn primitives restyled to the palette: button, input, label, badge, card, dialog, sheet, tabs, table, sonner toast, skeleton, textarea, separator. lucide icons replaced with Phosphor; `next-themes` removed (single light theme).
- Shared components: `MetricCard`, `StatusLabel` (dot plus label, danger text only), `StageTracker`, `ClockBar`, `PageHeader`, `EmptyState`, `Timeline`, `SegmentedControl`, and a sortable paginated `DataTable` with an empty state.
- Public routes, each its own page: `/`, `/how-it-works` (lifecycle, five routes, clocks, escalation ladder), `/roles` (five anchored sections), `/about` (problem, approach, safeguards, technology, data note), `/login` (split layout, demo account chips, password help dialog, inline validation).
- Hidden `/design-system` route showing every token and component, including working dialog, side sheet, tabs, toasts, segmented control and data table.
- Verification scripts: `apps/web/scripts/capture.mjs` (screenshots) and `scripts/check-text-size.mjs` (computed font-size audit). Playwright 1.64.1 is a dev dependency.

### Verified (commands and real output)
```
$ npm run build
✓ Compiled successfully, TypeScript OK
Routes: /, /about, /design-system, /how-it-works, /login, /roles, /_not-found

$ node scripts/check-text-size.mjs
Smallest computed font size: 12px ("Control Tower")
Text nodes below 11px: 0

$ grep -Rn "#[0-9a-fA-F]\{3,6\}" apps/web --include=*.tsx --include=*.css --include=*.ts --exclude-dir=node_modules --exclude-dir=.next | grep -v app/globals.css
(no matches: every colour literal is a token definition)

$ npx lighthouse http://localhost:3000 --only-categories=accessibility
/ accessibility: 100, no failing audits
/login accessibility: 100, no failing audits

$ npm run lint
(no output, no errors)
```
Screenshots at 1440 and 390 are in `docs/screens/phase1/` (12 files, five public pages plus the
design system). Lighthouse JSON reports are in `docs/lighthouse/`.

### Deviations and gaps
1. **Sign-in is not connected yet.** The form validates input and confirms which portal the
demonstration credentials belong to, but issues no session. Real authentication is Phase 2, as
the phase plan specifies "UI only". The page states this in the live region after submit.
2. **No Lottie animations.** The login panel uses a static composition built from tokens. Four
Lottie animations are planned for Phase 7; no LottieFiles assets were downloaded.
3. **Public figures are demonstration values** held in `lib/site-content.ts` and labelled
"Demo data". They are replaced by API aggregates in Phase 6.
4. The hero preview chart is hand-drawn SVG (tokens only); Recharts is introduced in Phase 6 with
the dashboards.
5. The map, role portals and app shell are later phases, so `/design-system` is the only
internal route today.

## Phase 2 — Data model, auth, roles and seed (done)

### Built
- **Schema:** 18 tables in `app/models.py` (regions, institutions, users, rule versions, applications,
  stage instances/history, reverts, EVC cases, experts, obligations, documents, notifications,
  escalations, holidays, audit events, system clock, summaries). Migration
  `alembic/versions/0828f4603958_initial_schema.py` creates all of them.
- **Authentication:** argon2 password hashing, PyJWT HS256 tokens (8 hour expiry), `POST /auth/login`,
  `POST /auth/logout`, `GET /auth/me`, `POST /auth/change-password`. Each response carries the role's
  portal path.
- **Authorisation:** `require_roles` dependency plus SQL-level scoping. Institution users see only their
  own institution; regional officers and EVC coordinators see only their region; bureau and admin see
  all regions. Cross-region filters return 403 and cross-scope reads return 404.
- **Endpoints:** institutions, applications (filters, search, paging, SLA state and stage age),
  dashboard overview, and a public summary used by the landing page.
- **Seed** (`python -m app.seed.seed`): 9 regions, 60 institutions with coordinates, 25 users (the five
  demo accounts plus officers, coordinators and extra institution/HQ users), 30 experts, 180 applications,
  155 open stage instances, 70 documents, 40 obligations, 48 notifications, 181 audit events and one
  published rule version. Every identifier is a `uuid5` of a fixed key, so reruns update instead of
  duplicating. The hero case is `AICTE/2026/001`, Axis Institute of Technology, Pune, in the EVC queue
  with a lease expiring in 32 days.
- **Web session:** `POST /api/session` exchanges credentials with the API and sets an httpOnly
  `ct_session` cookie on the web origin; `DELETE` clears it. `proxy.ts` guards every portal prefix and
  role layouts re-check the session server-side. Login now signs in for real and redirects each role to
  its own portal.
- **Portals:** app shell from the Hasmart reference (264px sidebar with active pill, 72px topbar with
  working search, role badge, sign out, mobile sheet). Pages: overview and applications for Institution,
  Regional, Bureau and Admin; EVC queue for the coordinator. Figures and tables are read from the API
  through the session token.
- **Landing data:** the outcomes strip and hero preview now read `/public/summary`; the hero chart uses
  Recharts (AreaChart, 2.5px stroke, 12 percent fill) instead of hand-drawn SVG. If the API is
  unreachable the page shows dashes with a note, never invented numbers.

### Verified (real output)
```
$ docker compose exec api pytest
16 passed

$ docker compose exec api python -m app.seed.seed   # run twice
regions 9, institutions 60, users 25, experts 30, applications 180,
stage_instances 155, documents 70, obligations 40, notifications 48,
audit_events 181, rule_versions 1        (identical on the second run)

$ node scripts/verify-portals.mjs
Signed-out portal access redirects to /login
Wrong password shows: Email or password is incorrect.
Institution signed in and landed on /institution/overview
Regional Officer signed in and landed on /regional/overview
EVC Coordinator signed in and landed on /evc/queue
Bureau Officer signed in and landed on /bureau/overview
Admin signed in and landed on /admin/overview
Landing shows live summary figures and the Recharts chart
All portal checks passed

$ npm run build     -> 19 routes, TypeScript OK
$ npm run lint      -> no errors
```
Portal screenshots (1440 and 390) are in `docs/screens/phase2/`.

### Deviations and gaps
1. **Lottie assets were not usable.** The `lottie/` folder provided contains 110 keyframe config files
   for animated weather SVG icons (meteocons): they have `targets` and `layers` describing CSS
   transforms, not the Lottie `v`/`assets`/`layers` animation format, and weather imagery does not fit
   an approval system. No animation was shipped rather than faking one. Real LottieFiles JSON exports
   are needed for the landing accent, login panel, empty state and signed-action confirmation.
2. **Demo emails use `@demo.controltower.in`** instead of `.local`, because the email validator rejects
   reserved domains. The five accounts and shared password are in `README.md`.
3. Portal pages show real scoped tables rather than the skeletons the phase plan mentions; the case
   workspace, actions and detail pages arrive in Phase 3, so rows are not clickable yet.
4. Table sorting and paging in the browser apply to the fetched page; server-side sort parameters exist
   but the UI does not expose every column yet.
5. Change-password is available in the API only; its settings screen is Phase 7.
6. Notifications, escalations and the demo clock are not wired yet (Phase 4); the seeded notifications
   are records, not sends.
7. The app shell lists only routes that exist, so there are no dead navigation links.
8. JWT secret defaults to a 40-character development value; production must set `JWT_SECRET`.

## Phase 3 — Rules, workflow and applications (done)

### Built
- Rule engine reading a published `rule_versions` row: routes per application type, stage targets,
  required documents, revert categories and the escalation ladder. Default published version seeded
  as "APH rules (demonstration) v1"; clause text stays `"To be mapped from APH 2024-27"`.
- Workflow engine (`workflow.py`): create, submit with auto-routing, revert with structured reason and
  locked fields, resubmit to the officer who raised it, clear scrutiny, approve with undertakings.
  Every transition closes the open stage instance, opens the next one with a working-day target,
  writes `stage_history` and appends to the hash-chained audit log.
- Signed actions: `POST /sign` verifies the password and issues a 5-minute token that the decision
  endpoints require through `X-Sign-Token`. Nothing statutory happens without it.
- Application wizard (4 steps: type and year, documents, review, submit), document upload that stores
  the file with its sha256, server-side sorting, paging and filtering, and the case workspace with
  stage tracker, dual clocks ("Why this case is delayed"), timeline, signed action dialogs and the
  audit trail for the case.

### Verified (real output)
```
$ docker compose exec -T api pytest
41 passed

$ node scripts/verify-workflow.mjs
created case: http://localhost:3000/institution/applications/53db3759-...
documents attached: 2
revert recorded
resubmission recorded
scrutiny cleared, stage now: EVC queue
audit: Chain verified. 529 events intact.

$ npm run build    -> TypeScript OK, every portal route compiles
$ npm run lint     -> no errors
```
Screens in `docs/screens/phase3/`: wizard (3), case workspace before and after scrutiny, demo clock,
notification drawer, audit trail, escalations, landing and login at 1440.

### Gaps carried into Phase 5+
1. Sorting is exposed for the columns a user needs (institution, application number, stage, status,
   type, target date); the browser still re-sorts the fetched page for the rest.
2. The case workspace shows case-level summary text from a deterministic template; the optional LLM
   wording is not wired (no `GEMINI_API_KEY` supplied).

## Phase 4 — Deadlines, notifications and escalation (done)

### Built
- `deadlines.py`: working-day arithmetic that skips weekends and the seeded holiday calendar, with a
  never-zero floor.
- `monitor.py` runs seven checks per tick behind a Postgres advisory lock: stage warning at 80 percent
  of the target, stage overdue, revert deadline missed, EVC waiting too long, document expiry
  reminders, undertaking due and overdue. Every check only raises notifications and escalations.
- `notify.py`: template registry, per-user channel preferences, in-app rows, real SMTP delivery to
  Mailpit and a simulated SMS adapter. Delivery keys are unique per entity and trigger, so repeated
  ticks never duplicate a message.
- `escalation.py`: ladder read from the rule configuration, one row per entity and level, advanced
  when the previous level goes unacknowledged, with the recipient resolved by role and region.
- Demo clock (`system_clock` offset) with top-bar control: +1, +7, +30 days, run checks now, reset.
  Reset clears scheduler and escalation rows and returns the demonstration to its seeded baseline.
- Notification drawer in the top bar and notification pages with channel and unread filters,
  escalation pages with acknowledge, and the "Why this case is delayed" panel driven by real rows.

### Verified (real output)
```
$ docker compose exec -T api python scripts/scenario_deadlines.py
1. clock reset        now=2026-11-01T10:46 offset=0s
2. case under watch   AICTE/2026/195  Axis Institute of Technology  stage=scrutiny
   stage window 9.0 days
3.1 +8 days (day 8)  clock=2026-11-09 stage age=8.0d checks={'stage_warnings': 8, 'stage_overdue': 162, ...}
   notifications=2 ['stage_warning/email', 'stage_warning/in_app']
   escalations=[]
3.2 +2 days (day 10) clock=2026-11-11 stage age=10.0d
   notifications=4 ['stage_overdue/email', 'stage_overdue/in_app', 'stage_warning/email', 'stage_warning/in_app']
   escalations=[(1, 'b8034740')]
3.3 +4 days (day 14) clock=2026-11-15 stage age=14.0d checks={'escalations_advanced': 170, ...}
   escalations=[(2, '54e3db90'), (1, 'b8034740')]
   stored rows agree with the clock: stage age 14.0 days
4. mailpit inbox      1052 messages

$ docker compose exec -T api pytest tests/test_monitor.py tests/test_deadlines.py
passed (tick idempotency, one escalation per level, channel preferences, clock reset)
```
The clock was reset to zero after the run, so the demonstration starts on 1 November 2026.

### Deviations and gaps
1. The four animations are driven by the supplied keyframe JSON files (`arrows`, `clouds`, `compass`,
   `wind-lines`) through a small renderer that converts them to CSS keyframes and honours
   `prefers-reduced-motion`. They are not Lottie files: the provided JSON describes CSS transforms, so
   the renderer consumes them as written rather than pretending they are Lottie.
2. SMS is simulated in-app only; no SMS gateway is configured (none was requested).
3. Mailpit holds every message the scenario generated. `make demo-reset` still has to clear it in
   Phase 8.

## Phase 5 — EVC, undertakings and documents (done)

### Built
- EVC module: region-scoped queue with priority and waiting time, expert pool, scheduling that refuses
  an expert who lives in the institution's district (with the reason shown in the UI), and a signed
  visit outcome that closes the EVC stage and moves the case to SAC/SHC or approval.
- Undertakings module: scoped register with due dates and evidence state, evidence upload by the
  institution, and officer decisions that require a password signature — verify, or mark deficient
  with a written reason. A verified undertaking cannot be silently reversed by the same action.
- Document register: officer confirmation of issue and expiry dates (the expiry clock only starts
  after a signature), and institution renewals that keep the version chain (`parent_id`, version + 1).
  Expiry reminders already fire from the monitor.
- Navigation, pages and empty/error states for institution, regional, bureau and admin roles.

### Verified (real output)
```
$ docker compose exec -T api pytest
41 passed   (includes test_evc.py and test_obligations_documents.py:
             district conflict rejected with reason, schedule then signed completion,
             queue hidden from institutions, evidence required before verification,
             signature required, renewal chain versions 2 and 3, cross-role refusals)

$ node scripts/verify-evc.mjs
experts disabled by the district rule: 3
visit scheduled
visit recorded
evidence uploaded
renewal uploaded
undertaking verified
document dates confirmed

$ npm run build  -> TypeScript OK, 46 routes
$ npm run lint   -> no errors
```
Screens in `docs/screens/phase5/`: EVC queue, schedule dialog with the district rule, upcoming visits,
undertakings for institution, officer and bureau, document register for institution and officer.

### Deviations and gaps
1. The EVC calendar is a month-style "upcoming visits" list (earliest first) rather than a grid; the
   phase plan allows cutting the week view.
2. OCR suggestions for expiry dates are not implemented; the officer types the dates after reading the
   document. The field `ocr_suggestion` exists on the model for Phase 6/7.
3. Requirement changes are still made in seed data or SQL; Rule Studio is Phase 7.
