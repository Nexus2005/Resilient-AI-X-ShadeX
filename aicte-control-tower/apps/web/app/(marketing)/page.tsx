import Link from "next/link";
import {
  ArrowRight,
  Buildings,
  CalendarCheck,
  ClockCountdown,
  GearSix,
  MagnifyingGlass,
  MapTrifold,
  SealCheck,
  ShieldCheck,
  Signpost,
  Stamp,
} from "@phosphor-icons/react/dist/ssr";

import { DriftingHaze, DriftingLines, StepChevrons } from "@/components/motion/artwork";
import { HeroPreview } from "@/components/site/hero-preview";
import { buttonVariants } from "@/components/ui/button";
import { getPublicSummary } from "@/lib/public-summary";
import { lifecycleSteps, roleSummaries } from "@/lib/site-content";
import { cn } from "cn";

const lifecycleIcons = {
  route: Signpost,
  scrutiny: MagnifyingGlass,
  approve: SealCheck,
  monitor: ClockCountdown,
} as const;

const roleIcons = {
  institution: Buildings,
  regional: MapTrifold,
  evc: CalendarCheck,
  bureau: Stamp,
  admin: GearSix,
} as const;

export default async function LandingPage() {
  const summary = await getPublicSummary();

  const outcomes = summary
    ? [
        {
          label: "Applications tracked",
          value: summary.applications_tracked.toLocaleString("en-IN"),
        },
        { label: "Regional offices", value: String(summary.regions) },
        {
          label: "Undertakings monitored",
          value: summary.obligations_monitored.toLocaleString("en-IN"),
        },
        { label: "Alerts raised", value: summary.alerts_raised.toLocaleString("en-IN") },
      ]
    : [
        { label: "Applications tracked", value: "—" },
        { label: "Regional offices", value: "—" },
        { label: "Undertakings monitored", value: "—" },
        { label: "Alerts raised", value: "—" },
      ];

  return (
    <>
      <section className="landing-wash relative overflow-hidden pb-28 pt-14 sm:pt-20">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 top-10 size-[420px] rounded-full border border-primary-200/60"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -left-32 top-40 size-[380px] rounded-full border border-primary-200/50"
        />
        <DriftingHaze className="pointer-events-none absolute inset-x-0 top-24 h-[220px] w-full text-primary-200 opacity-30 blur-2xl" />
        <DriftingLines className="pointer-events-none absolute inset-x-0 bottom-0 mx-auto hidden h-[150px] w-full max-w-[880px] text-primary-200 opacity-80 lg:block" />

        <div className="section-shell relative">
          <div className="mx-auto max-w-[820px] text-center">
            <h1 className="text-[34px] font-bold leading-[42px] tracking-tight sm:text-[56px] sm:leading-[64px]">
              Every approval,
              <br />
              tracked to the day.
            </h1>
            <p className="mx-auto mt-5 max-w-[58ch] text-[16px] leading-7 text-muted sm:text-[17px]">
              AICTE application routing, EVC scheduling and post-approval
              compliance in one monitored system, with every decision signed and
              recorded.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link href="/login" className={cn(buttonVariants({ size: "lg" }))}>
                Sign in
                <ArrowRight size={17} aria-hidden="true" />
              </Link>
              <Link
                href="/how-it-works"
                className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
              >
                See how it works
              </Link>
            </div>
          </div>
        </div>
      </section>

      <div className="relative z-10 -mt-20 pb-24">
        <div className="section-shell max-w-[1040px]">
          <HeroPreview summary={summary} />
        </div>
      </div>

      <section className="pb-24" aria-labelledby="lifecycle-heading">
        <div className="section-shell">
          <div className="max-w-[70ch]">
            <h2 id="lifecycle-heading" className="text-[28px] font-semibold leading-9 tracking-tight">
              How a case moves
            </h2>
            <p className="mt-2 text-[15px] leading-6 text-muted">
              Four stages, each with a clock, an owner and a recorded decision.
            </p>
            <StepChevrons className="mt-5 hidden text-primary-400 sm:block" />
          </div>
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {lifecycleSteps.map((step) => {
              const Icon = lifecycleIcons[step.icon];
              return (
                <article
                  key={step.key}
                  className="flex flex-col rounded-2xl border border-line bg-surface p-6 shadow-card"
                >
                  <span className="flex size-11 items-center justify-center rounded-xl bg-primary-100 text-primary-700">
                    <Icon size={24} weight="duotone" aria-hidden="true" />
                  </span>
                  <h3 className="mt-5 text-[17px] font-semibold leading-6">{step.title}</h3>
                  <p className="mt-2 flex-1 text-[14px] leading-6 text-muted">{step.body}</p>
                  <Link
                    href={step.href}
                    className="mt-5 inline-flex items-center gap-1.5 text-[14px] font-medium text-primary-700 hover:text-primary-900"
                  >
                    Explore
                    <ArrowRight size={15} aria-hidden="true" />
                  </Link>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="border-y border-line bg-primary-50 py-16" aria-labelledby="outcomes-heading">
        <div className="section-shell">
          <h2 id="outcomes-heading" className="sr-only">
            Platform coverage
          </h2>
          <dl className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {outcomes.map((outcome) => (
              <div key={outcome.label}>
                <dd className="text-[36px] font-bold leading-10 tracking-tight text-primary-900">
                  {outcome.value}
                </dd>
                <dt className="mt-1 text-[14px] text-muted">{outcome.label}</dt>
              </div>
            ))}
          </dl>
          <p className="mt-8 text-[12px] text-muted">
            {summary
              ? "Demo data. Figures are read from the seeded demonstration dataset."
              : "Live figures unavailable: the API is not reachable. No placeholder numbers are shown."}
          </p>
        </div>
      </section>

      <section className="py-24" aria-labelledby="roles-heading">
        <div className="section-shell">
          <div className="max-w-[70ch]">
            <h2 id="roles-heading" className="text-[28px] font-semibold leading-9 tracking-tight">
              Built for every role
            </h2>
            <p className="mt-2 text-[15px] leading-6 text-muted">
              Five portals, each scoped to what that person may see and do.
            </p>
          </div>
          <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {roleSummaries.map((role) => {
              const Icon = roleIcons[role.key];
              return (
                <Link
                  key={role.key}
                  href={`/roles#${role.key}`}
                  className="group rounded-2xl border border-line bg-surface p-6 transition-colors duration-150 hover:border-primary-200 hover:bg-primary-50/60"
                >
                  <span className="flex size-10 items-center justify-center rounded-xl bg-primary-100 text-primary-700">
                    <Icon size={22} weight="duotone" aria-hidden="true" />
                  </span>
                  <h3 className="mt-4 text-[16px] font-semibold leading-6">{role.name}</h3>
                  <p className="mt-1 text-[13px] text-muted">{role.who}</p>
                  <p className="mt-3 text-[14px] leading-6 text-ink">{role.does}</p>
                  <span className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-primary-700">
                    What this role sees
                    <ArrowRight size={14} aria-hidden="true" />
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      <section className="pb-24">
        <div className="section-shell">
          <div className="flex flex-col items-start gap-6 rounded-2xl border border-primary-200 bg-primary-50 p-8 sm:flex-row sm:items-center">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-surface text-primary-600">
              <ShieldCheck size={26} weight="duotone" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-[22px] font-semibold leading-7">Alerts assist. Officials decide.</h2>
              <p className="mt-2 max-w-[70ch] text-[15px] leading-6 text-muted">
                No automated approval, rejection or penalty. Every statutory
                decision is signed in the interface and written to the audit trail.
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
