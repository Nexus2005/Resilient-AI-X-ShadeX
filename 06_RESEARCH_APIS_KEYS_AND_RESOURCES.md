# 06. Research findings: maps, AI keys, database, hosting, government APIs, UI resources

**Status:** this file **overrides** `03_REPOS_AND_APIS.md` wherever they differ (map data row in section 2, LLM row in section 4, deployment in section 7). Findings are from public sources checked on 1 Nov 2026. Free-tier limits change often: the agent must confirm numbers in the provider dashboard before relying on them.

## 1. India map data (official boundary matters)

| Source | What it gives | Licence / caveat | Verdict |
|---|---|---|---|
| `VTIITI/India-State-and-Country-Shapefile-Updated-Jan-2020` | Two shapefiles: India boundary "as per Survey of India records" and a state boundary file with 28 states + 9 UTs, updated for the 2019-20 changes (J&K and Ladakh as separate UTs, merged Dadra & Nagar Haveli and Daman & Diu) | Author says free for personal use. Licence is informal: fine for a hackathon, flag it in the About page | **Primary choice** (both outlines from one repo) |
| `udit-001/india-maps-data` | GeoJSON and TopoJSON per state and UT including Ladakh and J&K, plus a whole-country map | Owner disclaims liability for misrepresentation | **Fallback**, also good for state-level district drill-down |
| `datameet/maps` | Community maps, includes an official external boundary from Survey of India converted to GeoJSON | CC BY 2.5 India. Community says SOI licence for the external boundary is still unclear. Some older state files have outdated borders | Use only for the external boundary overlay if the primary lacks it |
| `Tanmay53/india-state-boundries-geojson`, `Subhash9325/GeoJson-Data-of-Indian-States` | Ready-made state GeoJSON | Apache 2.0 for Tanmay53. Check dates and J&K handling | Not preferred: verify boundary before use |

**Agent procedure:** download the VTIITI shapefiles, convert with `mapshaper` (simplify to under 300 KB, output `public/geo/india-states.json` and `india-outline.json`), render, and **visually check** J&K, Ladakh and Arunachal Pradesh against the Survey of India outline. Add an attribution line on the map page. No API key is needed for any of this. Our map is built with d3-geo, so tiles are not required.

## 2. AI model keys, by use case

You mentioned "Gemini 2.7". I could not find a model with that name. The sources I read (October 2026) list these as the free-tier models:

| Model ID (confirm in AI Studio) | Free-tier note from sources | Use for |
|---|---|---|
| `gemini-3.5-flash-lite` | about 500 requests per day, 10 per minute | **Default**: case-summary wording, notification text polish |
| `gemini-3.8-flash` | about 20 requests per day, 5 per minute | Optional quality pass, rarely |
| `gemini-3.6-flash`, `gemini-3.1-flash-lite` | free, similar small quotas | Fallbacks |
| Gemma 4 (`gemma-4-31b-it`) | free | Optional fallback |
| `gemini-4-argon` | **no free tier** | Do not use |

Rules for the agent:
1. Read the real limits at `aistudio.google.com/rate-limit`. Third-party blogs disagree with each other and Google no longer prints a single table.
2. **Free-tier prompts may be used by Google to improve its products.** Send only synthetic demo data. Never real institution documents.
3. Put every LLM call behind one function `summarise(facts_json) -> text` with a **deterministic template fallback**. If the key is missing, rate-limited or fails, the template output is shown and labelled "Template".
4. Cache summaries per case version so one case never calls the model twice.
5. Env: `LLM_PROVIDER=gemini`, `LLM_MODEL=gemini-3.5-flash-lite`, `GEMINI_API_KEY=...` (get it from Google AI Studio). Keep a `deepseek` adapter as a second option (OpenAI-compatible endpoint).

| Use case | Tool | Key? |
|---|---|---|
| Case summary wording | Gemini Flash-Lite | Yes (free) |
| Lease and document date extraction | PaddleOCR or Tesseract + `dateparser`, fully local | No |
| Low-confidence date fallback (optional, synthetic files only) | Gemini vision | Same key |
| Delay-risk estimate | Transparent formula in code | No |
| Rule question answering (APH assistant) | **Skip for the prototype** | n/a |

## 3. Database: should you use Supabase?
**No, not as the application backend.** Our FastAPI backend already owns auth, role checks and the audit chain. Supabase would duplicate auth and its Row-Level Security would sit beside our service-layer filters, adding confusion.

Why the free tier is risky for this project:
- Free projects **auto-pause after 7 days of inactivity**. Judging can happen weeks after submission, and a paused database means a dead demo.
- 500 MB database, 2 projects.

**Recommended:** PostgreSQL 16 in Docker (same image in dev and production). If you want a managed database, use **Neon** (free tier, scales to zero without pausing the project) but note the app needs an always-on scheduler elsewhere. Supabase is acceptable only as a plain hosted Postgres if you upgrade to a paid plan.

