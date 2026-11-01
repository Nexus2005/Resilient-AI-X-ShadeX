"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowSquareOut,
  CheckCircle,
  FingerprintSimple,
  SealCheck,
  UploadSimple,
} from "@phosphor-icons/react";

import { ClockBar } from "@/components/domain/clock-bar";
import { StageTracker } from "@/components/domain/stage-tracker";
import { StatusLabel } from "@/components/domain/status-label";
import { Timeline } from "@/components/domain/timeline";
import { PageHeader } from "@/components/domain/page-header";
import { CaseActions } from "@/components/portal/case-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDate, formatDateTime } from "@/lib/format";
import {
  APPLICATION_TYPE_LABELS,
  DOCUMENT_TYPE_LABELS,
  OBLIGATION_STATE_LABELS,
  ROLE_LABELS,
  STAGE_LABELS,
  stageIndex,
  stageSequence,
  type ApplicationDetail,
  type SessionUser,
} from "@/lib/types";
import { cn } from "cn";

const DOCUMENT_TYPES = [
  "lease_agreement",
  "fire_noc",
  "land_document",
  "building_plan",
  "trust_deed",
  "affiliation_certificate",
  "faculty_list",
  "site_photograph",
  "financial_statement",
];

function KeyValue({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-line py-2.5 last:border-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
      <dt className="text-[13px] text-muted">{label}</dt>
      <dd className="text-[14px] text-ink sm:text-right">{value}</dd>
    </div>
  );
}

