# 04. UI and UX specification (binding)

The product must look like it was made by a design agency for a government technology programme: calm, premium, purple, spacious, consistent. **It must not look AI-generated.**

## 1. Hard bans
- No emoji, anywhere (UI, seed data, emails, toasts).
- No yellow, orange or green filled boxes, badges or chart colours. No traffic-light colour blocks behind text.
- No gradient rainbow, no neon, no glassmorphism overload, no dark-blue "bootstrap admin" sidebar, no orange-and-black cards.
- No lorem ipsum, fake testimonials, fake partner logos, invented statistics, or "coming soon" tiles.
- No explanatory paragraph under every heading. One short line at most, only when it helps.
- No everything-on-one-page. Every section below is its own route.
- No stock "hero with three feature cards then footer" template. Follow the landing structure in section 5.

## 2. Reference images (copy into `docs/reference-ui/` with these names and study them)
| Name | Use it for |
|---|---|
| `ref-landing-tndp.webp` (purple "National Digital Playbook") | **Primary reference.** Landing page: pill navigation, centred hero, soft lavender background, floating dashboard preview card, rounded cards, purple buttons |
| `ref-app-hasmart.webp` | App shell: soft rounded cards, light tinted canvas, sidebar with pill-active item, generous spacing |
| `ref-dashboard-zentra.webp` | Analytics cards, large numbers, clean chart framing |
| `ref-dashboard-marketing.jpg` | White canvas, purple primary button, compact table and toolbar patterns |
| `ref-map-datago-1.webp`, `ref-map-datago-2.webp` | **Map with right-side detail drawer**, legend card bottom-left, floating search. Use for the India map page |
| `ref-gov-mygov.webp` | Government service grid, simple icon tiles (for the Institution home quick actions) |
| `ref-avoid-staradmin.jpg`, `ref-avoid-softui.jpg` | **Avoid**: loud blue sidebar, orange and black cards |
| `ref-avoid-nfip.webp` | Avoid: serif headings, heavy dark-blue band. Flat illustration style may inspire empty states only |

Map the uploaded files to these names by looking at each image. If unsure, ask.

## 3. Design tokens (one palette, used everywhere)
Define as CSS variables in `globals.css` and in `tailwind.config`. **Do not use any other colours.**

| Token | Value | Use |
|---|---|---|
| `--primary-900` | `#2A1A6E` | Headings on tint, chart darkest |
| `--primary-700` | `#4727C2` | Hover, pressed |
| `--primary-600` | `#5B35E5` | **Primary buttons, links, active nav, key chart series** |
| `--primary-400` | `#8B6CF0` | Chart series 2 |
| `--primary-200` | `#CBBDFA` | Chart series 3, map mid tone |
| `--primary-100` | `#E9E1FF` | Selected rows, soft badges |
| `--primary-50`  | `#F4F0FF` | App canvas tint, hover |
| `--ink` | `#1B1534` | Main text (deep violet-black) |
| `--muted` | `#6B6585` | Secondary text |
| `--line` | `#E6E0F5` | Borders and dividers |
| `--surface` | `#FFFFFF` | Cards |
| `--danger` | `#C0264B` | **Only** for overdue text, dot and outline. Never a filled box |

**Status without colour boxes:** show state with a small dot plus a text label, and weight.
- On track: neutral dot (`--muted`), normal text.
- At risk: `--primary-600` dot, medium weight text.
- Overdue: `--danger` dot and `--danger` text, plus a thin `--danger` left border on the row in tables. No filled red cell.
- Verified, Closed: check icon in `--primary-600`.
Badges are soft purple pills (`--primary-100` background, `--primary-900` text) or plain outline pills. That is the whole badge system.

**Chart palette (in order):** `#2A1A6E`, `#5B35E5`, `#8B6CF0`, `#CBBDFA`, `#E9E1FF`, and neutral `#B8B3C9`. Gridlines `--line`. Bars have 8px top radius. Lines are 2.5px with soft area fill at 12% opacity of `--primary-600`. No chart may use any hue outside this set.

**Map palette:** five purple steps from `#F4F0FF` (lowest) to `#2A1A6E` (highest). Borders white 0.75px. Hover state raises to `--primary-600` with a tooltip card.

**Page background:** app canvas `--primary-50`; cards white. Landing page background: soft lavender radial wash (`#EDE5FF` to `#FFFFFF`) like the TNDP reference. One subtle wave line pattern is allowed in the hero.

## 4. Typography and sizing
- Font: **Plus Jakarta Sans** (single family) with system fallback. Numbers use tabular figures.
- **Minimum sizes:** body 15px, table body 14px, table header and meta 13px, captions and badges 12px, **absolute minimum 11px** (only for chart axis ticks). Nothing smaller.
- Scale: Display 56/64 (landing hero), H1 32/40, H2 24/32, H3 18/26, Body 15/24, Small 13/20.
- Weights: 400 body, 500 labels, 600 headings, 700 only for big numbers and hero.
- No all-caps labels. No letter-spacing hacks. Sentence case everywhere.
- Line length at most 70 characters in prose.
- Buttons: height 44px, text 15px, radius 12px. Inputs: height 44px, radius 12px, 1px `--line` border, focus ring 2px `--primary-600`.
- Touch targets at least 40px. Visible keyboard focus everywhere.