## 4. Hosting (the scheduler must stay awake)
Free platforms fail the always-on need:
- Render free web services sleep after 15 minutes and free Postgres expires after 30 days.
- Fly.io has no free allowance now. Railway gives only a short trial credit.

**Recommended deployment**
1. **Web:** Vercel free plan (fine for a hackathon; the free plan disallows commercial use).
2. **API + scheduler + Postgres + Mailpit/SMTP:** one small always-on VPS running `docker compose`, with Caddy for HTTPS.
3. Keep a recorded demo video as a backup in case the network fails on judging day.

## 5. Government and private APIs: what to use and what to simulate

| Service | Can we use it in the prototype? | What to do |
|---|---|---|
| **DigiLocker (via API Setu)** | **No.** Sources state there is no published sandbox or separate test environment. Access needs organisation onboarding through API Setu with an official email domain, verification by NeGD, user consent for every fetch, and a rule not to cache or store documents beyond the permitted period | Build a `MockDigiLocker` adapter behind the same interface, labelled "Simulated" in the UI. Show the real integration in Admin > Integrations as "Planned, needs AICTE onboarding" |
| **NSWS** | No public API for third parties found | Simulated application feed from a seed script. Mention as planned integration |
| **AICTE internal portal data** | Needs AICTE or NIC to provide access | Seed data in the same schema. Design an `ApplicationFeed` adapter |
| **SMS in India** | **DLT registration is mandatory**: registered entity, sender ID and approved templates (approval takes about 24 to 48 hours). Providers such as MSG91 and Fast2SMS require it | Use the `SimulatedSms` adapter. Show the message in the notification log. Do not spend time on real SMS |
| **Email** | Yes, no registration needed | Mailpit for the demo. Optional: any SMTP or Brevo/Resend key |
| **e-Sign** | Real e-Sign needs an authorised service provider | Our "Sign and record" uses password re-entry and stores a signed hash. Label it "Simulated e-sign" |
| **Aadhaar** | Never needed. Do not collect or store Aadhaar numbers | n/a |

**Keys you personally need to create for the prototype**
1. `GEMINI_API_KEY` (Google AI Studio, free). Everything else works without a key.
2. Optional: SMTP credentials for live email, a `DEEPSEEK_API_KEY` as backup LLM.
3. Optional: `NEXT_PUBLIC_MAPTILER_KEY` only if you add a street-level map.

## 6. Government design standards to align with
- **GIGW 3.0** (Guidelines for Indian Government Websites and Apps, NIC/MeitY): conforms to **WCAG 2.1 Level AA**, covers quality, accessibility and security, and expects multilingual content. We are a prototype, not a certified site, but aligning earns credibility.
- **UX4G Design System 3.0** (`ux4g.gov.in`, MeitY/NeGD): official component library, tokens, Figma kit and React docs, WCAG 2.1 AA, designed for low-bandwidth and multilingual use. **Do not copy its look** (you want the purple agency style). Borrow its **patterns**: stepper, tables, form validation, error messages, accessibility widget idea.
- **National Emblem:** do not place the Ashoka emblem on the demo. Government sites must use it in the proper ratio and colour, and a prototype has no authority to. Use our own logo mark.
- Add to the PPT: "Built to WCAG 2.1 AA, aligned to GIGW 3.0 principles."
- Optional stretch: English and Hindi toggle for the landing page and navigation using `next-intl`.

## 7. UI resources (icons, animation, imagery)
- **Icons:** Phosphor (`@phosphor-icons/react`), one set only.
- **Lottie:** LottieFiles free animations are under the **Lottie Simple License**: commercial use allowed, attribution not required but encouraged, **you may not redistribute the files as standalone assets or compile them into a competing library**. Bundling inside our app is fine. Check the licence on each animation page. Pick 4 purple-compatible animations and recolour them in the LottieFiles editor to our palette. List creators in the About page credits.
- **Illustrations:** use flat purple-tone illustrations only for empty states. Do not use stock photos of people.
- **Landing references:** your TNDP purple page, Hasmart shell and datago map-with-drawer images (see `04_UI_UX_SPEC.md`). I did not research Dribbble, Behance or Mobbin for additional references, so treat those as optional.
- **Fonts:** Plus Jakarta Sans via `next/font/google`.

## 8. Updated clone list (final)
1. `fastapi/full-stack-fastapi-template` backend only.
2. shadcn/ui via CLI plus one dashboard starter used for layout ideas only (strip auth and colours).
3. `VTIITI/India-State-and-Country-Shapefile-Updated-Jan-2020` for map data (fallback `udit-001/india-maps-data`).
4. Nothing else. Do not clone Temporal, Paperless-ngx, Cal.com, Novu, ToolJet, Supabase.

Agent must open each repo first, confirm it exists, read the licence, and report back before cloning.
