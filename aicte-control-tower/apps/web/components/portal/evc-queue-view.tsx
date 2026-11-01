"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CalendarCheck, CalendarPlus, SealCheck, Warning } from "@phosphor-icons/react";

import { MetricCard } from "@/components/domain/metric-card";
import { PageHeader } from "@/components/domain/page-header";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatDateTime } from "@/lib/format";
import {
  APPLICATION_TYPE_LABELS,
  ROLE_LABELS,
  type EvcQueueItem,
  type PanelMember,
  type SessionUser,
} from "@/lib/types";
import { cn } from "cn";

const OUTCOMES = [
  { value: "recommended_for_approval", label: "Committee recommends approval" },
  { value: "deficiencies_found", label: "Deficiencies found" },
  { value: "not_visited", label: "Visit did not take place" },
];

function defaultVisit() {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  date.setHours(10, 30, 0, 0);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

export function EvcQueueView({
  user,
  cases,
  experts,
  canSchedule,
}: {
  user: SessionUser;
  cases: EvcQueueItem[];
  experts: PanelMember[];
  canSchedule: boolean;
}) {
  const router = useRouter();
  const [active, setActive] = useState<EvcQueueItem | null>(null);
  const [mode, setMode] = useState<"schedule" | "complete">("schedule");
  const [visitAt, setVisitAt] = useState(defaultVisit);
  const [selected, setSelected] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [outcome, setOutcome] = useState(OUTCOMES[0].value);
  const [recommendation, setRecommendation] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const queued = cases.filter((item) => item.status === "queued");
  const scheduled = cases
    .filter((item) => item.status === "scheduled")
    .sort((a, b) => (a.scheduled_for ?? "").localeCompare(b.scheduled_for ?? ""));

  const busyExperts = useMemo(() => new Set(selected), [selected]);

  function openSchedule(item: EvcQueueItem) {
    setActive(item);
    setMode("schedule");
    setVisitAt(defaultVisit());
    setSelected(item.panel.map((member) => member.id));
    setNotes("");
    setPassword("");
    setError(null);
    setMessage(null);
  }

  function openComplete(item: EvcQueueItem) {
    setActive(item);
    setMode("complete");
    setOutcome(OUTCOMES[0].value);
    setRecommendation("");
    setPassword("");
    setError(null);
    setMessage(null);
  }

  function close() {
    setActive(null);
    setError(null);
  }

  async function post(path: string, body: unknown, sign: boolean) {
    let signToken: string | undefined;
    if (sign) {
      const signed = await fetch("/api/proxy/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const signedBody = await signed.json().catch(() => ({}));
      if (!signed.ok) {
        throw new Error(
          typeof signedBody.detail === "string" ? signedBody.detail : "The password was rejected.",
        );
      }
      signToken = signedBody.sign_token as string;
    }
    const response = await fetch(`/api/proxy/${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(signToken ? { "X-Sign-Token": signToken } : {}),
      },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(
        typeof payload.detail === "string" ? payload.detail : "That change was not recorded.",
      );
    }
    return payload;
  }

  async function submit() {
    if (!active) return;
    setPending(true);
    setError(null);
    try {
      if (mode === "schedule") {
        await post(
          `evc/${active.id}/schedule`,
          {
            scheduled_for: new Date(visitAt).toISOString(),
            expert_ids: selected,
            notes,
          },
          false,
        );
        setMessage(`Visit scheduled for ${formatDateTime(new Date(visitAt).toISOString())}.`);
      } else {
        await post(
          `evc/${active.id}/complete`,
          { outcome, recommendation, report_document_id: null },
          true,
        );
        setMessage("Visit outcome recorded under your name and written to the audit trail.");
      }
      router.refresh();
      close();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That change was not recorded.");
    } finally {
      setPending(false);
    }
  }

  const canSubmit =
    mode === "schedule"
      ? selected.length > 0 && selected.length <= 3
      : recommendation.trim().length >= 10 && password.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumbs={[{ label: ROLE_LABELS[user.role] }, { label: "EVC queue" }]}
        title="Expert Visit Committee"
        description="Cases waiting for a visit, the panel that will attend, and the recorded outcome. The committee recommends; the approval stays with the Bureau Officer."
      />

      <section aria-label="EVC figures" className="grid gap-4 sm:grid-cols-3">
        <MetricCard label="Waiting for a visit" value={String(queued.length)} hint="Cases in your region" />
        <MetricCard label="Visits scheduled" value={String(scheduled.length)} hint="Panel and date recorded" />
        <MetricCard
          label="Priority one"
          value={String(cases.filter((item) => item.priority === 1).length)}
          hint="New institution applications"
          tone={cases.some((item) => item.priority === 1) ? "danger" : "default"}
        />
      </section>

      {message ? (
        <p
          aria-live="polite"
          className="flex items-start gap-2 rounded-xl bg-primary-50 p-3 text-[13px] leading-5 text-ink"
        >
          <SealCheck size={16} className="mt-0.5 shrink-0 text-primary-600" aria-hidden="true" />
          {message}
        </p>
      ) : null}

      {queued.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-surface px-6 py-10 text-center">
          <p className="text-[15px] font-medium text-primary-900">The queue is clear</p>
          <p className="mt-1 text-[13px] text-muted">
            Cases land here as soon as the Regional Officer clears scrutiny.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-line bg-surface">
          <Table>
            <caption className="sr-only">Cases waiting for an EVC visit</caption>
            <TableHeader className="bg-primary-50">
              <TableRow className="border-line hover:bg-transparent">
                {["Case", "Institution", "Priority", "Waiting since", "Actions"].map((header) => (
                  <TableHead key={header} className="h-11 px-4 text-[13px] font-medium text-muted">
                    {header}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {queued.map((item) => (
                <TableRow key={item.id} className="border-line hover:bg-primary-50/60">
                  <TableCell className="px-4 py-3.5">
                    <Link
                      href={`/evc/queue/${item.application_id}`}
                      className="text-[14px] font-medium text-primary-900 hover:text-primary-600"
                    >
                      {item.app_no}
                    </Link>
                    <p className="text-[12px] text-muted">
                      {APPLICATION_TYPE_LABELS[item.type] ?? item.type}
                    </p>
                  </TableCell>
                  <TableCell className="px-4 py-3.5">
                    <p className="text-[14px] text-ink">{item.institution_name}</p>
                    <p className="text-[12px] text-muted">
                      {item.district} / {item.region_name}
                    </p>
                  </TableCell>
                  <TableCell className="px-4 py-3.5 text-[14px]">P{item.priority}</TableCell>
                  <TableCell className="px-4 py-3.5 text-[13px] text-muted">
                    {formatDate(item.queued_at)}
                  </TableCell>
                  <TableCell className="px-4 py-3.5">
                    {canSchedule ? (
                      <Button variant="outline" size="sm" onClick={() => openSchedule(item)}>
                        <CalendarPlus size={15} aria-hidden="true" />
                        Schedule visit
                      </Button>
                    ) : (
                      <span className="text-[12px] text-muted">Waiting for the coordinator</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <section aria-labelledby="scheduled-heading" className="flex flex-col gap-3">
        <div>
          <h2 id="scheduled-heading" className="text-[18px] font-semibold leading-6">
            Upcoming visits
          </h2>
          <p className="mt-1 text-[13px] text-muted">
            The next 45 days, earliest first. Panels cannot include an expert who lives in the
            institution&apos;s district.
          </p>
        </div>

        {scheduled.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line bg-surface px-6 py-8 text-center text-[13px] text-muted">
            No visit is scheduled yet.
          </div>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {scheduled.map((item) => (
              <li key={item.id} className="rounded-2xl border border-line bg-surface p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[14px] font-medium text-primary-900">
                      {formatDateTime(item.scheduled_for)}
                    </p>
                    <p className="text-[13px] text-muted">
                      {item.institution_name} / {item.app_no}
                    </p>
                  </div>
                  <CalendarCheck size={20} className="text-primary-600" aria-hidden="true" />
                </div>
                <p className="mt-2 text-[13px] text-ink">
                  Panel: {item.panel.map((member) => member.name).join(", ") || "Not named"}
                </p>
                {canSchedule ? (
                  <Button className="mt-3" size="sm" variant="outline" onClick={() => openComplete(item)}>
                    Record outcome
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <Dialog open={active !== null} onOpenChange={(open) => (open ? undefined : close())}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {mode === "schedule" ? "Schedule a visit" : "Record the visit outcome"}
            </DialogTitle>
            <DialogDescription>
              {mode === "schedule"
                ? "The institution is told the date, and the case shows the panel. No decision is taken here."
                : "The committee's finding is advice. It is signed by you and the case moves to the next stage."}
            </DialogDescription>
          </DialogHeader>

          {mode === "schedule" ? (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="visit-at">Visit date and time</Label>
                <Input
                  id="visit-at"
                  type="datetime-local"
                  value={visitAt}
                  onChange={(event) => setVisitAt(event.target.value)}
                  className="h-11 rounded-[12px] text-[14px]"
                />
              </div>
              <fieldset className="flex flex-col gap-2">
                <legend className="text-[13px] font-medium text-ink">
                  Panel (one to three experts)
                </legend>
                <div className="max-h-56 overflow-y-auto rounded-xl border border-line">
                  {experts.map((expert) => {
                    const conflict = active?.conflict_ids.includes(expert.id) ?? false;
                    const checked = busyExperts.has(expert.id);
                    return (
                      <label
                        key={expert.id}
                        className={cn(
                          "flex cursor-pointer items-start gap-3 border-b border-line px-3 py-2.5 last:border-b-0",
                          conflict ? "cursor-not-allowed bg-primary-50/60" : "hover:bg-primary-50/60",
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={conflict || (!checked && selected.length >= 3)}
                          onChange={(event) =>
                            setSelected((current) =>
                              event.target.checked
                                ? [...current, expert.id]
                                : current.filter((id) => id !== expert.id),
                            )
                          }
                          className="mt-1 size-4 accent-primary-600"
                        />
                        <span>
                          <span className="block text-[14px] text-ink">{expert.name}</span>
                          <span className="block text-[12px] text-muted">
                            {expert.home_institution} / {expert.home_district}
                          </span>
                          {conflict ? (
                            <span className="mt-0.5 flex items-center gap-1 text-[12px] text-danger">
                              <Warning size={13} aria-hidden="true" />
                              Lives in this district. Cannot sit on the panel.
                            </span>
                          ) : null}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="visit-notes">Note for the record (optional)</Label>
                <Textarea
                  id="visit-notes"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  rows={2}
                  className="min-h-[64px] rounded-[12px] text-[14px]"
                />
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="visit-outcome">Outcome</Label>
                <select
                  id="visit-outcome"
                  value={outcome}
                  onChange={(event) => setOutcome(event.target.value)}
                  className="h-11 w-full rounded-[12px] border border-line bg-surface px-3 text-[14px] focus-visible:border-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600/30"
                >
                  {OUTCOMES.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="visit-recommendation">What the committee found</Label>
                <Textarea
                  id="visit-recommendation"
                  value={recommendation}
                  onChange={(event) => setRecommendation(event.target.value)}
                  rows={4}
                  placeholder="Site, labs, faculty and library as recorded during the visit."
                  className="min-h-[96px] rounded-[12px] text-[14px]"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="visit-password">Password</Label>
                <Input
                  id="visit-password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="h-11 rounded-[12px] text-[14px]"
                />
              </div>
            </div>
          )}

          {error ? (
            <p aria-live="polite" className="rounded-xl border border-danger/40 p-3 text-[13px] text-danger">
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <Button variant="outline" size="lg" onClick={close}>
              Cancel
            </Button>
            <Button size="lg" onClick={submit} disabled={pending || !canSubmit}>
              {mode === "schedule" ? "Schedule visit" : "Sign and record"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