## 5. Public site (separate routes, no app chrome)

### `/` Landing (follow the TNDP reference closely)
1. **Navigation:** floating white pill bar, logo left, links (How it works, Roles, About), purple pill button "Sign in" with an arrow icon on the right.
2. **Hero:** centred. Headline (56px, 2 lines): *"Every approval, tracked to the day."* Subline one sentence. Two buttons: filled "Sign in" and outline "See how it works". Soft lavender wave background.
3. **Floating preview card:** a real live component (not an image) showing 3 numbers (Active, Past deadline, Due in 7 days), a small area chart, and a "Next steps" list, in the style of the TNDP hero card. Data from the seed.
4. **"How a case moves":** four rounded cards in a row (Receive and route, Scrutiny and EVC, Approve with conditions, Monitor and renew), each with a Phosphor duotone icon and a link "Explore" to `/how-it-works`.
5. **Outcomes strip:** four large numbers from the live seed ("Demo data" footnote): applications tracked, regions covered, obligations monitored, alerts sent.
6. **Built for every role:** five cards (one per role) linking to `/roles`.
7. **Safeguard band:** short statement: *"Alerts assist. Officials decide."* with a shield icon. One calm lavender band.
8. **Footer:** four columns (Platform, Roles, Resources, Contact) like the TNDP footer. Real links only.

### `/how-it-works`
Vertical stepper of the lifecycle with one illustration per step. Includes the routes (Only Scrutiny, Scrutiny + EVC, and so on) as a clear diagram.

### `/roles`
One section per role: what they see, what they do. Short.

### `/about`
Problem, approach, human-in-the-loop safeguard, the technology list. Short.

### `/login`
Split layout. Left: purple panel with logo, one-line value statement, and a Lottie animation. Right: white card with email, password, "Sign in" button, forgot-password link. When `DEMO_MODE=true`, show five demo-account chips below the form that fill the credentials. Clear inline errors.

## 6. App shell (after login)
- **Left sidebar** (264px, white, 1px `--line` right border): logo, nav groups, collapse control. Active item: `--primary-100` pill with `--primary-600` icon and text. Bottom: role badge and sign out.
- **Top bar** (72px): page search, **notification bell with unread count** (opens a drawer), region selector (for Bureau), user menu. In demo mode, the **Demo clock** control sits here as a quiet outline pill "Demo clock: 29 Oct 2026" that opens a popover (+1 day, +7 days, +30 days, Reset).
- **Page header:** H1, optional one-line description, primary action on the right, breadcrumb above.
- Content max width 1440px, gutters 32px, card gap 24px, card radius 16px, single shadow token `0 1px 2px rgba(42,26,110,.06), 0 8px 24px rgba(42,26,110,.06)`.
- Footer text (12px, muted): "Demo data. Fictional institutions."
- Responsive: sidebar becomes a drawer under 1024px, tables scroll horizontally inside their card.

## 7. Routes per role (each its own page)
Use route groups with a layout guard per role.

**Institution** `/institution/...`
`overview`, `applications`, `applications/new` (4-step wizard: Basics, Documents, Review, Submit), `applications/[id]`, `compliance`, `documents`, `notifications`, `settings`

**Regional Officer** `/regional/...`
`overview`, `applications`, `applications/[id]` (case workspace), `evc`, `evc/calendar`, `compliance`, `escalations`, `reports`, `map`, `audit`, `notifications`, `settings`

**EVC Coordinator** `/evc/...`
`queue`, `calendar`, `visits/[id]`, `experts`, `notifications`, `settings`

**Bureau Officer** `/bureau/...`
`overview`, `map`, `regions`, `bottlenecks`, `workload`, `approvals` (sign queue), `escalations`, `reports`, `audit`, `settings`

**Admin** `/admin/...`
`overview`, `users`, `rules` (list), `rules/[id]` (Rule Studio), `templates`, `calendar` (holidays), `notifications-log`, `integrations` (planned items, disabled), `demo`, `settings`

## 8. Key screens in detail

### 8.1 Regional overview
Page title "Overview". Row 1: four metric cards (Active, Past deadline, Due in 7 days, Likely to miss). Each card: label 13px, number 36px/700, small trend text. Past deadline number is `--danger` text only.
Row 2 (two columns): left card "Where applications are waiting" horizontal stacked bars by stage (purple scale; overdue portion in `--primary-900`, not red); right card "Coming up" list with Phosphor icons.
Row 3: "Needs you today" table: Institution, Stage, Owner, Time in stage (mini progress bar + "6 of 5 days"), action link. Overdue rows get the thin `--danger` left border and danger text for the time only.

