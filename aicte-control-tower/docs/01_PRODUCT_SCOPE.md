# 01. Product scope

## 1. Problem we solve (keep this wording in the app's About page)
AICTE approval and post-approval compliance are tracked as separate, passive records. Files stall without alarms, EVC scheduling needs manual chasing, and undertakings and lease expiry are tracked in spreadsheets.

**Our answer:** a rules-driven platform that routes each application by versioned APH rules, times every stage, schedules EVCs, tracks every undertaking and document expiry, and escalates overdue items to named owners, with a tamper-evident audit trail and humans making every decision.

## 2. Roles (five, all must log in and work)
| Role | Who | Sees | Main actions |
|---|---|---|---|
| **Institution** | College administrator | Only its own applications and obligations | Create application, upload documents, answer reverts, submit compliance evidence, upload lease renewals |
| **Regional Officer** | Officer of one AICTE region | Cases in own region | Scrutinise, revert, clear, assign EVC panel, verify evidence, acknowledge escalations |
| **EVC Coordinator** | Committee or visit coordinator | EVC queue of own region | Schedule visit, record completion, upload report |
| **Bureau Officer** | HQ approval bureau | All regions, read-mostly | Monitor, reassign workload, handle Level 2 escalations, sign approvals |
| **Admin** | Policy and system admin | Everything configurable | Manage users, publish rule versions, templates, holiday calendar, demo clock |

## 3. Features IN scope (build all, build them well)

### A. Workflow automation
- Application types: New Institution, Extension of Approval, Increase in Intake, Change of Site. (Admin can add more through rules.)
- Rule engine picks the route: **Only Scrutiny**, **Scrutiny + EVC**, **EVC + SAC/SHC**, **Only EVC**, **Scrutiny + EVC + SAC/SHC**.
- Stage auto-advance when the stage's required action is completed by an authorised person.
- **Revert** with structured reason (category, APH reference field, required evidence, resubmission deadline). Locked and unlocked fields on resubmit. Return goes back to the issuing officer.
- **Case summary**: one-page generated summary of a case (history, deficiencies, EVC result, obligations). Deterministic template first; optional LLM wording on top.

### B. Dashboards and pendency
- Role dashboards (Institution, Regional, Bureau).
- Two clocks per case: total age and stage age, against the stage target.
- Workload per officer, bottleneck by stage and region, pendency by region on an **India map**.
- "Why is this delayed?" panel on every case: what is pending, since when, owner, rule, consequence, next permitted action.

### C. EVC
- Auto-queue when a case becomes eligible. Priority order (new institutions and nearest deadline first).
- Expert panel assignment with **conflict-of-interest check** (same district, same institution, past employment list).
- Schedule, complete, upload report. Calendar view.
- Alerts when not scheduled or not completed in target time.

### D. Undertakings and compliance
- On approval, officer adds conditions. Each becomes an obligation: condition, source reference, evidence required, due date, owner, state.
- States: Not yet due, Due soon, Submitted, Under verification, Verified, Deficient, Overdue, Closed. **Submitted never means verified.**
- Institution uploads evidence. Officer verifies or marks deficient with reason.

### E. Lease and document validity
- Document register with type, issue date, expiry date, version history.
- On upload, OCR **suggests** dates. A person must confirm before they count.
- Reminders at configurable offsets (default 90, 60, 30, 7 days before, then on expiry, then escalation).
- Renewal upload links to the previous version and enters a verification queue.

### F. Notifications, escalation, reporting
- One notification service with templates and channels: **in-app** (real), **email** (real via SMTP, Mailpit locally), **SMS** (adapter, simulated unless a key is given).
- Every send is logged with trigger, recipient, channel, result.
- Escalation ladder (configurable): Owner, then Regional Officer (+24h), then Bureau Head (+72h), then Member Secretary view.
- Reports with filters, on screen and as CSV and PDF export: pendency, EVC status, undertakings, document validity, overdue, region performance.
- Audit trail: append-only, hash-chained, with an "Verify chain" button.

### G. Settings that really work
- Profile and password.
- Notification preferences per user (channels on or off, daily digest on or off). The notification service must respect them.
- Admin: users and roles, rule versions (draft, test, publish with effective date), message templates, holiday calendar, reminder offsets, escalation delays.

### H. Demo tools (visible only when `DEMO_MODE=true`)
- **Demo clock** in the top bar: jump +1 day, +7 days, +30 days, reset. Scheduler uses this clock so judges see reminders and escalations fire live.
- Demo account chips on the login page.

## 4. Out of scope (do NOT build)
Student ERP, fee collection, faculty payroll, attendance, payments, blockchain, computer-vision lab counting, image forensics, auto-approval or auto-penalty, chatbots, social features, real DigiLocker or NSWS integration (show them as disabled "Planned integration" items in Settings, nothing else).

> Note: "student ERP" is not part of this problem. The "students" in the user's brief means the **Institution** role. The India map shows **institutions and applications**, not student records.

## 5. Seed data (fictional, realistic)
- 9 regional offices (configurable list), about 60 institutions across all states, about 180 applications in mixed stages, 40 obligations, 70 documents, 30 experts, 25 users.
- Names must sound real and varied across India. Mark everything as demo in one place only (app footer).
- Include **one hero case**: *Axis Institute of Technology, Pune*, Scrutiny + EVC, currently in EVC queue, one lease expiring in about 32 days. The demo story runs on this case.

## 6. Acceptance tests (the judge's path, must all pass)
1. Log in as Institution, create an application, upload documents, submit. Route is shown automatically.
2. Log in as Regional Officer, open the case, revert with structured reason. Institution sees locked and unlocked fields, fixes, resubmits. Case returns to the same officer.
3. Officer clears scrutiny. Case enters EVC queue with a stage clock.
4. EVC Coordinator assigns panel (a conflicted expert is rejected with a reason), schedules, completes with report.
5. Bureau Officer signs approval with two undertakings. Obligations appear for the institution.
6. Institution uploads a lease PDF. OCR suggests an expiry date. Institution confirms.
7. Admin advances demo clock +30 days: T-30 reminder is created in-app and emailed (visible in Mailpit).
8. Advance past due date: status flips to Overdue, escalation Level 1 goes to Regional Officer, then Level 2 to Bureau.
9. Institution uploads renewal. Officer verifies. Obligation closes.
10. Audit trail shows every step in order. "Verify chain" passes. Editing a row directly in the database makes it fail.
11. Admin publishes a new rule version changing Scrutiny target from 7 to 5 days. New cases use it. Old cases keep their version.
12. Bureau dashboard and India map reflect the above.
