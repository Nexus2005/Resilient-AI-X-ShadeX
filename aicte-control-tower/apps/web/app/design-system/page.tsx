import {
  ClockBar,
} from "@/components/domain/clock-bar";
import { EmptyState } from "@/components/domain/empty-state";
import { MetricCard } from "@/components/domain/metric-card";
import { PageHeader } from "@/components/domain/page-header";
import { StageTracker } from "@/components/domain/stage-tracker";
import { StatusLabel } from "@/components/domain/status-label";
import { Timeline } from "@/components/domain/timeline";
import { Showcase } from "@/components/design-system/showcase";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Toaster } from "@/components/ui/sonner";

const swatches = [
  { token: "--primary-900", value: "var(--brand-900)" },
  { token: "--primary-700", value: "var(--brand-700)" },
  { token: "--primary-600", value: "var(--brand-600)" },
  { token: "--primary-400", value: "var(--brand-400)" },
  { token: "--primary-200", value: "var(--brand-200)" },
  { token: "--primary-100", value: "var(--brand-100)" },
  { token: "--primary-50", value: "var(--brand-50)" },
  { token: "--ink", value: "var(--ink)" },
  { token: "--muted", value: "var(--muted)" },
  { token: "--line", value: "var(--line)" },
  { token: "--danger", value: "var(--danger)" },
];

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-line pt-8">
      <h2 className="text-[20px] font-semibold leading-7">{title}</h2>
      {description ? <p className="mt-1 text-[13px] text-muted">{description}</p> : null}
      <div className="mt-5">{children}</div>
    </section>
  );
}

export default function DesignSystemPage() {
  return (
    <div className="min-h-full bg-primary-50 px-6 py-10">
      <div className="mx-auto flex max-w-[1100px] flex-col gap-10">
        <PageHeader
          breadcrumbs={[{ label: "Internal" }, { label: "Design system" }]}
          title="Design system"
          description="Every token and shared component used by the product. This page is not linked from navigation."
        />

        <Section title="Colour tokens" description="The only colours allowed in the product.">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {swatches.map((swatch) => (
              <div key={swatch.token} className="rounded-xl border border-line bg-surface p-3">
                <div
                  className="h-12 w-full rounded-lg border border-line"
                  style={{ background: swatch.value }}
                  aria-hidden="true"
                />
                <p className="mt-2 text-[12px] font-medium text-ink">{swatch.token}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Typography" description="Plus Jakarta Sans, minimum 11px, body 15px.">
          <div className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-6">
            <p className="text-[56px] font-bold leading-[64px] tracking-tight">Display 56</p>
            <p className="text-[32px] font-semibold leading-10 tracking-tight">Heading 32</p>
            <p className="text-[24px] font-semibold leading-8">Heading 24</p>
            <p className="text-[18px] font-semibold leading-6">Heading 18</p>
            <p className="text-[15px] leading-6">Body 15. Used for interface text and prose.</p>
            <p className="text-[13px] leading-5 text-muted">Small 13. Used for meta and table headers.</p>
            <p className="text-[12px] leading-5 text-muted">Caption 12. Used for badges and footnotes.</p>
          </div>
        </Section>

        <Section title="Buttons">
          <div className="flex flex-wrap items-center gap-3">
            <Button>Sign and record</Button>
            <Button variant="outline">Return to institution</Button>
            <Button variant="secondary">Save draft</Button>
            <Button variant="ghost">Cancel</Button>
            <Button disabled>Disabled</Button>
          </div>
        </Section>

        <Section title="Inputs">
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="ds-institution">Institution name</Label>
              <Input id="ds-institution" placeholder="Axis Institute of Technology" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="ds-reason">Revert reason</Label>
              <Textarea id="ds-reason" rows={3} placeholder="Fire NOC not attached" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="ds-invalid">Invalid input</Label>
              <Input id="ds-invalid" aria-invalid defaultValue="not-an-email" />
              <p className="text-[13px] text-danger">Enter an email address, for example name@college.ac.in.</p>
            </div>
          </div>
        </Section>

        <Section title="Badges and status labels">
          <div className="flex flex-wrap items-center gap-3">
            <Badge>Approved</Badge>
            <Badge variant="outline">Scrutiny</Badge>
            <Badge variant="secondary">Draft</Badge>
            <Badge variant="destructive">Overdue</Badge>
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-6">
            <StatusLabel state="on_track" />
            <StatusLabel state="at_risk" />
            <StatusLabel state="overdue" />
            <StatusLabel state="submitted" />
            <StatusLabel state="verified" />
            <StatusLabel state="deficient" />
            <StatusLabel state="closed" />
          </div>
        </Section>

        <Section title="Metric cards">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard label="Active" value="184" hint="Applications in progress" />
            <MetricCard label="Past deadline" value="12" tone="danger" hint="Escalation level 1" />
            <MetricCard label="Due in 7 days" value="9" hint="Reminders scheduled" />
            <MetricCard label="Closed this month" value="27" hint="Verified and closed" />
          </div>
        </Section>

        <Section title="Stage tracker">
          <div className="rounded-2xl border border-line bg-surface p-6">
            <StageTracker
              stages={["Submitted", "Scrutiny", "EVC queue", "Approval", "Closed"]}
              currentIndex={2}
            />
          </div>
        </Section>

        <Section title="Clock bars">
          <div className="grid gap-6 rounded-2xl border border-line bg-surface p-6 sm:grid-cols-2">
            <ClockBar elapsedDays={3} targetDays={7} />
            <ClockBar elapsedDays={6} targetDays={5} />
          </div>
        </Section>

        <Section title="Timeline">
          <div className="rounded-2xl border border-line bg-surface p-6">
            <Timeline
              items={[
                {
                  id: "1",
                  title: "Submitted by institution",
                  meta: "28 Oct 2026, 10:12 IST",
                  body: "Route resolved as scrutiny with EVC using rule version 3.",
                },
                {
                  id: "2",
                  title: "Reverted by Regional Officer",
                  meta: "30 Oct 2026, 16:40 IST",
                  body: "Fire NOC required before resubmission.",
                  tone: "danger",
                },
                {
                  id: "3",
                  title: "Resubmitted",
                  meta: "2 Nov 2026, 09:05 IST",
                  body: "Returned to the same officer for re-scrutiny.",
                },
              ]}
            />
          </div>
        </Section>

        <Section title="Empty and loading states">
          <div className="grid gap-5 lg:grid-cols-2">
            <EmptyState
              title="No obligations yet"
              description="Obligations are created when an approval is signed with conditions."
              action={<Button size="sm" variant="outline">View approvals</Button>}
            />
            <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-6">
              <Skeleton className="h-6 w-2/5" />
              <Skeleton className="h-11 w-full" />
              <Skeleton className="h-11 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          </div>
        </Section>

        <Showcase />
      </div>
      <Toaster position="bottom-right" />
    </div>
  );
}
