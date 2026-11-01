# Resilient AI — Phase Tracker

Single source of truth for build progress. Statuses:
`completed` · `in_progress` · `pending` · `blocked`.

> Update this file whenever a phase is completed. Each entry links to what was built.

| # | Phase | Scope | Status | Evidence |
| --- | --- | --- | --- | --- |
| 0 | **Repo & schema** | Git structure, .gitignore, migrations 0001–0006 (31 tables), requirements.txt, venv with deps | completed | `backend/migrations/`, `backend/requirements.txt` |
| 1 | **Blueprint & tracking** | `docs/BLUEPRINT.md`, `docs/PHASES.md`, `README.md` | completed | `docs/` |
| 2 | **Foundation & auth** | FastAPI skeleton, config, SQLAlchemy models, bcrypt+JWT sessions, RBAC, audit hash chain wiring, institutions & applications CRUD, status history, seed data, run migrations | completed | `backend/app/` |
| 3 | **Document processing** | upload validation (magic bytes/limits/sha256), private storage, PyMuPDF text layers, RapidOCR for scans, pages with boxes+confidence, classification (rules+Gemini), field extraction, processing jobs | completed | `app/services/processing.py`, `extraction.py`, `storage.py` |
| 4 | **Completeness & consistency** | category checklists, missing/expired/unreadable checks, cross-document comparison limited to fields that must agree, evidence-linked findings | completed | `app/services/checks.py`, `rule_engine.py` |
| 5 | **Rule engine** | versioned rules (immutable versions), evaluation storage, rule management API/UI | completed | `app/services/rule_engine.py`, `frontend/app/(app)/rules` |
| 6 | **Authenticity & verification** | sha256 dupes, phash near-dupes, PDF metadata forensics, simulated verification adapters with explicit statuses and field-level comparison | completed | `app/services/anomaly.py`, `verification.py` |
| 7 | **Review workflows & reports** | findings queue, reviewer actions, field corrections, release-to-institution, PDF scrutiny reports | completed | `app/routers/workflow_routes.py`, `app/services/reports.py` |
| 8 | **Dashboard** | live statistics from persisted data | completed | `GET /api/v1/dashboard/summary`, `frontend/app/(app)/dashboard` |
| 9 | **Frontend** | Next.js + login + applications + upload + documents + findings + review + reports | completed | `frontend/app/(app)/` |
| 10 | **Testing & hardening** | pytest unit suites for storage security, auth tokens, extraction, rule evaluators, consistency scope, verification comparison, intake validation/ZIP safety/readiness | completed | `backend/tests/` (71 tests) |
| 11 | **Demo dataset breadth** | seeded cases A–J (only expired, duplicate, verification mismatch, healthy case exist today) | pending | `app/seed.py` |
| 12 | **Landing page** | Reference-design marketing site with supplied artwork/video, brand `Resilient AI X ShadeX`, Get Started → login, FAQ, access panel | completed | `frontend/app/page.tsx`, `frontend/public/landing/` |
| 13 | **Module 1 — Intake gateway** | upload/validate/store/normalize/extract/classify/analyse/checklist/correct/manifest/report, migration 0007, versioned provisional checklist | completed | `backend/app/services/intake.py`, `backend/app/routers/intake_routes.py`, `frontend/app/(app)/intake/` |
| 14 | **Module 2+** | AI analysis, fraud detection, compliance checks, reports, settings — shown disabled in navigation | pending | — |

## Module 1 verification (2026-10-29)

- `pytest -q` → 71 passed (new `tests/test_intake.py`: signatures, oversized/malformed/encrypted files,
  ZIP traversal/symlink/nested/entry-count/bomb, bundle limits, classification thresholds, page evidence,
  readiness, report helpers).
- `tools/e2e_intake.py` → all checks passed against the live API: 11 documents processed, 11 pages,
  encrypted PDF + renamed executable + ZIP traversal rejected, extension mismatch warned, exact duplicate
  detected, blank scan routed to review, checklist reconciled (5 satisfied, 1 duplicate, 1 needs review),
  human correction persisted, reprocessing idempotent, manifest idempotent and hashed, JSON/PDF reports
  generated, cross-tenant read denied (403).
- `tools/ui_smoke.py` → headless Chrome rendered dashboard, intake list, workspace, inventory, checklist
  and the authorized page preview with no console errors.
- Fixed a pre-existing blocker: applications created through the API had no `reference_no`.
- Migration runner is now ledger-based (`public.schema_migrations`) and no longer replays old migrations.

## Recent fixes (2026-10-29)

- `app.seed` no longer appears to hang: it prints per-document progress and suppresses the optional
  Gemini assist, cutting a 3m22s silent run to ~46s. Gemini now has a circuit breaker after two
  consecutive failures and is skipped when the rule classifier is already decisive.

- Frontend production build repaired (report fields, missing imports, unused imports); `npm run build` passes.
- Reprocessing a document no longer fails on the `document_pages` uniqueness constraint.
- Date extraction no longer lets a generic "Issued on" pattern overwrite an expiry date, which
  previously marked a valid fire NOC as expired.
- Source verification now compares real extracted fields against reference data and reports
  `manual_review_required` when a field cannot be compared instead of silently "verified".
- Cross-document consistency is restricted to institution-level fields; document-specific
  numbers/dates/issuers are no longer reported as conflicts.
- Seed now generates a genuine byte-identical duplicate pair and clears derived findings on reseed.

## Credentials & integration notes

- Supabase project: `spnnwmlkanpwwdqutitr.supabase.co` (Postgres direct; Anon/Service keys not provisioned — backend uses direct connection + in-code authorization).
- Gemini: API key stored in `backend/.env` (`GEMINI_API_KEY`). All Gemini use is **optional assist** with graceful fallback; model id is env-configurable (`GEMINI_MODEL`, default `gemini-2.5-flash`).
- GitHub: `https://github.com/Nexus2005/ShadeX-SIH2026.git` (branch `main`).
- DigiLocker / issuing-authority / AICTE records integrations: **not authorized** — adapter interfaces only, simulated data clearly labelled.

## Known boundaries (do not misrepresent)

- No live government integrations. Simulated verification is labelled in UI, API and reports.
- Metadata/ELA/phash findings are **preliminary indicators**, never proof of fraud.
- Audit trail is tamper-evident (hash chain + triggers), not cryptographically immutable.
- Demo rules must remain labelled until verified against the official AICTE handbook.
- Tests are unit-level and database-free; there is no HTTP integration suite yet.
