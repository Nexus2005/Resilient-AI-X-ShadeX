import { ShieldCheck } from "@phosphor-icons/react/dist/ssr";

const technology = [
  "Next.js App Router with TypeScript and Tailwind CSS",
  "FastAPI with SQLAlchemy and Alembic migrations",
  "PostgreSQL 16 for cases, rules, obligations and the audit chain",
  "A separate scheduler process reading due work from the database",
  "d3-geo choropleth rendered from a local India boundary file",
  "SMTP email, with Mailpit in development",
];

export default function AboutPage() {
  return (
    <>
      <section className="landing-wash border-b border-line pb-16 pt-14">
        <div className="section-shell">
          <div className="max-w-[760px]">
            <h1 className="text-[36px] font-bold leading-[44px] tracking-tight sm:text-[44px] sm:leading-[52px]">
              About the platform
            </h1>
            <p className="mt-4 text-[16px] leading-7 text-muted">
              A working prototype for the Institutional Regulatory Compliance Platform problem
              statement on AICTE approval workflow automation, compliance
              monitoring and alert management.
            </p>
          </div>
        </div>
      </section>

      <div className="section-shell py-20">
        <div className="grid gap-12 lg:grid-cols-[1.2fr_1fr]">
          <div className="flex flex-col gap-10">
            <section>
              <h2 className="text-[24px] font-semibold leading-8 tracking-tight">The problem</h2>
              <p className="mt-3 max-w-[70ch] text-[15px] leading-7 text-muted">
                AICTE approval and post-approval compliance are tracked as
                separate, passive records. Files stall without alarms, EVC
                scheduling needs manual chasing, and undertakings and lease expiry
                are tracked in spreadsheets.
              </p>
            </section>

            <section>
              <h2 className="text-[24px] font-semibold leading-8 tracking-tight">Our approach</h2>
              <p className="mt-3 max-w-[70ch] text-[15px] leading-7 text-muted">
                A rules-driven platform that routes each application by versioned
                rules, times every stage, schedules EVCs, tracks every undertaking
                and document expiry, and escalates overdue items to named owners.
                The audit trail is hash-chained, and humans make every decision.
              </p>
            </section>

            <section id="safeguards" className="scroll-mt-28">
              <h2 className="text-[24px] font-semibold leading-8 tracking-tight">Safeguards</h2>
              <ul className="mt-4 flex flex-col gap-4">
                {[
                  {
                    title: "No automated decisions",
                    body: "Approval, rejection, penalty and blocking actions are never taken by the system. They require a signed action by an authorised officer.",
                  },
                  {
                    title: "Signed and recorded",
                    body: "Sensitive decisions re-enter the officer's password, are marked as a simulated e-sign, and are appended to the audit chain.",
                  },
                  {
                    title: "Suggestions stay suggestions",
                    body: "OCR date suggestions and delay estimates are labelled as estimates and require confirmation before they affect a clock.",
                  },
                ].map((item) => (
                  <li key={item.title} className="flex items-start gap-3">
                    <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary-100 text-primary-700">
                      <ShieldCheck size={17} weight="duotone" aria-hidden="true" />
                    </span>
                    <div>
                      <h3 className="text-[15px] font-semibold leading-6">{item.title}</h3>
                      <p className="mt-1 max-w-[62ch] text-[14px] leading-6 text-muted">{item.body}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <aside className="flex flex-col gap-6">
            <section className="rounded-2xl border border-line bg-surface p-6">
              <h2 className="text-[16px] font-semibold leading-6">Technology</h2>
              <ul className="mt-3 flex flex-col gap-2">
                {technology.map((item) => (
                  <li key={item} className="text-[13px] leading-6 text-muted">
                    {item}
                  </li>
                ))}
              </ul>
            </section>

            <section className="rounded-2xl border border-line bg-primary-50 p-6">
              <h2 className="text-[16px] font-semibold leading-6">Data and boundaries</h2>
              <p className="mt-3 text-[13px] leading-6 text-muted">
                All institutions, applications and documents in this build are
                fictional. Statistics shown on the public pages are demonstration
                figures from the seed dataset.
              </p>
              <p className="mt-3 text-[13px] leading-6 text-muted">
                The India map uses a local boundary file with states and union
                territories shown separately; attribution is printed on the map
                page.
              </p>
            </section>

            <section className="rounded-2xl border border-line bg-surface p-6">
              <h2 className="text-[16px] font-semibold leading-6">Status</h2>
              <p className="mt-3 text-[13px] leading-6 text-muted">
                Prototype for evaluation. Not a certified government service and
                not connected to live AICTE systems.
              </p>
            </section>
          </aside>
        </div>
      </div>
    </>
  );
}
