import { ApplicationsTable } from "@/components/portal/applications-table";
import { MetricCard } from "@/components/domain/metric-card";
import { PageHeader } from "@/components/domain/page-header";
import { roleBasePath } from "@/lib/nav";
import { ROLE_LABELS, type Overview, type SessionUser } from "@/lib/types";

export function OverviewView({
  user,
  overview,
  description,
}: {
  user: SessionUser;
  overview: Overview;
  description: string;
}) {
  const base = roleBasePath(user.role);
  const detailBase = user.role === "admin" ? undefined : `${base}/applications`;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        breadcrumbs={[{ label: ROLE_LABELS[user.role] }, { label: "Overview" }]}
        title={`Overview`}
        description={description}
      />

      <section aria-label="Key figures" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Applications in scope"
          value={String(overview.applications)}
          hint={overview.scope_label}
        />
        <MetricCard
          label="Past deadline"
          value={String(overview.past_deadline)}
          tone={overview.past_deadline > 0 ? "danger" : "default"}
          hint="Open stages beyond their target date"
        />
        <MetricCard
          label="Due in 7 days"
          value={String(overview.due_next_7_days)}
          hint="Open stages reaching their target this week"
        />
        <MetricCard
          label="Awaiting your action"
          value={String(overview.awaiting_you)}
          hint="Open stages assigned to you"
        />
      </section>

      <section aria-labelledby="recent-heading" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="recent-heading" className="text-[20px] font-semibold leading-7">
              Recently submitted
            </h2>
            <p className="text-[13px] text-muted">
              The five latest applications in your scope.
            </p>
          </div>
        </div>
        <ApplicationsTable
          rows={overview.recent}
          basePath={`${base}/applications`}
          detailBase={detailBase}
          emptyTitle="No applications yet"
          emptyDescription="Applications appear here once an institution submits one."
        />
      </section>
    </div>
  );
}
