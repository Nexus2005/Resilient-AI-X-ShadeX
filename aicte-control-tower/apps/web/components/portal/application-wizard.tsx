"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, FileArrowUp, SealCheck } from "@phosphor-icons/react";

import { PageHeader } from "@/components/domain/page-header";
import { Button } from "@/components/ui/button";
import {
  APPLICATION_TYPE_LABELS,
  DOCUMENT_TYPE_LABELS,
  type ApplicationMeta,
} from "@/lib/types";
import { cn } from "cn";

const STEPS = ["Basics", "Documents", "Review", "Submit"] as const;

const TYPE_NOTES: Record<string, string> = {
  new_institution: "A first approval for a new technical institution.",
  extension_of_approval: "Continue an approval that is coming to its end.",
  increase_in_intake: "Raise the sanctioned intake for one or more programmes.",
  change_of_site: "Move the institution to a new campus or additional site.",
};

function routeLabel(route: string[]): string {
  return route
    .map((entry) =>
      entry === "sac_shc" ? "SAC/SHC" : entry === "evc" ? "EVC" : "Scrutiny",
    )
    .join(" then ");
}

export function ApplicationWizard({ meta }: { meta: ApplicationMeta }) {
  const router = useRouter();
  const types = Object.keys(meta.application_types);
  const [step, setStep] = useState(0);
  const [type, setType] = useState(types[0] ?? "new_institution");
  const [academicYear, setAcademicYear] = useState(meta.academic_year);
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [created, setCreated] = useState<{ id: string; app_no: string } | null>(null);

  const requiredDocuments = meta.required_documents[type] ?? [];
  const route = meta.application_types[type] ?? [];

  function chooseFile(documentType: string, file: File | null) {
    setError(null);
    if (!file) {
      setFiles((current) => ({ ...current, [documentType]: null }));
      return;
    }
    const allowed = ["application/pdf", "image/jpeg", "image/png"];
    if (!allowed.includes(file.type)) {
      setError(`${file.name} is not a PDF, JPEG or PNG.`);
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError(`${file.name} is larger than 10 MB.`);
      return;
    }
    setFiles((current) => ({ ...current, [documentType]: file }));
  }

  async function submit() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/proxy/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, academic_year: academicYear }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          typeof body.detail === "string" ? body.detail : "The application was not created.",
        );
      }
      setCreated({ id: body.id, app_no: body.app_no });

      const chosen = Object.entries(files).filter((entry): entry is [string, File] =>
        Boolean(entry[1]),
      );
      for (const [documentType, file] of chosen) {
        const data = new FormData();
        data.append("file", file);
        data.append("type", documentType);
        data.append("application_id", body.id);
        const upload = await fetch("/api/proxy/documents", { method: "POST", body: data });
        if (!upload.ok) {
          const detail = await upload.json().catch(() => ({}));
          throw new Error(
            typeof detail.detail === "string"
              ? `${detail.detail} The application was saved without this document.`
              : "A document upload failed. The application was saved but not submitted.",
          );
        }
      }

      const submitted = await fetch(`/api/proxy/applications/${body.id}/submit`, {
        method: "POST",
      });
      if (!submitted.ok) {
        const detail = await submitted.json().catch(() => ({}));
        throw new Error(
          typeof detail.detail === "string"
            ? detail.detail
            : "The application was saved but could not be submitted.",
        );
      }
      router.push(`/institution/applications/${body.id}`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The application was not created.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumbs={[
          { label: "Institution" },
          { label: "Applications", href: "/institution/applications" },
          { label: "New application" },
        ]}
        title="New application"
        description="Four steps. The published rules decide the route the moment you submit."
        actions={
          <Link
            href="/institution/applications"
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-primary-600 hover:text-primary-700"
          >
            <ArrowLeft size={14} aria-hidden="true" />
            All applications
          </Link>
        }
      />

      <ol className="grid gap-2 sm:grid-cols-4" aria-label="Steps">
        {STEPS.map((label, index) => {
          const done = index < step;
          const current = index === step;
          return (
            <li
              key={label}
              aria-current={current ? "step" : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-xl border px-3 py-2.5",
                current
                  ? "border-primary-600 bg-surface"
                  : done
                    ? "border-line bg-surface"
                    : "border-line bg-primary-50/60",
              )}
            >
              <span
                className={cn(
                  "flex size-6 items-center justify-center rounded-full text-[12px] font-semibold",
                  done
                    ? "bg-primary-600 text-white"
                    : current
                      ? "bg-primary-100 text-primary-900"
                      : "bg-surface text-muted",
                )}
              >
                {done ? <Check size={13} weight="bold" aria-hidden="true" /> : index + 1}
              </span>
              <span
                className={cn(
                  "text-[13px]",
                  current ? "font-medium text-primary-900" : "text-muted",
                )}
              >
                {label}
              </span>
            </li>
          );
        })}
      </ol>

      <div className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
        {step === 0 ? (
          <div className="flex flex-col gap-5">
            <div>
              <h2 className="text-[18px] font-semibold leading-6">What are you applying for?</h2>
              <p className="mt-1 text-[13px] text-muted">
                The type sets the route and the stage targets from the published rule version.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {types.map((option) => (
                <label
                  key={option}
                  className={cn(
                    "flex cursor-pointer flex-col gap-1 rounded-xl border p-4 transition-colors",
                    type === option
                      ? "border-primary-600 bg-primary-50"
                      : "border-line hover:border-primary-200",
                  )}
                >
                  <span className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="application-type"
                      value={option}
                      checked={type === option}
                      onChange={() => setType(option)}
                      className="size-4 accent-primary-600"
                    />
                    <span className="text-[14px] font-medium text-ink">
                      {APPLICATION_TYPE_LABELS[option] ?? option}
                    </span>
                  </span>
                  <span className="pl-6 text-[12px] leading-5 text-muted">
                    {TYPE_NOTES[option] ?? "Filed under the published rules."}
                  </span>
                  <span className="pl-6 text-[12px] text-primary-700">
                    Route: {routeLabel(meta.application_types[option] ?? [])}
                  </span>
                </label>
              ))}
            </div>

            <div className="flex flex-col gap-1.5 sm:w-56">
              <label htmlFor="academic-year" className="text-[13px] font-medium text-ink">
                Academic year
              </label>
              <select
                id="academic-year"
                value={academicYear}
                onChange={(event) => setAcademicYear(event.target.value)}
                className="h-11 w-full rounded-[12px] border border-line bg-surface px-3 text-[14px] focus-visible:border-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600/30"
              >
                {meta.academic_years.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
              <p className="text-[12px] text-muted">
                Rule version in force: {meta.rule_version ?? "none published"}
              </p>
            </div>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="flex flex-col gap-5">
            <div>
              <h2 className="text-[18px] font-semibold leading-6">
                Documents required for this application
              </h2>
              <p className="mt-1 text-[13px] text-muted">
                PDF, JPEG or PNG up to 10 MB. Each file is stored once and hashed.
              </p>
            </div>

            {requiredDocuments.length === 0 ? (
              <p className="rounded-xl border border-line bg-primary-50 p-4 text-[13px] leading-5 text-muted">
                The published rules do not list documents for this type. You can attach supporting
                papers from the case page after submission.
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {requiredDocuments.map((documentType) => (
                  <li
                    key={documentType}
                    className="flex flex-col gap-2 rounded-xl border border-line p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="text-[14px] font-medium text-ink">
                        {DOCUMENT_TYPE_LABELS[documentType] ?? documentType}
                      </p>
                      <p className="text-[12px] text-muted">
                        {files[documentType]
                          ? `${files[documentType]?.name} selected`
                          : "No file selected"}
                      </p>
                    </div>
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-line px-3 py-2 text-[13px] font-medium text-primary-900 hover:bg-primary-50">
                      <FileArrowUp size={16} aria-hidden="true" />
                      Choose file
                      <input
                        type="file"
                        accept="application/pdf,image/jpeg,image/png"
                        className="sr-only"
                        onChange={(event) =>
                          chooseFile(documentType, event.target.files?.[0] ?? null)
                        }
                      />
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}

        {step === 2 ? (
          <div className="flex flex-col gap-5">
            <div>
              <h2 className="text-[18px] font-semibold leading-6">Review</h2>
              <p className="mt-1 text-[13px] text-muted">
                Check the type and the attachments before you submit.
              </p>
            </div>
            <dl className="rounded-xl border border-line">
              <div className="flex items-center justify-between gap-4 border-b border-line px-4 py-3">
                <dt className="text-[13px] text-muted">Application type</dt>
                <dd className="text-[14px] text-ink">
                  {APPLICATION_TYPE_LABELS[type] ?? type}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4 border-b border-line px-4 py-3">
                <dt className="text-[13px] text-muted">Academic year</dt>
                <dd className="text-[14px] text-ink">{academicYear}</dd>
              </div>
              <div className="flex items-center justify-between gap-4 border-b border-line px-4 py-3">
                <dt className="text-[13px] text-muted">Route</dt>
                <dd className="text-[14px] text-ink">{routeLabel(route)}</dd>
              </div>
              <div className="flex items-start justify-between gap-4 px-4 py-3">
                <dt className="text-[13px] text-muted">Documents attached</dt>
                <dd className="text-right text-[14px] text-ink">
                  {Object.values(files).filter(Boolean).length === 0
                    ? "None"
                    : Object.entries(files)
                        .filter((entry): entry is [string, File] => Boolean(entry[1]))
                        .map(
                          ([documentType, file]) =>
                            `${DOCUMENT_TYPE_LABELS[documentType] ?? documentType} (${file.name})`,
                        )
                        .join(", ")}
                </dd>
              </div>
            </dl>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="flex flex-col gap-4">
            <div>
              <h2 className="text-[18px] font-semibold leading-6">Submit</h2>
              <p className="mt-1 text-[13px] leading-5 text-muted">
                The application is numbered, routed by the published rules and placed in the
                scrutiny queue. A Regional Officer can return it with reasons.
              </p>
            </div>
            <p className="flex items-start gap-2 rounded-xl bg-primary-50 p-4 text-[13px] leading-5 text-ink">
              <SealCheck size={18} className="mt-0.5 shrink-0 text-primary-600" aria-hidden="true" />
              Submitting is recorded in the audit trail with your name. Nothing is approved at this
              step.
            </p>
            {created ? (
              <p className="text-[13px] text-muted">
                {created.app_no} was saved. Finishing the submission now.
              </p>
            ) : null}
          </div>
        ) : null}

        {error ? (
          <p
            aria-live="polite"
            className="mt-4 rounded-xl border border-danger/40 p-3 text-[13px] text-danger"
          >
            {error}
          </p>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
          <Button
            variant="ghost"
            size="lg"
            onClick={() => setStep((value) => Math.max(0, value - 1))}
            disabled={step === 0 || pending}
          >
            <ArrowLeft size={16} aria-hidden="true" />
            Back
          </Button>
          {step < STEPS.length - 1 ? (
            <Button size="lg" onClick={() => setStep((value) => value + 1)} disabled={pending}>
              Continue
              <ArrowRight size={16} aria-hidden="true" />
            </Button>
          ) : (
            <Button size="lg" onClick={submit} disabled={pending}>
              {pending ? "Submitting" : "Submit application"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