### 8.2 Case workspace (`applications/[id]`)
Header: institution name, app number, chips (route, rule version, owner). Under it a **horizontal stage tracker** (done: filled `--primary-600` check; current: ring; future: outline).
Two-column body:
- Left: **Why this case is delayed** (clocks, key-value list, next permitted action, buttons). Tabs below: Documents, Deficiencies, EVC, Obligations, Summary.
- Right: Timeline of events (vertical line, dots).
Action buttons open a modal. Approve, revert and clear open the **Sign and record** modal: reason fields, password re-entry, "Sign and record" button, text "This decision is recorded under your name".
Bottom: audit table with hash chips and "Chain verified" indicator.

### 8.3 India map pages (`/regional/map`, `/bureau/map`)
Layout from the datago reference: map fills the canvas, **floating search** top-left, **legend card** bottom-left (purple scale with min and max), **detail drawer** right (420px) that opens when a state is clicked.
- Metric switcher (segmented control): Applications, Past deadline, Institutions, Obligations overdue.
- State fill by quantile. Regional office markers as small `--primary-900` circles with city label.
- Drawer contents: state name, four numbers, mini bar chart by stage, list of top 5 institutions with links, button "View applications" (filtered).
- Respect official boundary (see repos file). Zoom and pan with buttons and wheel. Reset button.

### 8.4 Bureau overview
Metric cards, region comparison bar chart (turnaround days by region), stage congestion matrix (regions x stages as a purple heat grid with numbers), workload by officer (horizontal bars with capacity line), bottleneck list ("Fire NOC verification in X region averages 8.4 days against 7").

### 8.5 EVC queue and calendar
Queue table with priority, days in queue vs target, state. Row action "Assign panel" opens a side sheet: pick experts, instant **conflict check** result per expert (passes, or "Same home district" reason), date picker, confirm. Calendar page uses a month and week view in our palette (events as purple pills).

### 8.6 Compliance and documents
Obligation list with state pills and due countdown. Obligation detail drawer: condition, source reference, required evidence, upload area (drag and drop), history. Document register: table with type, expiry date, days left, version, state. Upload flow: file -> "We found these dates" panel with extracted values and source snippet -> **Confirm** or edit.

### 8.7 Rule Studio (`admin/rules/[id]`)
Left: version list with status and effective date. Centre: form-based editor (not raw JSON) with sections: Routes, Stage targets, Reminders, Escalation ladder, Documents. Right: **Test panel** (pick an application type, see the resolved route and due dates). Buttons: Save draft, Test, Publish with effective date. Diff view versus previous version.

### 8.8 Notifications drawer and page
Grouped by day, each item with icon, title, one-line context, time, unread dot. "Mark all as read". Page version has filters and channel column.

### 8.9 Settings (must work)
Tabs: Profile, Security (change password), Notifications (per-channel switches, daily digest, saved and respected), and for Admin the system tabs. Save shows a toast "Preferences saved". Changing a preference immediately changes what the user receives.

## 9. Components every page uses
Data table (sortable, filter bar, pagination, empty state), metric card, stage tracker, clock bar, status label (dot + text), pill badge, side sheet, modal, toast (sonner), tabs, segmented control, date picker, file dropzone, stepper, timeline, chip, skeleton loaders (never spinners on whole pages), empty states (Lottie or flat illustration + one line + one action), error states (what failed, what to do).

## 10. Icons, Lottie, motion
- **Icons:** Phosphor only. `regular` weight in navigation and tables, `duotone` for feature cards and empty states. 20px default, 24px in cards. Never mix other icon sets. Never use emoji as icons.
- **Lottie (max four, all purple or neutral):** landing hero accent, login panel, empty state, success confirmation after signing. Respect `prefers-reduced-motion`.
- **Motion:** 150 to 200ms ease-out for hover and open. One orchestrated entrance on landing hero only. No scattered fade-up on every card. Charts animate once on mount.

## 11. Copy rules
Write for officials and college administrators. Plain verbs, sentence case, specific. Buttons say what happens: "Assign panel", "Sign and record", "Return to institution". Errors explain the fix. Empty states: one line plus one action. Do not add helper paragraphs where a label is enough.

## 12. Accessibility and quality floor
Contrast at least 4.5:1 for text, visible focus, labels on every input, keyboard-operable modals and sheets, `aria-live` for toasts, table headers marked. Test at 1440, 1280 and 390 widths. Lighthouse accessibility 90 or more.

## 13. Self-review checklist before finishing any page
- Does it use only the token colours?
- Any text under the minimum size?
- Any element that looks like a template block repeated for no reason?
- Any dummy, non-working control?
- Does it match the TNDP landing and Hasmart shell references in spacing and softness?
- Is the same hero-case data used consistently across screens?
