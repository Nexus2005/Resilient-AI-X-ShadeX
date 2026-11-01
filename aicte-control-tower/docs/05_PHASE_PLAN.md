# 05. Phase plan

Rules: one phase at a time. A phase is finished only when **every gate passes with real command output shown**. Update `PROGRESS.md` and commit after each phase.
Time boxes assume a team using AI agents full time. Adjust to your remaining days but keep the order.

## Phase 0. Setup (about 2 hours)
**Build**
- Create repo layout from `02_ARCHITECTURE.md`. Clone the FastAPI template backend only (see `03`). Init Next.js, Tailwind, shadcn.
- `docker-compose.yml` with db, api, scheduler, web, mailpit. `.env.example`. `Makefile` with `up`, `seed`, `verify`.
- Copy reference images to `docs/reference-ui/`.

**Gates**
- `docker compose up --build` starts all services without errors.
- `GET /api/v1/health` returns ok. Web shows a blank themed page. Mailpit opens.

**Output:** running skeleton, `PROGRESS.md` created.

## Phase 1. Design system and public site (about 1 day)
**Build**
- Tokens, Plus Jakarta Sans, Tailwind theme, shadcn components restyled to our palette.
- Shared components: button, input, card, metric card, badge, table, tabs, modal, side sheet, toast, skeleton, empty state, stage tracker, clock bar, status label.
- Routes: `/`, `/how-it-works`, `/roles`, `/about`, `/login` (UI only, login can call a stub).
- A `/design-system` route (hidden from nav) showing every component, for review.

**Gates**
- Screenshots of all five public pages at 1440 and 390 widths saved to `docs/screens/phase1/`.
- Grep proves no colour outside the token set: `grep -R "#[0-9a-fA-F]\{3,6\}" apps/web --include=*.tsx --include=*.css` shows only token definitions.
- No text below 11px (scripted check on computed styles via Playwright).
- Lighthouse accessibility 90 or more on `/` and `/login`.

**Output:** a landing page that is visually close to the TNDP reference, in our purple palette.

## Phase 2. Data model, auth and roles (about 1 day)
**Build**
- Alembic migrations for all tables in section 4 of the architecture.
- Auth: login, logout, me, change password. Role guard dependencies. Region and institution row filters.
- Seed script: regions, institutions (with lat/lng), users for each role, experts, about 180 applications in mixed stages, obligations, documents, the hero case.
- Frontend: working login, role-based redirect, guarded route groups, empty app shell for each role (sidebar and topbar done, pages show skeletons).

**Gates**
- `pytest` passes: auth, role guards (Institution cannot read another institution, Regional Officer cannot read another region).
- `make seed` is repeatable (run twice, no duplicates).
- Log in with all five demo accounts and land on the right portal. Wrong password shows a clear error.

## Phase 3. Rules, workflow and applications (about 1.5 days)
**Build**
- `rule_versions` with default published version. Engines: `rules.py`, `workflow.py`, transition table, signed actions (`/sign`).
- Application wizard (4 steps), document upload (store file, sha256), submit, auto-route.
- Case workspace page: stage tracker, timeline, tabs, actions (clear, revert, resubmit). Revert form with structured reason and locked and unlocked fields.
- Audit events with hash chain written on every transition.

**Gates**
- Unit tests for all routes: Only Scrutiny, Scrutiny + EVC, EVC + SAC/SHC, Only EVC, full chain.
- Integration test: acceptance tests 1 to 3 pass through the API.
- Manual: Institution submits, Officer reverts, Institution resubmits, case returns to the same officer. Screens captured.
- `GET /audit/verify` returns valid. Modify one row by SQL, verify returns the broken row.

## Phase 4. Deadlines, notifications and escalation (about 1.5 days)
**Build**
- `deadlines.py` (working days, holidays, pause, status). `notify.py` with templates, preferences, email via SMTP, simulated SMS, in-app.
- Scheduler tick with all seven checks (architecture 5.4). Demo clock endpoints and top-bar control.
- Notification drawer and page, escalations page with acknowledge.
- Dual clocks and "Why is this delayed?" panel using real data.

