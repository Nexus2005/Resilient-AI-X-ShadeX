# Resilient AI X ShadeX

**Resilient AI X ShadeX** — evidence-first scrutiny for AICTE institutional applications (Enterprise Edition).

The platform ingests an application's documents, extracts structured fields with page/box
evidence, checks completeness and cross-document consistency, evaluates **versioned** regulatory
rules, flags duplicate or anomalous documents, and runs **simulated** issuing-authority
verification. Findings are queued for authorised human reviewers, who can confirm, dismiss,
request clarification or resolve them; scrutiny reports are exported as PDFs.

It assists scrutiny. It never issues a regulatory decision, and no finding is proof of fraud.

## Landing page & authentication

- **Landing page (`/`)** — product site built from the reference design: floating header with the
  `Resilient AI X ShadeX` brand and a single **Get Started** action (no nav links yet), hero with the
  neural-network artwork, product walkthrough video, intake problem/capability sections, interactive
  steps, use cases, FAQ accordion, access panel with demo accounts and footer. The supplied images
  and video are served from `frontend/public/landing/`.
- **Login (`/login`)** — split branding + sign-in card, demo-account shortcuts, returns to `/dashboard`
  after authentication. Every landing CTA routes here.

## Module 1 — Intelligent Application Intake Gateway

Implemented end to end. Module 1 assesses **intake readiness only**; it never calls an application
verified, fraud-free or compliant.

| Stage | What actually runs |
| --- | --- |
| Upload | Multiple files, drag-and-drop, real XHR progress. PDF / JPG / JPEG / PNG / ZIP. Signature checks (never extension or browser MIME), per-file and bundle size limits, encrypted-PDF rejection, safe ZIP extraction (traversal, symlinks, nested archives, entry count, decompression ratio and bomb limits). |
| Store | Private local storage with generated names, original filename preserved as metadata, SHA-256, size, detected format, ingest metadata, audit trail. Original bytes are never modified. |
| Normalize | Raster images get an EXIF-oriented, RGB, size-capped private derivative linked to the original version; PDFs are rendered on demand. Recorded in `document_derivatives`. |
| Extract | PyMuPDF page text and block boxes; RapidOCR fallback only when the text layer is insufficient. Page-level text source, confidence, characters and quality flags. |
| Classify | Explainable keyword/field rules with matched-cue evidence, rule version and confidence bands. Auto-accept ≥ 0.75, manual review 0.45–0.75, below that uncertain. Ambiguity is always queued, never silently accepted. |
| Analyse | Exact duplicates (SHA-256), visual duplicates (perceptual hash, Hamming distance), blank/low-confidence/rotated pages, page-numbering evidence for missing internal pages, unreadable documents, same-institution cross-application counts without exposing other tenants. |
| Reconcile | Versioned, provisional AICTE EoA checklist (`intake_checklists` / `intake_checklist_items`) producing satisfied / missing / unreadable / partial / needs review / duplicate / optional-missing outcomes with explanations and source reference. |
| Correct | Human classification correction records the original prediction, confidence, corrected type, reviewer, reason and timestamp; the correction becomes the effective type. |
| Manifest & report | Content-addressed (`sha256`) versioned intake manifest persisted in `intake_manifests`, plus downloadable JSON and PDF intake reports that distinguish processed, processed-with-warnings, needs-review, failed and missing evidence. |

### Module 1 API

All routes are under `/api/v1` and require a bearer token.

