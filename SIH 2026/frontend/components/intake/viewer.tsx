"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE, authHeaders } from "@/lib/auth";
import { confidenceLabel, renderPageBlobUrl, type IntakeDocument } from "@/lib/intake";

type Focus = { page: number | null; bbox: number[] | null; key: number } | null;

const MAX_THUMBNAILS = 24;

export function DocumentViewer({
  token,
  document: doc,
  focus,
}: {
  token: string | null;
  document: IntakeDocument | null;
  focus: Focus;
}) {
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(100);
  const [rotation, setRotation] = useState(0);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [thumbs, setThumbs] = useState<Record<number, string>>({});
  const [thumbError, setThumbError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const shellRef = useRef<HTMLDivElement>(null);

  const pageCount = Math.max(1, doc?.page_count ?? doc?.pages.length ?? 1);

  useEffect(() => {
    setPage(1);
    setRotation(0);
    setZoom(100);
  }, [doc?.id]);

  useEffect(() => {
    if (!focus || focus.page == null || !doc) return;
    if (focus.page >= 1 && focus.page <= pageCount) setPage(focus.page);
  }, [focus, doc, pageCount]);

  // Current page render (the actual uploaded PDF page, rendered by the backend).
  useEffect(() => {
    if (!doc) {
      setUrl(null);
      return;
    }
    let cancelled = false;
    let created: string | null = null;
    setLoading(true);
    setError(null);
    renderPageBlobUrl(token, doc.id, page)
      .then((objectUrl) => {
        if (cancelled) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        created = objectUrl;
        setUrl(objectUrl);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "This page could not be rendered."))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [token, doc, page]);

  // Page thumbnails, rendered one at a time so a large bundle cannot flood the API.
  useEffect(() => {
    if (!doc) {
      setThumbs({});
      return;
    }
    let cancelled = false;
    const created: string[] = [];
    setThumbs({});
    setThumbError(null);
    (async () => {
      const limit = Math.min(pageCount, MAX_THUMBNAILS);
      for (let index = 1; index <= limit; index += 1) {
        if (cancelled) return;
        try {
          const objectUrl = await renderPageBlobUrl(token, doc.id, index);
          if (cancelled) {
            URL.revokeObjectURL(objectUrl);
            return;
          }
          created.push(objectUrl);
          setThumbs((current) => ({ ...current, [index]: objectUrl }));
        } catch (e) {
          if (!cancelled) setThumbError(e instanceof Error ? e.message : "Thumbnails unavailable");
          return;
        }
      }
    })();
    return () => {
      cancelled = true;
      created.forEach((objectUrl) => URL.revokeObjectURL(objectUrl));
    };
  }, [token, doc, pageCount]);

  const openOriginal = useCallback(async () => {
    if (!doc) return;
    setBusy(true);
    try {
      const response = await fetch(`${API_BASE}/documents/${doc.id}/stream`, { headers: authHeaders(token) });
      if (!response.ok) throw new Error(`Could not open the original file (${response.status})`);
      const objectUrl = URL.createObjectURL(await response.blob());
      window.open(objectUrl, "_blank", "noopener");
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 120_000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open the original file");
    } finally {
      setBusy(false);
    }
  }, [doc, token]);

  const toggleFullscreen = useCallback(() => {
    const element = shellRef.current;
    if (!element) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void element.requestFullscreen?.().catch(() => undefined);
  }, []);

  const bbox = focus?.bbox && focus.bbox.length === 4 && focus.page === page ? focus.bbox : null;

  return (
    <div ref={shellRef} className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-[#E3E8F2] bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E3E8F2] bg-[#FAFBFE] px-3 py-2">
        <div className="min-w-0">
          <div className="truncate text-[12.5px] font-semibold text-[#0B1230]">{doc ? doc.filename : "No document selected"}</div>
          <div className="text-[10px] text-[#7B879F]">
            {doc ? `${doc.format?.toUpperCase() ?? "FILE"} · ${pageCount} page(s) · ${doc.ocr_used ? "OCR text" : "embedded text"}` : "Select a document from the list"}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <IconButton label="Previous page" disabled={!doc || page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            <path d="M15 18l-6-6 6-6" />
          </IconButton>
          <span className="min-w-[74px] text-center text-[11px] text-[#3B4A6B]">
            {doc ? `${page} / ${pageCount}` : "—"}
          </span>
          <IconButton
            label="Next page"
            disabled={!doc || page >= pageCount}
            onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
          >
            <path d="M9 6l6 6-6 6" />
          </IconButton>
          <span className="mx-1 h-5 w-px bg-[#E3E8F2]" />
          <IconButton label="Zoom out" disabled={!doc} onClick={() => setZoom((z) => Math.max(50, z - 25))}>
            <path d="M5 12h14" />
          </IconButton>
          <span className="w-10 text-center text-[10.5px] text-[#3B4A6B]">{zoom}%</span>
          <IconButton label="Zoom in" disabled={!doc} onClick={() => setZoom((z) => Math.min(250, z + 25))}>
            <path d="M12 5v14M5 12h14" />
          </IconButton>
          <button
            onClick={() => setZoom(100)}
            className="rounded border border-[#E3E8F2] bg-white px-2 py-1 text-[10.5px] text-[#5A6580] hover:bg-[#F4F6FB]"
          >
            Fit width
          </button>
          <IconButton label="Rotate page" disabled={!doc} onClick={() => setRotation((r) => (r + 90) % 360)}>
            <path d="M3 12a9 9 0 109-9M3 4v5h5" />
          </IconButton>
          <IconButton label="Full screen" disabled={!doc} onClick={toggleFullscreen}>
            <path d="M4 9V4h5M20 15v5h-5M15 4h5v5M9 20H4v-5" />
          </IconButton>
          <button
            onClick={() => void openOriginal()}
            disabled={!doc || busy}
            className="rounded border border-[#E3E8F2] bg-white px-2 py-1 text-[10.5px] text-[#2F6BFF] hover:bg-[#F1F5FF] disabled:opacity-40"
          >
            {busy ? "Opening…" : "Open file"}
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="hidden w-[86px] shrink-0 overflow-y-auto border-r border-[#E3E8F2] bg-[#FAFBFE] p-2 sm:block">
          {doc ? (
            Array.from({ length: Math.min(pageCount, MAX_THUMBNAILS) }, (_, index) => index + 1).map((number) => (
              <button
                key={number}
                onClick={() => setPage(number)}
                className={`mb-2 block w-full rounded border p-1 text-left transition ${
                  page === number ? "border-[#2F6BFF] bg-white shadow-sm" : "border-transparent hover:border-[#D7DEEC] hover:bg-white"
                }`}
              >
                {thumbs[number] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={thumbs[number]} alt={`Page ${number} thumbnail`} className="h-[92px] w-full rounded-sm bg-white object-contain" />
                ) : (
                  <div className="flex h-[92px] w-full items-center justify-center rounded-sm bg-[#EEF1F7] text-[10px] text-[#98A2B8]">
                    {thumbError ? "—" : "…"}
                  </div>
                )}
                <div className={`mt-1 text-center text-[10px] ${page === number ? "font-semibold text-[#2F6BFF]" : "text-[#7B879F]"}`}>
                  {number}
                </div>
              </button>
            ))
          ) : (
            <div className="text-center text-[10px] text-[#98A2B8]">—</div>
          )}
          {doc && pageCount > MAX_THUMBNAILS && (
            <div className="text-center text-[9.5px] text-[#98A2B8]">+{pageCount - MAX_THUMBNAILS} more</div>
          )}
        </div>

        <div className="relative min-h-0 flex-1 overflow-auto bg-[#EEF1F7] p-4">
          {!doc ? (
            <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-1 text-center">
              <div className="text-[12.5px] font-medium text-[#5A6580]">No document open</div>
              <div className="max-w-[260px] text-[11px] leading-5 text-[#98A2B8]">
                Upload a PDF, JPG or PNG on the left, then select it to read the actual file here.
              </div>
            </div>
          ) : error ? (
            <div className="mx-auto mt-10 max-w-sm rounded-lg border border-rose-200 bg-white px-4 py-3 text-[11.5px] leading-5 text-rose-700">
              {error}
            </div>
          ) : (
            <div className="mx-auto" style={{ width: `${zoom}%`, maxWidth: rotation % 180 === 0 ? "none" : "70%" }}>
              <div className="relative mx-auto w-full shadow-[0_1px_3px_rgba(11,18,48,0.12)]">
                {loading && !url && (
                  <div className="flex h-[520px] items-center justify-center rounded bg-white text-[11.5px] text-[#7B879F]">
                    Rendering page {page}…
                  </div>
                )}
                {url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={url}
                    alt={`${doc.filename} — page ${page}`}
                    className="block w-full rounded bg-white"
                    style={{ transform: rotation ? `rotate(${rotation}deg)` : undefined }}
                  />
                )}
                {url && bbox && (
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute rounded-sm border-2 border-[#2F6BFF] bg-[#2F6BFF]/15"
                    style={{
                      left: `${bbox[0] * 100}%`,
                      top: `${bbox[1] * 100}%`,
                      width: `${Math.max(2, (bbox[2] - bbox[0]) * 100)}%`,
                      height: `${Math.max(1.5, (bbox[3] - bbox[1]) * 100)}%`,
                    }}
                  />
                )}
              </div>
              {loading && url && (
                <div className="mt-1 text-center text-[10px] text-[#7B879F]">Rendering page {page}…</div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#E3E8F2] bg-white px-3 py-1.5 text-[10px] text-[#7B879F]">
        <span>Actual uploaded file · rendered from stored original</span>
        <span>
          {doc
            ? `${doc.pages.find((p) => p.page_no === page)?.text_source === "text_layer" ? "Text layer" : "OCR"} · confidence ${confidenceLabel(
                doc.pages.find((p) => p.page_no === page)?.ocr_confidence
              )}`
            : ""}
        </span>
      </div>
    </div>
  );
}

function IconButton({
  label,
  children,
  onClick,
  disabled,
}: {
  label: string;
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="rounded border border-[#E3E8F2] bg-white p-1.5 text-[#5A6580] transition hover:bg-[#F4F6FB] disabled:opacity-35"
    >
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
    </button>
  );
}
