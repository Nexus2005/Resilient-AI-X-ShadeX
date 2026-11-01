import Link from "next/link";
import { ArrowRight, Check } from "@phosphor-icons/react/dist/ssr";

import { buttonVariants } from "@/components/ui/button";
import { routeRules } from "@/lib/site-content";
import { cn } from "cn";

const steps = [
  {
    title: "Submit",
    meta: "Institution",
    body: "The application is created with its document set. Required documents come from the published rule version, not from a checklist typed into the screen.",
  },
  {
    title: "Route automatically",
    meta: "Rule engine",
    body: "The route is resolved from the application type and its data: only scrutiny, scrutiny with EVC, EVC with SAC/SHC, only EVC, or the full chain.",
  },
  {
    title: "Scrutinise",
    meta: "Regional Officer, target in working days",
    body: "The officer clears the case or reverts it with a structured reason: category, reference field, required evidence and a resubmission deadline. Reverted cases return to the same officer.",
  },
  {
    title: "Schedule the EVC",
    meta: "EVC Coordinator",
    body: "Eligible cases are queued by priority. The panel is checked for conflicts before scheduling, then the visit is recorded and the report uploaded.",
  },
  {
    title: "Sign the approval",
    meta: "Bureau Officer",
    body: "Approval conditions become undertakings with evidence requirements and due dates. The decision is signed in the interface and appended to the audit trail.",
  },
  {
    title: "Monitor, escalate and close",
    meta: "Scheduler and officers",
    body: "Undertakings and document expiries raise reminders, then escalations up the configured ladder. A renewal is uploaded, verified by a person, and the obligation closes.",
  },
] as const;

export default function HowItWorksPage() {
  return (
    <>
      <section className="landing-wash border-b border-line pb-16 pt-14">
        <div className="section-shell">
          <div className="max-w-[760px]">
            <h1 className="text-[36px] font-bold leading-[44px] tracking-tight sm:text-[44px] sm:leading-[52px]">
              From submission to closure, with a clock on every stage.
            </h1>
            <p className="mt-4 text-[16px] leading-7 text-muted">
              Each stage has a target measured in working days, an owner and an
              audit event. Nothing advances without the action an authorised
              person is permitted to take.
            </p>
          </div>
        </div>
      </section>

      <section id="lifecycle" className="py-20">
        <div className="section-shell">
          <h2 className="text-[26px] font-semibold leading-8 tracking-tight">The lifecycle</h2>
          <ol className="mt-8 flex flex-col">
            {steps.map((step, index) => (
              <li
                key={step.title}
                className="grid gap-4 border-t border-line py-6 sm:grid-cols-[64px_240px_1fr] sm:gap-6"
              >
                <span className="flex size-10 items-center justify-center rounded-full bg-primary-100 text-[14px] font-semibold text-primary-900">
                  {index + 1}
                </span>
                <div>
                  <h3 className="text-[17px] font-semibold leading-6">{step.title}</h3>
                  <p className="mt-1 text-[12px] leading-5 text-muted">{step.meta}</p>
                </div>
                <p className="max-w-[70ch] text-[15px] leading-6 text-muted">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="routes" className="border-y border-line bg-primary-50 py-20">
        <div className="section-shell">
          <h2 className="text-[26px] font-semibold leading-8 tracking-tight">Five permitted routes</h2>
          <p className="mt-2 max-w-[70ch] text-[15px] leading-6 text-muted">
            Routes are configuration. Publishing a new rule version changes the
            routing for new cases; open cases keep the version they started on.
          </p>
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {routeRules.map((route) => (
              <article key={route.name} className="rounded-2xl border border-line bg-surface p-6">
                <h3 className="text-[16px] font-semibold leading-6">{route.name}</h3>
                <p className="mt-1 text-[13px] leading-5 text-muted">{route.used}</p>
                <ol className="mt-4 flex flex-wrap items-center gap-2">
                  {route.stages.map((stage, index) => (
                    <li key={stage} className="flex items-center gap-2">
                      <span className="rounded-full border border-line px-3 py-1 text-[12px] text-ink">
                        {stage}
                      </span>
                      {index < route.stages.length - 1 ? (
                        <ArrowRight size={12} className="text-muted" aria-hidden="true" />
                      ) : null}
                    </li>
                  ))}
                </ol>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20">
        <div className="section-shell grid gap-10 lg:grid-cols-2">
          <div>
            <h2 className="text-[26px] font-semibold leading-8 tracking-tight">Two clocks per case</h2>
            <p className="mt-3 max-w-[60ch] text-[15px] leading-6 text-muted">
              Total age runs from submission. Stage age runs from the moment the
              case entered its current stage, and pauses while a revert is open.
              Targets are working days, so the holiday calendar is respected.
            </p>
            <ul className="mt-6 flex flex-col gap-3">
              {[
                "On track below 80 percent of the target",
                "At risk from 80 percent, with a warning to the owner",
                "Overdue past the target, which starts the escalation ladder",
              ].map((line) => (
                <li key={line} className="flex items-start gap-2.5 text-[14px] leading-6 text-ink">
                  <Check size={16} weight="bold" className="mt-1 text-primary-600" aria-hidden="true" />
                  {line}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="text-[26px] font-semibold leading-8 tracking-tight">Escalation ladder</h2>
            <p className="mt-3 max-w-[60ch] text-[15px] leading-6 text-muted">
              An overdue item moves to the next named owner at the configured
              delay. Every escalation is visible to the officer concerned and can
              be acknowledged. The scheduler never takes the decision itself.
            </p>
            <ol className="mt-6 flex flex-col gap-4 rounded-2xl border border-line bg-surface p-6">
              {["Obligation owner", "Regional Officer", "Bureau Officer", "Member Secretary view"].map(
                (level, index) => (
                  <li key={level} className="flex items-center gap-3">
                    <span className="flex size-7 items-center justify-center rounded-full bg-primary-100 text-[12px] font-semibold text-primary-900">
                      {index + 1}
                    </span>
                    <span className="text-[14px] text-ink">{level}</span>
                  </li>
                ),
              )}
            </ol>
            <p className="mt-3 text-[12px] leading-5 text-muted">
              Delays are configured in the rule version. A missed revert deadline
              notifies the officer and is never auto-escalated to SAC/SHC.
            </p>
          </div>
        </div>
      </section>

      <section className="pb-24">
        <div className="section-shell">
          <div className="flex flex-col items-start gap-6 rounded-2xl bg-primary-900 p-8 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-[22px] font-semibold leading-7 text-white">
                Sign in to follow a live case
              </h2>
              <p className="mt-2 max-w-[60ch] text-[14px] leading-6 text-primary-100">
                The demonstration dataset includes one case that runs the full
                lifecycle, from submission to renewal verification.
              </p>
            </div>
            <Link href="/login" className={cn(buttonVariants({ size: "lg" }), "bg-surface text-primary-900 hover:bg-primary-100")}>
              Sign in
              <ArrowRight size={17} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