```
GET  /intake/config                     limits, thresholds, versions
GET  /intake/document-categories        intake document types
GET  /intake/application-categories     enabled application categories
GET  /intake/checklists                 configured checklists (versioned, provisional)
GET  /intake/applications               lightweight intake overview for visible applications
POST /applications/{id}/bundle          multi-file upload (files[]) with per-file results
POST /applications/{id}/intake/process  process all pending / failed documents
GET  /applications/{id}/intake          full intake state: documents, pages, analysis, checklist, readiness
GET  /applications/{id}/intake/status   lightweight processing status
POST /documents/{id}/intake/process     process one document (real per-file progress in the UI)
GET  /documents/{id}/intake             single document payload
GET  /documents/{id}/extractions        extracted fields, page text and source boxes
DELETE /documents/{id}                  remove a document from the bundle (soft delete, audited)
PATCH /fields/{id}                      save an extracted-field correction (original value kept)
POST /documents/{id}/classification     human classification correction
GET  /documents/{id}/pages/{n}/render   authorized page rendering of the stored original (PNG)
POST /applications/{id}/intake/complete enforce completion rules, generate the manifest and submit
POST /applications/{id}/manifest        generate / refresh the manifest (idempotent while content is unchanged)
GET  /applications/{id}/manifest        latest stored manifest
GET  /applications/{id}/intake/report?format=json|pdf  downloadable intake report
```

### Module 1 UI

| Route | Screen |
| --- | --- |
| `/dashboard` | Small application overview (in progress, documents to review, completed) |
| `/applications` | Application list with real checklist and intake status |
| `/applications/new` | Institution, category, academic year and generated title → straight into the workspace |
| `/intake/[id]` | Single document-first workspace: required checklist + uploaded files (left), the actual stored document rendered page by page with thumbnails, zoom and full screen (centre), extracted fields with source highlighting and type confirmation (right), then completion with manifest/report downloads |
| `/intake` | Redirects to `/applications` |

Navigation only lists screens that work: Dashboard, Applications and New application. Later modules are
not shown as if they exist.

### Verify Module 1

```bash
# backend unit tests (no database needed) — 74 tests
cd backend && .venv/Scripts/python -m pytest -q

# end-to-end API workflow (backend running on :8000)
cd backend && .venv/Scripts/python tools/e2e_intake.py

# headless-browser UI smoke (Chrome on :9222, frontend on :3000)
cd backend && .venv/Scripts/python tools/ui_smoke.py
```

The e2e script creates a synthetic application, uploads PDFs/PNG/ZIP plus a renamed executable, an
encrypted PDF and a traversal entry, processes every document, verifies classification, duplicates,
checklist outcomes, corrections, idempotent reprocessing, manifest hashing, JSON/PDF reports and
cross-tenant denial. It cleans up its previous run at start.

## What is implemented (platform)

| Area | Status |
| --- | --- |
| Auth (bcrypt + JWT sessions, RBAC: admin / reviewer / institution / auditor) | done |
| Institutions, applications, status history & workflow transitions | done |
| Upload validation (magic bytes, size limits, SHA-256, generated filenames) | done |
| PDF text layer + RapidOCR fallback with line boxes and confidence | done |
| Classification (keyword rules first, optional Gemini assist) and field extraction | done |
| Completeness, expiry and cross-document consistency findings with evidence | done |
| Immutable versioned rule engine (6 demo rules) | done |
| Exact-duplicate (SHA-256), near-duplicate (phash), PDF metadata forensics | done |
| Simulated verification adapters with explicit statuses | done |
| Reviewer actions, field corrections, PDF scrutiny reports | done |
| Audit trail with SHA-256 hash chain | done |
| Dashboard, applications, findings, rules, verification, reports, audit, users UI | done |
| Unit tests (`backend/tests`, 37 tests) | done |
| Multi-case seeded demo dataset (A–J) | partial |

## Stack

Next.js 14 (App Router, TypeScript, Tailwind) · FastAPI (Python 3.11, Pydantic v2,
SQLAlchemy 2) · Supabase PostgreSQL (31 tables) · PyMuPDF, RapidOCR, OpenCV, ImageHash,
RapidFuzz · ReportLab · Gemini (optional assist, graceful fallback).

## Repository layout

```
backend/            FastAPI app, services, SQL migrations, seed, tests
frontend/           Next.js app (login, dashboard, applications, findings, rules, ...)
docs/BLUEPRINT.md   Architecture and design principles
docs/PHASES.md      Build tracker (single source of truth for progress)
run_backend.ps1     Start API on :8000 (Windows)
run_frontend.ps1    Start UI on :3000
start_all.ps1       Start both and wait for health
```

