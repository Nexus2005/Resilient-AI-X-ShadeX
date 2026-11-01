"use client";

import { useRef, useState } from "react";
import { uploadBundle, type UploadResult } from "@/lib/intake";
import { fmtBytes } from "@/lib/format";

const ACCEPT = ".pdf,.jpg,.jpeg,.png,.zip";
const ACCEPTED_LABEL = "PDF · JPG · JPEG · PNG · ZIP";

export function BundleUploader({
  token,
  applicationId,
  maxFileMb = 25,
  onUploaded,
}: {
  token: string | null;
  applicationId: string;
  maxFileMb?: number;
  onUploaded: () => void;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [results, setResults] = useState<UploadResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);

  function addFiles(incoming: FileList | File[]) {
    setError(null);
    const next = [...files];
    for (const file of Array.from(incoming)) {
      if (!next.some((existing) => existing.name === file.name && existing.size === file.size)) {
        next.push(file);
      }
    }
    setFiles(next);
  }

  async function upload() {
    if (!files.length) return;
    setError(null);
    setResults(null);
    setProgress(0);
    try {
      const response = await uploadBundle(token, applicationId, files, setProgress);
      setResults(response.results);
      setFiles([]);
      if (response.stored > 0) onUploaded();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setProgress(null);
    }
  }

  return (
    <div>
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          addFiles(event.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") inputRef.current?.click();
        }}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition ${
          dragging ? "border-[#2F6BFF] bg-[#F1F5FF]" : "border-[#D7DEEC] bg-[#FAFBFE] hover:border-[#2F6BFF]"
        }`}
      >
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#E9EEFF] text-[#2F6BFF]">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M12 16V4m0 0L8 8m4-4l4 4M5 16v3a1 1 0 001 1h12a1 1 0 001-1v-3" />
          </svg>
        </span>
        <div className="mt-3 text-[13px] font-semibold text-[#0B1230]">Drag &amp; drop your files here</div>
        <div className="mt-1 text-[11.5px] text-[#7B879F]">
          or click to browse · {ACCEPTED_LABEL} · max {maxFileMb} MB per file
        </div>
        <div className="mt-1 text-[10.5px] text-[#98A2B8]">
          ZIP archives are extracted safely; signatures are verified, not extensions.
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT}
          className="hidden"
          onChange={(event) => {
            if (event.target.files) addFiles(event.target.files);
            event.target.value = "";
          }}
        />
      </div>

      {files.length > 0 && (
        <div className="mt-4 rounded-lg border border-[#E3E8F2] bg-white">
          <div className="flex items-center justify-between border-b border-[#EEF1F7] px-3 py-2">
            <span className="text-[11.5px] font-medium text-[#0B1230]">
              {files.length} file{files.length === 1 ? "" : "s"} ready · {fmtBytes(totalBytes)}
            </span>
            <button className="text-[11px] text-[#7B879F] hover:text-[#0B1230]" onClick={() => setFiles([])}>
              Clear
            </button>
          </div>
          <ul className="divide-y divide-[#F1F4FA]">
            {files.map((file, index) => (
              <li key={`${file.name}-${index}`} className="flex items-center justify-between px-3 py-2">
                <div className="min-w-0">
                  <div className="truncate text-[12px] text-[#0B1230]">{file.name}</div>
                  <div className="text-[10.5px] text-[#98A2B8]">
                    {fmtBytes(file.size)}
                    {file.size > maxFileMb * 1024 * 1024 ? " · exceeds the per-file limit" : ""}
                  </div>
                </div>
                <button
                  className="ml-3 text-[11px] text-[#98A2B8] hover:text-rose-600"
                  onClick={() => setFiles(files.filter((_, i) => i !== index))}
                  aria-label={`Remove ${file.name}`}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
          <div className="border-t border-[#EEF1F7] p-3">
            {progress !== null && (
              <div className="mb-2">
                <div className="h-1.5 overflow-hidden rounded bg-[#EEF1F7]">
                  <div className="h-full bg-[#2F6BFF] transition-all" style={{ width: `${progress}%` }} />
                </div>
                <div className="mt-1 text-[10.5px] text-[#7B879F]">Uploading… {progress}%</div>
              </div>
            )}
            <button
              onClick={() => void upload()}
              disabled={progress !== null}
              className="w-full rounded-lg bg-[#2F6BFF] py-2 text-[12.5px] font-semibold text-white transition hover:bg-[#2557d6] disabled:bg-[#A9BEF5]"
            >
              {progress !== null ? "Uploading…" : `Upload ${files.length} file${files.length === 1 ? "" : "s"}`}
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700">{error}</div>
      )}

      {results && results.length > 0 && (
        <div className="mt-4 rounded-lg border border-[#E3E8F2] bg-white">
          <div className="border-b border-[#EEF1F7] px-3 py-2 text-[11.5px] font-medium text-[#0B1230]">
            Upload results — {results.filter((r) => r.status === "stored").length} stored,{" "}
            {results.filter((r) => r.status === "rejected").length} rejected,{" "}
            {results.filter((r) => r.status === "skipped").length} skipped
          </div>
          <ul className="max-h-64 divide-y divide-[#F1F4FA] overflow-y-auto">
            {results.map((result, index) => (
              <li key={`${result.filename}-${index}`} className="flex items-start justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <div className="truncate text-[12px] text-[#0B1230]">
                    {result.source_archive ? `${result.source_archive} → ` : ""}
                    {result.filename}
                  </div>
                  {result.message && <div className="text-[10.5px] leading-4 text-[#7B879F]">{result.message}</div>}
                  {result.code && <div className="text-[10px] uppercase tracking-wide text-[#98A2B8]">{result.code}</div>}
                </div>
                <span
                  className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium capitalize ${
                    result.status === "stored"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : result.status === "rejected"
                        ? "border-rose-200 bg-rose-50 text-rose-700"
                        : "border-slate-200 bg-slate-50 text-slate-600"
                  }`}
                >
                  {result.status}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
