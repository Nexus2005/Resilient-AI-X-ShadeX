"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { ApiError, apiGet, useAuth } from "@/lib/auth";
import {
  CHECKLIST_STYLES,
  READINESS_STYLES,
  completeIntake,
  confidenceLabel,
  correctClassification,
  correctField,
  downloadWithAuth,
  fetchExtractions,
  fetchIntake,
  processDocument,
  removeDocument,
  type DocumentExtraction,
  type IntakeDocument,
  type IntakeState,
} from "@/lib/intake";
import { fmtBytes } from "@/lib/format";
import { BundleUploader } from "@/components/intake/uploader";
import { DocumentViewer } from "@/components/intake/viewer";
import { Empty, ErrorBox, Spinner } from "@/components/ui";

type Focus = { page: number | null; bbox: number[] | null; key: number } | null;

function messageOf(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    const body = error.detail as { detail?: unknown } | null;
    const detail = body?.detail;
    if (typeof detail === "string") return detail;
    if (detail && typeof detail === "object") {
      const typed = detail as { message?: string; blockers?: string[] };
      if (typed.message) return [typed.message, ...(typed.blockers ?? [])].join(" ");
    }
    return fallback;
  }
  return error instanceof Error ? error.message : fallback;
}

export default function IntakeWorkspacePage() {
  const params = useParams<{ id: string }>();
  const applicationId = params?.id;
  const { token, me } = useAuth();

  const [state, setState] = useState<IntakeState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [extraction, setExtraction] = useState<DocumentExtraction | null>(null);
  const [extractionLoading, setExtractionLoading] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingFieldId, setSavingFieldId] = useState<string | null>(null);
  const [focus, setFocus] = useState<Focus>(null);

  const [processing, setProcessing] = useState<{ done: number; total: number; current: string | null; errors: string[] } | null>(null);
  const [showUploader, setShowUploader] = useState(false);
  const [classification, setClassification] = useState<{ code: string; reason: string } | null>(null);
  const [correctionBusy, setCorrectionBusy] = useState(false);
  const [completionBusy, setCompletionBusy] = useState(false);
  const [completed, setCompleted] = useState<{ version: number; sha256: string } | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!applicationId) return;
    try {
      const data = await fetchIntake(token, applicationId);
      setState(data);
      setError(null);
      setSelectedId((current) => {
        if (current && data.documents.some((doc) => doc.id === current)) return current;
        const firstProcessed = data.documents.find((doc) => doc.status === "processed") ?? data.documents[0];
        return firstProcessed?.id ?? null;
      });
    } catch (e) {
      setError(messageOf(e, "Could not load this application."));
    } finally {
      setLoading(false);
    }
  }, [token, applicationId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 7000);
    return () => clearTimeout(timer);
  }, [notice]);

  const selected = useMemo(
    () => state?.documents.find((doc) => doc.id === selectedId) ?? null,
    [state, selectedId]
  );

  const loadExtraction = useCallback(
    async (documentId: string | null) => {
      if (!documentId) {
        setExtraction(null);
        setDrafts({});
        return;
      }
      setExtractionLoading(true);
      try {
        const payload = await fetchExtractions(token, documentId);
        setExtraction(payload);
        setDrafts(
          Object.fromEntries(
            payload.fields.map((field) => [field.id, field.corrected_value ?? field.normalized_value ?? field.raw_value ?? ""])
          )
        );
      } catch (e) {
        setExtraction(null);
        setDrafts({});
        setError(messageOf(e, "Extracted fields could not be loaded."));
      } finally {
        setExtractionLoading(false);
      }
    },
    [token]
  );

  useEffect(() => {
    void loadExtraction(selectedId);
  }, [selectedId, loadExtraction]);

  const pending = useMemo(
    () => (state?.documents ?? []).filter((doc) => !["processed", "failed", "unreadable"].includes(doc.status)),
    [state]
  );
  const failed = useMemo(
    () => (state?.documents ?? []).filter((doc) => ["failed", "unreadable"].includes(doc.status)),
    [state]
  );
  const canWrite = me?.role !== "auditor";

  async function runProcessing(target: IntakeDocument[]) {
    if (!target.length) return;
    setProcessing({ done: 0, total: target.length, current: target[0].filename, errors: [] });
    let done = 0;
    for (const doc of target) {
      setProcessing((current) => (current ? { ...current, done, current: doc.filename } : current));
      try {
        await processDocument(token, doc.id);
      } catch (e) {
        const message = `${doc.filename}: ${messageOf(e, "processing failed")}`;
        setProcessing((current) => (current ? { ...current, errors: [...current.errors, message] } : current));
      }
      done += 1;
      setProcessing((current) => (current ? { ...current, done } : current));
      await load();
    }
    setProcessing(null);
    await load();
    if (selectedId) await loadExtraction(selectedId);
    setNotice(`Processed ${done} document(s). Results below come from the stored pipeline output.`);
  }

  function selectDocument(doc: IntakeDocument, page?: number | null, bbox?: number[] | null) {
    setSelectedId(doc.id);
    setClassification(null);
    if (page) setFocus({ page, bbox: bbox ?? null, key: Date.now() });
  }

  async function saveField(fieldId: string) {
    const value = (drafts[fieldId] ?? "").trim();
    if (!value) return;
    setSavingFieldId(fieldId);
    try {
      await correctField(token, fieldId, value);
      await loadExtraction(selectedId);
      setNotice("Correction saved. The original extracted value is kept in the history.");
    } catch (e) {
      setError(messageOf(e, "The correction could not be saved."));
    } finally {
      setSavingFieldId(null);
    }
  }

  async function applyClassification(doc: IntakeDocument) {
    if (!classification?.code) return;
    setCorrectionBusy(true);
    try {
      await correctClassification(token, doc.id, classification.code, classification.reason);
      setClassification(null);
      await load();
      await loadExtraction(doc.id);
      setNotice("Document type confirmed.");
    } catch (e) {
      setError(messageOf(e, "The document type could not be updated."));
    } finally {
      setCorrectionBusy(false);
    }
  }

  async function remove(doc: IntakeDocument) {
    if (!window.confirm(`Remove ${doc.filename} from this application? The stored file is retained for audit.`)) return;
    setRemovingId(doc.id);
    try {
      await removeDocument(token, doc.id);
      if (selectedId === doc.id) setSelectedId(null);
      await load();
      setNotice(`${doc.filename} removed from the bundle.`);
    } catch (e) {
      setError(messageOf(e, "The document could not be removed."));
    } finally {
      setRemovingId(null);
    }
  }

  async function finishIntake() {
    if (!applicationId) return;
    setCompletionBusy(true);
    setError(null);
    try {
      const response = await completeIntake(token, applicationId);
      setCompleted({ version: response.manifest.version, sha256: response.manifest.sha256 });
      setNotice(`Intake completed · manifest v${response.manifest.version} generated.`);
      await load();
    } catch (e) {
      setError(messageOf(e, "Intake could not be completed."));
    } finally {
      setCompletionBusy(false);
    }
  }

  async function downloadManifest() {
    if (!applicationId) return;
    try {
      const payload = await apiGet<{ version: number; sha256: string; payload: Record<string, unknown> }>(
        token,
        `/applications/${applicationId}/manifest?generate=true`
      );
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = window.document.createElement("a");
      anchor.href = url;
      anchor.download = `intake-manifest-v${payload.version}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(messageOf(e, "The manifest could not be downloaded."));
    }
  }

  async function downloadReport(format: "json" | "pdf") {
    if (!applicationId || !state) return;
    try {
      await downloadWithAuth(token, `/applications/${applicationId}/intake/report?format=${format}`, `intake-report-${state.application.reference_no}.${format}`);
      setNotice(`${format.toUpperCase()} report downloaded.`);
    } catch (e) {
      setError(messageOf(e, "The report could not be downloaded."));
    }
  }

  if (!applicationId || loading) {
    return (
      <div className="rounded-xl border border-[#E3E8F2] bg-white p-8">
        <Spinner label="Opening workspace…" />
      </div>
    );
  }

  if (!state) {
    return (
      <div className="space-y-4">
        <ErrorBox message={error ?? "This application could not be loaded."} />
        <Link href="/applications" className="text-[12px] text-[#2F6BFF]">
          ← Back to applications
        </Link>
      </div>
    );
  }

  const readiness = READINESS_STYLES[state.readiness.state] ?? READINESS_STYLES.empty;
  const checklistItems = state.checklist.items ?? [];
  // A manifest can exist before sign-off (it is generated on download), so completion is
  // derived from the application status, never from the manifest alone.
  const opened = Boolean(completed) || state.application.status !== "draft";
  const blockers = state.completion.blockers;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="rounded-xl border border-[#E3E8F2] bg-white px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Link href="/applications" className="text-[11px] text-[#7B879F] hover:text-[#0B1230]">
                Applications
              </Link>
              <span className="text-[11px] text-[#C3CBDA]">/</span>
              <h1 className="text-[15px] font-semibold tracking-tight text-[#0B1230]">{state.application.reference_no}</h1>
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium ${readiness.className}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${readiness.dot}`} />
                {state.readiness.state === "ready" ? "Ready to complete" : readiness.label}
              </span>
              <span className="rounded-full border border-[#E3E8F2] px-2 py-0.5 text-[10px] capitalize text-[#5A6580]">
                {state.application.status.replace(/_/g, " ")}
              </span>
            </div>
            <p className="mt-1 truncate text-[12.5px] text-[#5A6580]">{state.application.title}</p>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[10.5px] text-[#7B879F]">
              <span>{state.application.institution.name}</span>
              <span>· {state.application.category_code} · {state.application.academic_year}</span>
              <span>· {state.summary.documents} document(s) · {state.summary.pages_total} page(s)</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => void load()}
              className="rounded-lg border border-[#E3E8F2] px-2.5 py-1.5 text-[11px] text-[#5A6580] hover:bg-[#F4F6FB]"
            >
              Refresh
            </button>
            <button
              onClick={() => setShowUploader((current) => !current)}
              className="rounded-lg border border-[#E3E8F2] px-2.5 py-1.5 text-[11px] text-[#2F6BFF] hover:bg-[#F1F5FF]"
            >
              {showUploader ? "Hide upload" : "Add documents"}
            </button>
            <button
              onClick={() => void runProcessing([...pending, ...failed])}
              disabled={!canWrite || !!processing || (!pending.length && !failed.length)}
              className="rounded-lg bg-[#0B1230] px-3 py-1.5 text-[11.5px] font-semibold text-white hover:bg-[#16224a] disabled:bg-[#AEB6CA]"
            >
              {processing ? `Processing ${processing.done}/${processing.total}…` : failed.length ? `Process · retry ${failed.length}` : "Process documents"}
            </button>
          </div>
        </div>
        {notice && (
          <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11px] text-emerald-800">{notice}</div>
        )}
        <ErrorBox message={error} />
        {showUploader && (
          <div className="mt-3 border-t border-[#EEF1F7] pt-3">
            <BundleUploader
              token={token}
              applicationId={state.application.id}
              maxFileMb={state.module.limits.max_file_mb}
              onUploaded={() => void load()}
            />
          </div>
        )}
      </div>

      {/* Workspace */}
      <div className="grid gap-3 xl:grid-cols-[300px_minmax(0,1fr)_360px]">
        {/* Left: checklist + documents */}
        <div className="space-y-3">
          <section className="rounded-xl border border-[#E3E8F2] bg-white">
            <div className="flex items-center justify-between border-b border-[#EEF1F7] px-3 py-2">
              <h2 className="text-[12px] font-semibold text-[#0B1230]">Required documents</h2>
              <span className="text-[10px] text-[#7B879F]">
                {state.checklist.counts.satisfied ?? 0}/{checklistItems.length} satisfied
              </span>
            </div>
            {checklistItems.length === 0 ? (
              <div className="p-3 text-[11px] leading-4 text-[#7B879F]">
                {state.checklist.reason ?? "No checklist configured for this category."}
              </div>
            ) : (
              <ul className="divide-y divide-[#F1F4FA]">
                {checklistItems.map((item) => {
                  const matched = item.documents?.[0];
                  const doc = matched ? state.documents.find((entry) => entry.id === matched.id) : undefined;
                  return (
                    <li key={`${item.category_code}-${item.label}`} className="px-3 py-2">
                      <button
                        onClick={() => (doc ? selectDocument(doc) : setShowUploader(true))}
                        className="w-full text-left"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-[11.5px] leading-4 text-[#0B1230]">{item.label}</span>
                          <span
                            className={`shrink-0 rounded border px-1.5 py-0.5 text-[9.5px] font-medium capitalize ${
                              CHECKLIST_STYLES[item.status] ?? "border-slate-200 bg-slate-50 text-slate-600"
                            }`}
                          >
                            {item.status.replace(/_/g, " ")}
                          </span>
                        </div>
                        <div className="mt-0.5 truncate text-[10px] text-[#98A2B8]">
                          {doc ? doc.filename : item.requirement === "required" ? "Upload required" : "Optional"}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="overflow-hidden rounded-xl border border-[#E3E8F2] bg-white">
            <div className="flex items-center justify-between border-b border-[#EEF1F7] px-3 py-2">
              <h2 className="text-[12px] font-semibold text-[#0B1230]">Uploaded documents</h2>
              <span className="text-[10px] text-[#7B879F]">{state.documents.length}</span>
            </div>
            {state.documents.length === 0 ? (
              <div className="p-3">
                <Empty>No documents yet. Upload the bundle to begin.</Empty>
              </div>
            ) : (
              <ul className="max-h-[360px] divide-y divide-[#F1F4FA] overflow-y-auto">
                {state.documents.map((doc) => {
                  const active = doc.id === selectedId;
                  return (
                    <li key={doc.id}>
                      <button
                        onClick={() => selectDocument(doc)}
                        className={`w-full px-3 py-2 text-left transition ${
                          active ? "bg-[#F1F5FF]" : "hover:bg-[#FAFBFE]"
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded border border-[#E3E8F2] bg-white text-[8px] font-semibold uppercase text-[#5A6580]">
                            {doc.format ?? "?"}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className={`truncate text-[11.5px] ${active ? "font-semibold text-[#0B1230]" : "text-[#3B4A6B]"}`}>
                              {doc.filename}
                            </div>
                            <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[9.5px] text-[#98A2B8]">
                              <span>{doc.page_count ?? 0} page(s)</span>
                              <span>· {fmtBytes(doc.size_bytes)}</span>
                              {doc.effective_category_label && <span className="truncate">· {doc.effective_category_label}</span>}
                            </div>
                          </div>
                          <DocStatus status={doc.status} />
                        </div>
                        {doc.classification.needs_review && !doc.correction && (
                          <div className="mt-1 rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[9.5px] text-amber-900">
                            Type to confirm · {confidenceLabel(doc.classification.confidence)}
                          </div>
                        )}
                        {doc.processing_error && (
                          <div className="mt-1 line-clamp-2 text-[9.5px] leading-4 text-rose-600">{doc.processing_error}</div>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {processing && (
              <div className="border-t border-[#EEF1F7] bg-[#FAFBFE] px-3 py-2">
                <div className="h-1.5 overflow-hidden rounded bg-[#E7ECF6]">
                  <div
                    className="h-full bg-[#2F6BFF] transition-all"
                    style={{ width: `${processing.total ? (processing.done / processing.total) * 100 : 0}%` }}
                  />
                </div>
                <div className="mt-1 truncate text-[10px] text-[#5A6580]">
                  {processing.current ? `Running pipeline on ${processing.current}` : "Finishing…"}
                </div>
                {processing.errors.map((message) => (
                  <div key={message} className="mt-1 text-[9.5px] leading-4 text-rose-700">
                    {message}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Center: viewer */}
        <div className="min-h-[560px] xl:h-[calc(100vh-14rem)]">
          <DocumentViewer token={token} document={selected} focus={focus} />
        </div>

        {/* Right: extracted fields + results */}
        <div className="min-w-0 space-y-3">
          <section className="rounded-xl border border-[#E3E8F2] bg-white">
            <div className="flex items-center justify-between border-b border-[#EEF1F7] px-3 py-2">
              <div>
                <h2 className="text-[12px] font-semibold text-[#0B1230]">Extracted details</h2>
                <p className="text-[10px] text-[#7B879F]">
                  {selected
                    ? selected.status === "processed"
                      ? "Prefilled from the document. Correct anything that was read wrongly."
                      : "Process this document to extract fields."
                    : "Select a document to see its fields."}
                </p>
              </div>
              {extractionLoading && <Spinner label="" />}
            </div>

            {selected && (
              <div className="border-b border-[#EEF1F7] px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[10px] uppercase tracking-wide text-[#98A2B8]">Detected type</div>
                    <div className="truncate text-[12px] font-medium text-[#0B1230]">
                      {selected.effective_category_label ?? "Unclassified"}
                      {selected.classification.needs_review && !selected.correction && (
                        <span className="ml-1.5 rounded border border-amber-200 bg-amber-50 px-1 py-0.5 text-[9px] text-amber-900">needs review</span>
                      )}
                      {selected.correction && (
                        <span className="ml-1.5 rounded border border-[#E3E8F2] bg-[#F4F6FB] px-1 py-0.5 text-[9px] text-[#5A6580]">confirmed by you</span>
                      )}
                    </div>
                    <div className="text-[10px] text-[#98A2B8]">
                      confidence {confidenceLabel(selected.classification.confidence)} · {selected.classification.method ?? "not classified"}
                    </div>
                  </div>
                  <button
                    onClick={() =>
                      setClassification((current) =>
                        current ? null : { code: selected.effective_category_code ?? "", reason: "" }
                      )
                    }
                    disabled={!canWrite || selected.status !== "processed"}
                    className="rounded border border-[#E3E8F2] px-2 py-1 text-[10.5px] text-[#2F6BFF] hover:bg-[#F1F5FF] disabled:opacity-40"
                  >
                    Change type
                  </button>
                </div>
                {classification && (
                  <div className="mt-2 space-y-1.5 rounded-lg border border-[#E3E8F2] bg-[#FAFBFE] p-2">
                    <select
                      value={classification.code}
                      onChange={(e) => setClassification({ ...classification, code: e.target.value })}
                      className="w-full rounded border border-[#E3E8F2] bg-white px-2 py-1 text-[11px] text-[#0B1230] focus:border-[#2F6BFF] focus:outline-none"
                    >
                      <option value="">Select a document type</option>
                      {state.checklist.items.map((item) => (
                        <option key={item.category_code} value={item.category_code}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                    <input
                      value={classification.reason}
                      onChange={(e) => setClassification({ ...classification, reason: e.target.value })}
                      placeholder="Why is this the correct type? (optional)"
                      className="w-full rounded border border-[#E3E8F2] bg-white px-2 py-1 text-[11px] focus:border-[#2F6BFF] focus:outline-none"
                    />
                    <div className="flex justify-end gap-1.5">
                      <button onClick={() => setClassification(null)} className="rounded px-2 py-1 text-[10.5px] text-[#7B879F] hover:text-[#0B1230]">
                        Cancel
                      </button>
                      <button
                        onClick={() => void applyClassification(selected)}
                        disabled={!classification.code || correctionBusy}
                        className="rounded bg-[#2F6BFF] px-2.5 py-1 text-[10.5px] font-semibold text-white disabled:bg-[#A9BEF5]"
                      >
                        {correctionBusy ? "Saving…" : "Save type"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="max-h-[420px] overflow-y-auto px-3 py-2">
              {!selected ? (
                <p className="py-4 text-center text-[11px] text-[#98A2B8]">No document selected.</p>
              ) : extractionLoading ? (
                <Spinner label="Loading extracted fields…" />
              ) : !extraction || extraction.fields.length === 0 ? (
                <p className="py-3 text-[11px] leading-5 text-[#7B879F]">
                  {selected.status === "processed"
                    ? "No fields were extracted for this document type. The document itself is still viewable on the left."
                    : "Run processing to extract fields from this document."}
                </p>
              ) : (
                <div className="space-y-2.5">
                  {extraction.fields.map((field) => {
                    const value = drafts[field.id] ?? "";
                    const dirty = value !== (field.corrected_value ?? field.normalized_value ?? field.raw_value ?? "");
                    const uncertain = field.status === "missing" || field.status === "low_confidence";
                    return (
                      <div key={field.id}>
                        <div className="flex items-center justify-between gap-2">
                          <label className="text-[10px] font-medium uppercase tracking-wide text-[#7B879F]">{field.label}</label>
                          <div className="flex items-center gap-1.5">
                            {field.status === "missing" ? (
                              <span className="text-[9px] text-rose-600">not found</span>
                            ) : (
                              <span
                                className={`text-[9px] ${
                                  field.confidence != null && field.confidence >= 0.75 ? "text-emerald-700" : "text-amber-700"
                                }`}
                              >
                                {confidenceLabel(field.confidence)}
                              </span>
                            )}
                            {field.page_no && (
                              <button
                                onClick={() => setFocus({ page: field.page_no, bbox: field.bbox, key: Date.now() })}
                                className="rounded border border-[#E3E8F2] px-1 py-0.5 text-[9px] text-[#5A6580] hover:bg-[#F4F6FB]"
                                title="Show this value in the document"
                              >
                                p{field.page_no}
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="mt-0.5 flex items-center gap-1.5">
                          <input
                            value={value}
                            onChange={(e) => setDrafts((current) => ({ ...current, [field.id]: e.target.value }))}
                            onFocus={() => field.page_no && setFocus({ page: field.page_no, bbox: field.bbox, key: Date.now() })}
                            placeholder={field.status === "missing" ? "Not present in the document" : ""}
                            disabled={!canWrite}
                            className={`w-full rounded border px-2 py-1.5 text-[11.5px] text-[#0B1230] focus:outline-none ${
                              uncertain ? "border-amber-300 bg-amber-50/50" : "border-[#E3E8F2] bg-white"
                            } focus:border-[#2F6BFF]`}
                          />
                          <button
                            onClick={() => void saveField(field.id)}
                            disabled={!dirty || !value.trim() || savingFieldId === field.id || !canWrite}
                            className="shrink-0 rounded border border-[#E3E8F2] px-2 py-1.5 text-[10px] text-[#2F6BFF] hover:bg-[#F1F5FF] disabled:opacity-30"
                          >
                            {savingFieldId === field.id ? "…" : "Save"}
                          </button>
                        </div>
                        <div className="mt-0.5 flex items-center gap-1.5 text-[9px] text-[#98A2B8]">
                          <span>{field.method.replace(/_/g, " ")}</span>
                          {field.corrected_value && <span className="text-emerald-700">· corrected</span>}
                          {field.raw_value && field.corrected_value && field.raw_value !== field.corrected_value && (
                            <span className="truncate">· original “{field.raw_value}”</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>

          {selected && (
            <section className="rounded-xl border border-[#E3E8F2] bg-white">
              <div className="flex items-center justify-between border-b border-[#EEF1F7] px-3 py-2">
                <h2 className="text-[12px] font-semibold text-[#0B1230]">Review result</h2>
                <button
                  onClick={() => void runProcessing([selected])}
                  disabled={!canWrite || !!processing || selected.status === "processing"}
                  className="rounded border border-[#E3E8F2] px-2 py-0.5 text-[10px] text-[#2F6BFF] hover:bg-[#F1F5FF] disabled:opacity-40"
                >
                  Retry file
                </button>
              </div>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 px-3 py-2 text-[10.5px]">
                <Row label="Pages" value={String(selected.page_count ?? 0)} />
                <Row label="Text" value={selected.ocr_used ? "OCR" : selected.text_layer_chars ? "Text layer" : "None"} />
                <Row label="Format" value={(selected.format ?? "—").toUpperCase()} />
                <Row label="SHA-256" value={selected.sha256 ? `${selected.sha256.slice(0, 10)}…` : "—"} />
              </dl>
              {selected.warnings.length > 0 && (
                <ul className="space-y-1 border-t border-[#EEF1F7] px-3 py-2">
                  {selected.warnings.map((warning) => {
                    const target = selected.pages.find((page) => page.flags.includes(warning.code))?.page_no;
                    return (
                      <li key={warning.code}>
                        <button
                          onClick={() => setFocus({ page: target ?? 1, bbox: null, key: Date.now() })}
                          className={`w-full rounded border px-2 py-1 text-left text-[10px] leading-4 ${
                            warning.severity === "high"
                              ? "border-rose-200 bg-rose-50 text-rose-800"
                              : "border-amber-200 bg-amber-50 text-amber-900"
                          }`}
                        >
                          {warning.message}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              <div className="flex items-center justify-between gap-2 border-t border-[#EEF1F7] px-3 py-2">
                <span className="text-[10px] text-[#98A2B8]">{selected.duplicate_of.length > 0 ? "Byte-identical copy in bundle" : "No duplicate detected"}</span>
                <button
                  onClick={() => void remove(selected)}
                  disabled={!canWrite || removingId === selected.id}
                  className="rounded border border-[#E3E8F2] px-2 py-0.5 text-[10px] text-rose-600 hover:bg-rose-50 disabled:opacity-40"
                >
                  {removingId === selected.id ? "Removing…" : "Remove"}
                </button>
              </div>
            </section>
          )}
        </div>
      </div>

      {/* Completion */}
      <section className="rounded-xl border border-[#E3E8F2] bg-white px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-5">
            <Tally label="Files received" value={state.summary.documents} />
            <Tally label="Pages processed" value={state.summary.pages_total} />
            <Tally label="Needs review" value={state.summary.documents_needs_review} tone={state.summary.documents_needs_review ? "amber" : undefined} />
            <Tally label="Missing evidence" value={state.summary.checklist_required_missing} tone={state.summary.checklist_required_missing ? "rose" : undefined} />
            <Tally label="Failures" value={state.summary.documents_failed} tone={state.summary.documents_failed ? "rose" : undefined} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex overflow-hidden rounded-lg border border-[#E3E8F2]">
              <button onClick={() => void downloadManifest()} className="px-2.5 py-1.5 text-[10.5px] text-[#5A6580] hover:bg-[#F4F6FB]">
                Manifest
              </button>
              <button onClick={() => void downloadReport("json")} className="border-l border-[#E3E8F2] px-2.5 py-1.5 text-[10.5px] text-[#5A6580] hover:bg-[#F4F6FB]">
                JSON
              </button>
              <button onClick={() => void downloadReport("pdf")} className="border-l border-[#E3E8F2] px-2.5 py-1.5 text-[10.5px] text-[#5A6580] hover:bg-[#F4F6FB]">
                PDF
              </button>
            </div>
            <button
              onClick={() => void finishIntake()}
              disabled={!canWrite || completionBusy || !state.completion.can_complete || opened}
              className="rounded-lg bg-[#2F6BFF] px-4 py-2 text-[12px] font-semibold text-white hover:bg-[#2557d6] disabled:bg-[#A9BEF5]"
            >
              {completionBusy ? "Completing…" : opened ? "Intake completed" : "Complete intake"}
            </button>
          </div>
        </div>
        {!state.completion.can_complete && blockers.length > 0 && (
          <ul className="mt-2 space-y-0.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[10.5px] leading-4 text-amber-900">
            {blockers.map((blocker) => (
              <li key={blocker}>• {blocker}</li>
            ))}
          </ul>
        )}
        {opened && (
          <p className="mt-2 text-[10.5px] leading-4 text-[#5A6580]">
            Intake stage complete. {state.manifest ? `Manifest v${state.manifest.version} · SHA-256 ${state.manifest.sha256.slice(0, 12)}…` : ""} This confirms the intake stage only — it is not a determination of authenticity or regulatory compliance.
          </p>
        )}
        {state.readiness.reasons.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {state.readiness.reasons.map((reason) => (
              <span key={reason} className="rounded-full border border-[#E3E8F2] bg-[#FAFBFE] px-2 py-0.5 text-[9.5px] text-[#5A6580]">
                {reason}
              </span>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function DocStatus({ status }: { status: string }) {
  const tone =
    status === "processed"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : status === "failed" || status === "unreadable"
        ? "border-rose-200 bg-rose-50 text-rose-700"
        : status === "processing"
          ? "border-blue-200 bg-blue-50 text-blue-700"
          : "border-amber-200 bg-amber-50 text-amber-800";
  const label =
    status === "uploaded" ? "not processed" : status === "queued" ? "queued" : status.replace(/_/g, " ");
  return <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-medium capitalize ${tone}`}>{label}</span>;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-[#98A2B8]">{label}</dt>
      <dd className="truncate text-[#3B4A6B]">{value}</dd>
    </div>
  );
}

function Tally({ label, value, tone }: { label: string; value: number; tone?: "amber" | "rose" }) {
  const toneClass = tone === "rose" ? "text-rose-700" : tone === "amber" ? "text-amber-700" : "text-[#0B1230]";
  return (
    <div className="rounded-lg border border-[#F1F4FA] bg-[#FAFBFE] px-2 py-1.5">
      <div className={`text-[15px] font-semibold leading-tight ${toneClass}`}>{value}</div>
      <div className="text-[9px] uppercase tracking-wide text-[#98A2B8]">{label}</div>
    </div>
  );
}
