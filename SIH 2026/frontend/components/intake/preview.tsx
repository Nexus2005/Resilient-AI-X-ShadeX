"use client";

import { useEffect, useState } from "react";
import { confidenceLabel, renderPageBlobUrl, type IntakeDocument } from "@/lib/intake";

export function DocumentPreview({
  token,
  document: doc,
  onClose,
}: {
  token: string | null;
  document: IntakeDocument;
  onClose: () => void;
}) {
  const [page, setPage] = useState(1);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pageCount = Math.max(1, doc.page_count ?? doc.pages.length);

  useEffect(() => {
    let revoked: string | null = null;
    let cancelled = false;
    setUrl(null);
    setError(null);
    renderPageBlobUrl(token, doc.id, page)
      .then((objectUrl) => {
        if (cancelled) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        revoked = objectUrl;
        setUrl(objectUrl);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Preview unavailable"));
    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [token, doc.id, page]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const pageMeta = doc.pages.find((p) => p.page_no === page);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#050917]/70 p-3" role="dialog" aria-modal="true">
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-[#E3E8F2] px-5 py-3">
          <div className="min-w-0">
            <div className="truncate text-[13px] font-semibold text-[#0B1230]">{doc.filename}</div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px] text-[#7B879F]">
              <span className="uppercase">{doc.format}</span>
              <span>{doc.page_count ?? 0} page(s)</span>
              <span>SHA-256 {doc.sha256?.slice(0, 12)}…</span>
              <span>{doc.effective_category_label ?? "Unclassified"}</span>
              <span>confidence {confidenceLabel(doc.classification.confidence)}</span>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg border border-[#E3E8F2] px-2.5 py-1 text-[11px] text-[#5A6580] hover:bg-[#F4F6FB]">
            Close ✕
          </button>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[1fr_300px]">
          <div className="flex min-h-[320px] items-center justify-center overflow-auto bg-[#EEF1F7] p-4">
            {error ? (
              <div className="rounded-lg bg-white px-4 py-3 text-[12px] text-rose-700">{error}</div>
            ) : url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={url} alt={`Page ${page} of ${doc.filename}`} className="max-h-[68vh] w-auto rounded shadow-lg" />
            ) : (
              <div className="text-[12px] text-[#7B879F]">Rendering page…</div>
            )}
          </div>

          <aside className="flex min-h-0 flex-col border-t border-[#E3E8F2] lg:border-l lg:border-t-0">
            <div className="flex items-center justify-between border-b border-[#EEF1F7] px-3 py-2">
              <button
                className="rounded border border-[#E3E8F2] px-2 py-1 text-[11px] disabled:opacity-40"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                ← Prev
              </button>
              <span className="text-[11px] text-[#5A6580]">
                Page {page} / {pageCount}
              </span>
              <button
                className="rounded border border-[#E3E8F2] px-2 py-1 text-[11px] disabled:opacity-40"
                onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                disabled={page >= pageCount}
              >
                Next →
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-[#7B879F]">Page evidence</div>
              <div className="mt-2 space-y-1.5 text-[11px] text-[#3B4A6B]">
                <div>
                  Text source: <strong>{pageMeta?.text_source ?? "—"}</strong>
                </div>
                <div>
                  Extractable characters: <strong>{pageMeta?.text_chars ?? 0}</strong>
                </div>
                <div>
                  OCR confidence: <strong>{confidenceLabel(pageMeta?.ocr_confidence)}</strong>
                </div>
                <div className="flex flex-wrap gap-1 pt-1">
                  {(pageMeta?.flags ?? []).length === 0 ? (
                    <span className="rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-700">
                      no page flags
                    </span>
                  ) : (
                    pageMeta?.flags.map((flag) => (
                      <span key={flag} className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-800">
                        {flag.replace(/_/g, " ")}
                      </span>
                    ))
                  )}
                </div>
              </div>

              {pageMeta?.preview && (
                <>
                  <div className="mt-4 text-[10px] font-semibold uppercase tracking-wide text-[#7B879F]">
                    Extracted text (preview)
                  </div>
                  <p className="mt-2 whitespace-pre-wrap rounded-lg bg-[#FAFBFE] p-2 text-[10.5px] leading-5 text-[#54607C]">
                    {pageMeta.preview}
                  </p>
                </>
              )}

              {doc.warnings.length > 0 && (
                <>
                  <div className="mt-4 text-[10px] font-semibold uppercase tracking-wide text-[#7B879F]">
                    Document warnings
                  </div>
                  <ul className="mt-2 space-y-1.5">
                    {doc.warnings.map((warning) => (
                      <li key={warning.code} className="rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-[10.5px] leading-4 text-amber-900">
                        {warning.message}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
