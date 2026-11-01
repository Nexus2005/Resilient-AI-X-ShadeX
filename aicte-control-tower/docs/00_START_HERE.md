# 00. START HERE (read fully before writing any code)

## 1. What you are building
**AICTE Control Tower**: one working web platform that automates AICTE approval workflow, monitors institutional compliance (undertakings, lease and document expiry), and raises alerts and escalations. It is for Institutional Regulatory Compliance Platform, framework: *Autonomous Institutional Approval Workflow Automation, Compliance Monitoring and Alert Management System*.

It must look and behave like a finished product made by a design agency, not a template, not a student demo.

## 2. The single most important rule
**Alerts, routing and recommendations assist officials. They never approve, reject, penalise or block anyone automatically.** Every statutory decision is made by a human, signed in the UI ("Sign and record"), and written to the audit trail. If a feature would act on its own against an institution, do not build it. Flag it instead.

## 3. What "done" means
A judge can log in as each role and, without anyone touching the database, watch **one case travel the full lifecycle**:
submit → auto-routed → scrutiny → revert and resubmit → EVC queue → EVC scheduled and completed → approved with undertakings → lease nears expiry → reminders fire → deadline missed → escalation up the ladder → renewal uploaded → verified → closed. Every step is in the audit trail, and dashboards and the India map update.

## 4. Files, in reading order
| File | Purpose |
|---|---|
| `01_PRODUCT_SCOPE.md` | Roles, features in and out of scope, demo story, acceptance tests |
| `02_ARCHITECTURE.md` | Stack, folder layout, data model, engines, API list |
| `03_REPOS_AND_APIS.md` | What to clone, what NOT to use, API keys needed |
| `04_UI_UX_SPEC.md` | Theme, pages, components, charts, map, icons. **Binding.** |
| `05_PHASE_PLAN.md` | Phase by phase tasks, outputs, verification gates |

## 5. Reference images
Copy the user's uploaded images into `docs/reference-ui/` and name them as in `04_UI_UX_SPEC.md` section 2. Open and study them before building any page. The purple landing page (TNDP) is the main style reference.

## 6. Working rules (anti-hallucination)
1. **Work one phase at a time.** Do not start phase N+1 until every gate in phase N passes. Print the real command output as proof.
2. **Never invent.** No invented APH clause numbers, AICTE statistics, API endpoints, package names or function signatures. Before installing any package run `npm view <pkg> version` or `pip index versions <pkg>`. If you are unsure, say so and ask.
3. **Rules come from configuration, not memory.** APH rule text is entered as seed config with a field `aph_reference` that reads `"To be mapped from APH 2024-27"` unless the user supplies the real clause.
4. **No fake data pretending to be real.** All seed data is fictional and the UI shows a small "Demo data" marker in the footer of the app shell only.
5. **No dummy features.** Every button, filter, setting and form must work end to end or be removed. No "coming soon", no lorem ipsum, no placeholder charts.
6. **Pin versions** in `package.json` and `requirements.txt`. Use TypeScript strict mode and Python type hints.
7. **Server-side permission checks** on every endpoint. Hiding a button is not security.
8. **Keep a `PROGRESS.md`** at the repo root: after each phase list what was built, what was verified (with commands), and known gaps. Be honest about gaps.
9. **Commit after each phase** with message `phase-N: <summary>`.
10. **Ask before large deviations** from these files. Prefer the simplest thing that works.
11. **Text sizes.** Nothing smaller than 12px for normal text and nothing smaller than 11px anywhere. Body 15px. See the UI spec.
12. **No emoji anywhere** in the UI, seed data or notifications.

## 7. Paste this as your first message to the agent
> Read `00_START_HERE.md` through `05_PHASE_PLAN.md` in `/docs`. Summarise back in under 200 words what you will build, the five roles, and the phase list. List any ambiguity as questions. Do not write code until I confirm. Then execute Phase 0 only.
