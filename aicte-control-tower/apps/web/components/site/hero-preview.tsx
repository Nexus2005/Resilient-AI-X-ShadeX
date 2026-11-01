import { BellRinging, CalendarCheck, MagnifyingGlass } from "@phosphor-icons/react/dist/ssr";

import { HeroChart } from "@/components/site/hero-chart";
import type { PublicSummary } from "@/lib/types";
import { cn } from "cn";

function weekLabel(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export function HeroPreview({ summary }: { summary: PublicSummary | null }) {
  const metrics = [
    { label: "Active", value: summary ? String(summary.active) : "—", danger: false },
    {
      label: "Past deadline",
      value: summary ? String(summary.past_deadline) : "—",
      danger: Boolean(summary?.past_deadline),
    },
    { label: "Due in 7 days", value: summary ? String(summary.due_in_7_days) : "—", danger: false },
  ];

  const series =
    summary?.applications_by_week.map((point) => ({
      label: weekLabel(point.week_start),
      count: point.count,
    })) ?? [];

  const nextSteps = summary
    ? [
        {
          title: "Clear overdue stages",
          detail:
            summary.past_deadline === 0
              ? "No open stage is past its target"
              : `${summary.past_deadline} stages past their target date`,
        },
        {
          title: "Prepare this week's visits",
          detail: `${summary.due_in_7_days} stages reach their target in 7 days`,
        },
        {
          title: "Review the alert log",
          detail: `${summary.alerts_raised} notifications recorded`,
        },
      ]
    : [
        {
          title: "Summary unavailable",
          detail: "The API is not reachable from this screen",
        },
      ];

  const stepIcons = [MagnifyingGlass, CalendarCheck, BellRinging];

  return (
    <div className="rounded-[20px] border border-line bg-surface p-5 shadow-card sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-[15px] font-semibold text-primary-900">Pendency this week</h2>
          <p className="mt-1 text-[12px] text-muted">
            {summary
              ? "Read live from the seeded demonstration dataset"
              : "Live figures unavailable. Start the API to populate this card."}
          </p>
        </div>
        <span className="rounded-full border border-line px-2.5 py-1 text-[12px] text-muted">
          Demo data
        </span>
      </div>

      <div className="mt-5 grid gap-6 md:grid-cols-[1.15fr_1fr]">
        <div>
          <dl className="grid grid-cols-3 gap-3">
            {metrics.map((metric) => (
              <div key={metric.label} className="rounded-xl bg-primary-50 px-3 py-2.5">
                <dt className="text-[12px] text-muted">{metric.label}</dt>
                <dd
                  className={cn(
                    "mt-1 text-[26px] font-bold leading-8 tracking-tight",
                    metric.danger ? "text-danger" : "text-primary-900",
                  )}
                >
                  {metric.value}
                </dd>
              </div>
            ))}
          </dl>
          <div className="mt-4">
            {series.length > 1 ? (
              <HeroChart data={series} />
            ) : (
              <div className="flex h-[84px] items-center justify-center rounded-xl bg-primary-50 text-[12px] text-muted">
                No stage entries in the last 8 weeks
              </div>
            )}
            <div className="mt-1 flex justify-between text-[12px] text-muted">
              <span>8 weeks ago</span>
              <span>This week</span>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-line p-4">
          <h3 className="text-[13px] font-semibold text-primary-900">Next steps</h3>
          <ul className="mt-3 flex flex-col gap-3">
            {nextSteps.map((step, index) => {
              const Icon = stepIcons[index] ?? MagnifyingGlass;
              return (
                <li key={step.title} className="flex items-start gap-2.5">
                  <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary-100 text-primary-700">
                    <Icon size={15} aria-hidden="true" />
                  </span>
                  <span>
                    <span className="block text-[13px] font-medium text-ink">{step.title}</span>
                    <span className="block text-[12px] leading-5 text-muted">{step.detail}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