function UploadDocument({ applicationId }: { applicationId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [docType, setDocType] = useState(DOCUMENT_TYPES[0]);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function upload() {
    const file = inputRef.current?.files?.[0];
    if (!file) {
      setError("Choose a PDF or image first.");
      return;
    }
    startTransition(async () => {
      setError(null);
      setMessage(null);
      const data = new FormData();
      data.append("file", file);
      data.append("type", docType);
      data.append("application_id", applicationId);
      const response = await fetch("/api/proxy/documents", { method: "POST", body: data });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(typeof body.detail === "string" ? body.detail : "The upload did not complete.");
        return;
      }
      setMessage("Document stored and hashed. An officer verifies the dates.");
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-dashed border-line bg-primary-50/60 p-4 sm:flex-row sm:items-end">
      <div className="flex flex-1 flex-col gap-1.5">
        <label htmlFor="upload-type" className="text-[13px] font-medium text-ink">
          Document type
        </label>
        <select
          id="upload-type"
          value={docType}
          onChange={(event) => setDocType(event.target.value)}
          className="h-11 w-full rounded-[12px] border border-line bg-surface px-3 text-[14px] focus-visible:border-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600/30"
        >
          {DOCUMENT_TYPES.map((type) => (
            <option key={type} value={type}>
              {DOCUMENT_TYPE_LABELS[type] ?? type}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-1 flex-col gap-1.5">
        <label htmlFor="upload-file" className="text-[13px] font-medium text-ink">
          File (PDF, JPEG or PNG, up to 10 MB)
        </label>
        <input
          id="upload-file"
          ref={inputRef}
          type="file"
          accept="application/pdf,image/jpeg,image/png"
          className="h-11 w-full rounded-[12px] border border-line bg-surface px-3 py-2 text-[13px] file:mr-3 file:rounded-md file:border-0 file:bg-primary-100 file:px-3 file:py-1.5 file:text-[13px] file:font-medium file:text-primary-900"
        />
      </div>
      <Button size="lg" onClick={upload} disabled={pending}>
        <UploadSimple size={16} aria-hidden="true" />
        Upload
      </Button>
      {error ? (
        <p aria-live="polite" className="text-[13px] text-danger sm:w-full">
          {error}
        </p>
      ) : null}
      {message ? (
        <p aria-live="polite" className="text-[13px] text-ink sm:w-full">
          {message}
        </p>
      ) : null}
    </div>
  );
}

export function CaseWorkspace({
  detail,
  user,
  basePath,
}: {
  detail: ApplicationDetail;
  user: SessionUser;
  basePath: string;
}) {
  const stages = stageSequence(detail.route);
  const currentIndex = stageIndex(detail.route, detail.current_stage);
  const openRevert = detail.reverts.find((revert) => revert.status === "open");
  const owner = detail.open_stage?.owner_name ?? detail.owner_name;
  const canUpload = user.role === "institution" && user.institution_id === detail.institution_id;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        breadcrumbs={[
          { label: ROLE_LABELS[user.role] },
          { label: "Applications", href: basePath },
          { label: detail.app_no },
        ]}
        title={detail.institution_name}
        description={`${APPLICATION_TYPE_LABELS[detail.type] ?? detail.type} for ${detail.academic_year}. Filed in ${detail.institution_state}, ${detail.region_name} region.`}
        actions={
          <Link href={basePath} className="text-[13px] font-medium text-primary-600 hover:text-primary-700">
            Back to applications
          </Link>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Badge>{detail.app_no}</Badge>
        {detail.route.map((entry) => (
          <Badge key={entry} variant="outline">
            {entry === "sac_shc" ? "SAC/SHC" : entry === "evc" ? "EVC" : "Scrutiny"}
          </Badge>
        ))}
        <Badge variant="secondary">Rule {detail.rule_version ?? "not set"}</Badge>
        <span className="text-[13px] text-muted">
          {owner ? `With ${owner}` : "Unassigned"}
        </span>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-line bg-surface p-5">
        <StageTracker stages={stages} currentIndex={currentIndex} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-6">
          <section
            aria-labelledby="clocks-heading"
            className="rounded-2xl border border-line bg-surface p-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 id="clocks-heading" className="text-[18px] font-semibold leading-6">
                  Why this case is delayed
                </h2>
                <p className="mt-1 text-[13px] text-muted">
                  Two clocks run together: the stage clock and the case clock.
                </p>
              </div>
              {detail.sla_state ? <StatusLabel state={detail.sla_state} /> : null}
            </div>

            <div className="mt-5">
              {detail.open_stage ? (
                <ClockBar
                  elapsedDays={detail.stage_age_days ?? 0}
                  targetDays={detail.stage_target_days ?? 1}
                  label={`${STAGE_LABELS[detail.open_stage.stage] ?? detail.open_stage.stage} clock`}
                />
              ) : (
                <p className="text-[13px] text-muted">No open stage clock.</p>
              )}
            </div>

            <dl className="mt-4">
              <KeyValue
                label="Stage"
                value={STAGE_LABELS[detail.current_stage] ?? detail.current_stage}
              />
              <KeyValue label="Owner" value={detail.open_stage?.owner_name ?? "Unassigned"} />
              <KeyValue
                label="In stage since"
                value={formatDateTime(detail.open_stage?.entered_at)}
              />
              <KeyValue label="Target date" value={formatDate(detail.open_stage?.due_at)} />
              <KeyValue
                label="Working days left"
                value={
                  detail.deadline_days_left === null ? (
                    "No open clock"
                  ) : detail.deadline_days_left < 0 ? (
                    <span className="font-medium text-danger">
                      {Math.abs(detail.deadline_days_left)} days past target
                    </span>
                  ) : (
                    `${detail.deadline_days_left} days`
                  )
                }
              />
              <KeyValue
                label="Case age"
                value={detail.total_age_days === null ? "Not submitted" : `${detail.total_age_days} days`}
              />
              {detail.locked_fields.length > 0 ? (
                <KeyValue
                  label="Locked while reverted"
                  value={detail.locked_fields.join(", ").replace(/_/g, " ")}
                />
              ) : null}
            </dl>

            <div className="mt-5 border-t border-line pt-5">
              <h3 className="text-[14px] font-medium text-ink">Next permitted action</h3>
              <p className="mt-1 text-[13px] leading-5 text-muted">
                Alerts assist. Only a signed human decision moves this case.
              </p>
              <CaseActions detail={detail} className="mt-3" />
            </div>
          </section>

          <section className="rounded-2xl border border-line bg-surface p-5">
            <Tabs defaultValue="documents">
              <TabsList variant="line" className="flex-wrap">
                <TabsTrigger value="documents">Documents ({detail.documents.length})</TabsTrigger>
                <TabsTrigger value="deficiencies">
                  Deficiencies ({detail.reverts.filter((revert) => revert.status === "open").length})
                </TabsTrigger>
                <TabsTrigger value="evc">EVC</TabsTrigger>
                <TabsTrigger value="obligations">Obligations ({detail.obligations.length})</TabsTrigger>
                <TabsTrigger value="summary">Summary</TabsTrigger>
              </TabsList>

              <TabsContent value="documents" className="pt-4">
                {canUpload ? <UploadDocument applicationId={detail.id} /> : null}
                <div className="mt-4">
                  {detail.documents.length === 0 ? (
                    <p className="text-[13px] leading-5 text-muted">
                      No documents are attached yet. Upload the lease, fire NOC and land papers to
                      start the verification clock.
                    </p>
                  ) : (
                    <ul className="divide-y divide-line">
                      {detail.documents.map((document) => (
                        <li key={document.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                          <div>
                            <p className="text-[14px] text-ink">
                              {DOCUMENT_TYPE_LABELS[document.type] ?? document.type}
                              <span className="ml-2 text-[12px] text-muted">
                                version {document.version}
                              </span>
                            </p>
                            <p className="text-[12px] text-muted">
                              {document.file_name} / uploaded {formatDate(document.created_at)}
                            </p>
                          </div>
                          <div className="flex items-center gap-4">
                            <span className="text-[12px] text-muted">
                              {document.expiry_date
                                ? `Expires ${formatDate(document.expiry_date)}`
                                : "No expiry recorded"}
                            </span>
                            <StatusLabel
                              state={document.verification_state === "verified" ? "verified" : "submitted"}
                              label={
                                document.verification_state === "verified" ? "Verified" : "Unverified"
                              }
                            />
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="deficiencies" className="pt-4">
                {detail.reverts.length === 0 ? (
                  <p className="text-[13px] leading-5 text-muted">
                    No deficiency has been raised on this case.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-3">
                    {detail.reverts.map((revert) => (
                      <li key={revert.id} className="rounded-xl border border-line p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-[14px] font-medium text-ink">{revert.category}</p>
                          <StatusLabel
                            state={revert.status === "open" ? "at_risk" : "closed"}
                            label={revert.status === "open" ? "Awaiting evidence" : "Resolved"}
                          />
                        </div>
                        <p className="mt-1 text-[13px] leading-5 text-muted">{revert.required_evidence}</p>
                        <p className="mt-2 text-[12px] text-muted">
                          Raised by {revert.issued_by_name ?? "an officer"} / due{" "}
                          {formatDate(revert.due_at)} / {revert.aph_reference}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </TabsContent>

              <TabsContent value="evc" className="pt-4">
                {detail.evc ? (
                  <dl>
                    <KeyValue label="Status" value={detail.evc.status.replace(/_/g, " ")} />
                    <KeyValue label="Priority" value={`P${detail.evc.priority}`} />
                    <KeyValue label="Queued" value={formatDateTime(detail.evc.queued_at)} />
                    <KeyValue
                      label="Visit date"
                      value={
                        detail.evc.scheduled_for
                          ? formatDateTime(detail.evc.scheduled_for)
                          : "Not scheduled"
                      }
                    />
                    <KeyValue
                      label="Panel"
                      value={detail.evc.panel.length > 0 ? detail.evc.panel.join(", ") : "Not assigned"}
                    />
                  </dl>
                ) : (
                  <p className="text-[13px] leading-5 text-muted">
                    This case does not need an Expert Visit Committee in the published route.
                  </p>
                )}
              </TabsContent>

              <TabsContent value="obligations" className="pt-4">
                {detail.obligations.length === 0 ? (
                  <p className="text-[13px] leading-5 text-muted">
                    No undertaking is attached. Undertakings are created when an approval is signed.
                  </p>
                ) : (
                  <ul className="divide-y divide-line">
                    {detail.obligations.map((obligation) => (
                      <li key={obligation.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                        <div>
                          <p className="text-[14px] text-ink">{obligation.title}</p>
                          <p className="text-[12px] text-muted">
                            Due {formatDate(obligation.due_at)} / {obligation.source_ref}
                          </p>
                        </div>
                        <StatusLabel
                          state={obligation.state === "overdue" ? "overdue" : obligation.state === "verified" ? "verified" : "not_due"}
                          label={OBLIGATION_STATE_LABELS[obligation.state] ?? obligation.state}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </TabsContent>

              <TabsContent value="summary" className="pt-4">
                <p className="max-w-[70ch] text-[14px] leading-6 text-ink">{detail.summary}</p>
                <p className="mt-3 text-[12px] text-muted">
                  Assembled from recorded data. It is not an approval and carries no statutory weight.
                </p>
              </TabsContent>
            </Tabs>
          </section>
        </div>

        <aside className="flex flex-col gap-6">
          <section
            aria-labelledby="timeline-heading"
            className="rounded-2xl border border-line bg-surface p-5"
          >
            <h2 id="timeline-heading" className="text-[16px] font-semibold leading-6">
              Timeline
            </h2>
            <p className="mt-1 text-[12px] text-muted">Newest first</p>
            <div className="mt-4">
              {detail.history.length === 0 ? (
                <p className="text-[13px] text-muted">No stage change has been recorded yet.</p>
              ) : (
                <Timeline
                  items={[...detail.history].reverse().map((entry) => ({
                    id: entry.id,
                    title: STAGE_LABELS[entry.to_stage] ?? entry.to_stage,
                    meta: `${formatDateTime(entry.created_at)} / ${entry.actor_name ?? "System"}`,
                    body: entry.reason,
                    tone: entry.to_stage === "reverted" ? "danger" : "default",
                  }))}
                />
              )}
            </div>
          </section>

          {openRevert ? (
            <section className="rounded-2xl border border-line bg-surface p-5">
              <h2 className="text-[16px] font-semibold leading-6">Open deficiency</h2>
              <p className="mt-2 text-[13px] leading-5 text-muted">{openRevert.required_evidence}</p>
              <p className="mt-3 text-[12px] text-muted">
                Due {formatDate(openRevert.due_at)}.{" "}
                {user.role === "institution"
                  ? "Upload the evidence, then resubmit."
                  : "The institution has until this date to resubmit."}
              </p>
            </section>
          ) : null}

          <section className="rounded-2xl border border-line bg-surface p-5">
            <h2 className="flex items-center gap-2 text-[16px] font-semibold leading-6">
              <FingerprintSimple size={18} className="text-primary-600" aria-hidden="true" />
              Audit trail
            </h2>
            <p className="mt-1 flex items-center gap-1.5 text-[12px] text-muted">
              {detail.audit_chain_valid ? (
                <>
                  <CheckCircle size={14} weight="fill" className="text-primary-600" aria-hidden="true" />
                  Chain verified, {detail.audit.length} events on this case
                </>
              ) : (
                <span className="text-danger">Chain check failed. Tell the administrator.</span>
              )}
            </p>
            <ul className="mt-3 divide-y divide-line">
              {[...detail.audit].reverse().slice(0, 8).map((event) => (
                <li key={event.id} className="py-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-[13px] text-ink">{event.action.replace(/\./g, " ")}</p>
                    <code className="rounded border border-line px-1.5 py-0.5 text-[11px] text-muted">
                      {event.hash.slice(0, 10)}
                    </code>
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted">
                    {formatDateTime(event.at)} / {event.actor_name ?? "System"} /{" "}
                    {event.role?.replace(/_/g, " ") ?? "no role"}
                  </p>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-2xl border border-primary-200 bg-primary-50 p-5">
            <p className="flex items-center gap-2 text-[13px] font-medium text-primary-900">
              <SealCheck size={16} aria-hidden="true" />
              Human decision, always
            </p>
            <p className="mt-1.5 text-[13px] leading-5 text-muted">
              This system raises alerts and prepares the record. Approvals, returns and closures are
              signed by an official and stored under their name.
            </p>
            <Link
              href={basePath}
              className={cn(
                "mt-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-primary-600 hover:text-primary-700",
              )}
            >
              All applications
              <ArrowSquareOut size={14} aria-hidden="true" />
            </Link>
          </section>
        </aside>
      </div>
    </div>
  );
}