**Gates**
- Unit tests: working-day maths across a holiday, threshold at exactly 80 and 100 percent, idempotency (run tick 5 times, one notification).
- Scripted scenario: create case, advance demo clock +6 days (warning), +8 days (overdue, escalation level 1), +11 days (level 2). Show DB rows and emails in Mailpit.
- Turning off email in user preferences stops emails for that user but keeps in-app.

## Phase 5. EVC, obligations and documents (about 1.5 days)
**Build**
- EVC queue auto-injection, priority, expert panel with conflict check, schedule, complete, report upload, calendar view.
- Approval with undertakings (Bureau signed action) creating obligations. Obligation states, submit, verify, deficient.
- Document register, upload, OCR suggestion, confirm dates, renewal chain, reminders at configured offsets.

**Gates**
- Conflict check test: expert with same home district is rejected with reason.
- OCR test on three provided sample PDFs: suggested expiry date correct on at least 2 of 3, human confirm required before clock starts.
- Acceptance tests 4 to 9 pass in the API integration suite.
- Obligation cannot move to Verified without an officer action.

## Phase 6. Dashboards, India map, reports, summary (about 1.5 days)
**Build**
- Dashboards for Institution, Regional, Bureau using analytics endpoints (SQL views or aggregate queries).
- India choropleth with metric switcher, legend, detail drawer, regional markers.
- Reports with filters and CSV and PDF export. Case summary PDF (template, optional LLM).
- Audit page with filters and "Verify chain" button.

**Gates**
- Numbers on dashboards equal SQL counts (a test compares the API to direct queries).
- Map renders the official boundary, correct at 1440 and 1280 widths. Screenshot reviewed.
- Each report downloads as CSV and PDF with correct filters applied.
- Bureau page loads in under 2 seconds on seed data.

## Phase 7. Admin, settings and polish (about 1 day)
**Build**
- Rule Studio with draft, test panel, publish with effective date, diff. Users and roles management. Templates editor. Holiday calendar. Integrations page (planned items disabled). Demo page.
- Settings tabs for all roles that really save and take effect.
- Empty, loading and error states everywhere. Lottie animations (four). Responsive pass.

**Gates**
- Acceptance test 11 passes: publish new rule version, new case uses 5 days, old case unchanged.
- Visual review against reference images: spacing, softness, colour discipline. Checklist in UI spec section 13 completed per page.
- Playwright smoke: each role logs in and visits each of its pages with no console errors.

## Phase 8. Hardening, demo and deployment (about 1 day)
**Build**
- Security pass (CSRF, rate limit, upload checks, headers). Backup and reset script that restores seed state in under a minute (`make demo-reset`).
- Deployment config, HTTPS, `.env` production sample. README with setup and deploy.
- Demo script document `docs/DEMO_SCRIPT.md`: 8 minute walk-through following acceptance tests, with login credentials and the clock jumps.
- Screenshots for the PPT saved to `docs/screens/final/`.

**Gates**
- `make verify` runs all unit, integration and Playwright tests green.
- Fresh machine test: clone, `docker compose up`, seed, run the full demo script with no manual database edits.
- Deployed URL works over HTTPS. Mailpit or SMTP shows live emails.

## What to cut if time runs out (in this order)
1. MapLibre street map (keep d3 India map).
2. LLM wording of summaries (keep the template).
3. Calendar week view (keep month view).
4. PDF export of reports (keep CSV).
5. Rule Studio diff view.
**Never cut:** audit chain, demo clock, escalation, document expiry flow, signed human decisions, themed UI.

## Final deliverables checklist
- Working deployed platform and local Docker build
- Seeded demo with the hero case
- `PROGRESS.md` with verified items and honest gaps
- `docs/DEMO_SCRIPT.md`
- Screenshots (final) for the PPT
- Test report (`make verify` output saved)
- README