## Getting started

### Backend

```bash
cd backend
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt    # Windows
# source .venv/bin/activate && pip install -r requirements.txt   # macOS / Linux

cp .env.example .env        # fill DATABASE_URL, SECRET_KEY, (optional) GEMINI_API_KEY
.venv/Scripts/python tools/run_migrations.py
.venv/Scripts/python -m app.seed      # ~40-60s, prints per-document progress, rules only (deterministic)
.venv/Scripts/python -m uvicorn app.main:app --port 8000
```

API docs: <http://127.0.0.1:8000/api/docs> · health: `/api/health`

### Frontend

```bash
cd frontend
npm install
npm run dev            # http://localhost:3000
```

Set `NEXT_PUBLIC_API_URL` if the API is not on `http://127.0.0.1:8000/api/v1`.

### Demo accounts

Open <http://localhost:3000> for the landing page, then **Get Started** to sign in.
All demo accounts use the password `Password123!`:

| Email | Role |
| --- | --- |
| `admin@resilient-ai.local` | admin |
| `reviewer@resilient-ai.local` | reviewer |
| `institution@resilient-ai.local` | institution |
| `auditor@resilient-ai.local` | auditor |

### Tests

Pure unit tests — no database or network access required:

```bash
cd backend
.venv/Scripts/python -m pytest -q     # 74 tests, including Module 1 intake
```

Integration scripts live in `backend/tools`: `e2e_intake.py` (HTTP, real database and storage) and
`ui_smoke.py` (headless Chrome, real client rendering).

## Optional AI assist

Gemini is optional and never required. The rules run first; if a rule decision is already
auto-accept confident, no network call is made. Repeated assist failures open a 5-minute circuit
breaker so a bad key or blocked network never turns into per-document timeouts. Seeding and tests
suppress the assist entirely (`gemini.suppress(True)`) for deterministic, offline-safe runs.

## Demo dataset

`app.seed` creates one synthetic application (`RAI-*`) with eight documents covering:
a valid fire NOC, an **expired** fire NOC, a typo'd institution name that produces a
**verification mismatch**, and two **byte-identical** lab photos that trigger the duplicate
detector. Re-running the seed rebuilds the documents and clears the findings derived from them.

## Honest boundaries

- **Module 1 scope.** Intake readiness only. No authenticity, fraud or compliance conclusion is drawn,
  and no application is described as verified.
- **Checklist configuration is provisional.** The AICTE EoA checklist ships with `is_provisional = true`
  and a source reference that says requirements have not yet been verified clause-by-clause against the
  applicable handbook; requirement wording and evidence formats must be confirmed before real use.
- **Classification is a rule engine, not a calibrated probability.** Confidence bands drive the review
  queue; they are not probabilities of authenticity.
- **Processing runs per document inside request scope.** No Redis/Celery is introduced: the UI processes
  documents sequentially so each step commits and progress is real. A bundle-wide job could be added if
  volumes outgrow this.
- **Encrypted PDFs are rejected with an explanation** and must be re-uploaded unlocked; there is no
  password-entry flow yet.
- **No live government integrations.** Verification providers are simulated and labelled
  `is_simulated` in the API, UI and reports. DigiLocker/issuer adapters are interfaces only.
- **Preliminary indicators.** Metadata, phash and duplicate signals are investigative aids,
  never proof of tampering or fraud.
- **Rules are demo rules.** Every seeded rule is marked `is_demo_rule` until verified against
  the applicable AICTE handbook clause.
- **Tamper-evident, not immutable.** The audit trail is an append-only hash chain with triggers;
  it is not a cryptographic ledger.
- Gemini is optional. With no API key the system runs fully deterministically.

See `docs/BLUEPRINT.md` for design principles and `docs/PHASES.md` for current progress.
