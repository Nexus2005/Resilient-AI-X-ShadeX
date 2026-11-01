"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { READINESS_STYLES, fetchIntakeOverview, type IntakeOverviewRow } from "@/lib/intake";
import { fmtDate } from "@/lib/format";
import { Empty, ErrorBox, Spinner } from "@/components/ui";

export default function ApplicationsPage() {
  const { token } = useAuth();
  const [rows, setRows] = useState<IntakeOverviewRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    fetchIntakeOverview(token)
      .then((data) => setRows(data.applications))
      .catch((e) => setError(e instanceof Error ? e.message : "Applications could not be loaded."));
  }, [token]);

  useEffect(load, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-semibold tracking-tight text-[#0B1230]">Applications</h1>
          <p className="mt-1 text-[12.5px] text-[#5A6580]">
            Open an application to upload, read, process and complete its documents.
          </p>
        </div>
        <Link
          href="/applications/new"
          className="rounded-lg bg-[#2F6BFF] px-3.5 py-2 text-[12px] font-semibold text-white hover:bg-[#2557d6]"
        >
          + New application
        </Link>
      </div>

      <ErrorBox message={error} />

      {!rows ? (
        <div className="rounded-xl border border-[#E3E8F2] bg-white p-6">
          <Spinner label="Loading applications…" />
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-[#E3E8F2] bg-white p-8 text-center">
          <Empty>No applications yet.</Empty>
          <Link
            href="/applications/new"
            className="mt-4 inline-block rounded-lg bg-[#2F6BFF] px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-[#2557d6]"
          >
            Create the first application
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[#E3E8F2] bg-white">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-[#EEF1F7] text-[12px]">
              <thead className="bg-[#FAFBFE] text-left text-[10px] uppercase tracking-wide text-[#7B879F]">
                <tr>
                  <th className="px-4 py-2.5">Application</th>
                  <th className="px-4 py-2.5">Institution</th>
                  <th className="px-4 py-2.5">Documents</th>
                  <th className="px-4 py-2.5">Checklist</th>
                  <th className="px-4 py-2.5">Intake</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F4FA]">
                {rows.map((row) => {
                  const style = READINESS_STYLES[row.readiness.state] ?? READINESS_STYLES.empty;
                  return (
                    <tr key={row.application.id} className="hover:bg-[#FAFBFE]">
                      <td className="px-4 py-3">
                        <Link href={`/intake/${row.application.id}`} className="font-medium text-[#0B1230] hover:text-[#2F6BFF]">
                          {row.application.reference_no}
                        </Link>
                        <div className="max-w-[260px] truncate text-[11px] text-[#7B879F]">{row.application.title}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="max-w-[200px] truncate text-[#3B4A6B]">{row.application.institution.name}</div>
                        <div className="text-[10.5px] text-[#98A2B8]">{row.application.academic_year}</div>
                      </td>
                      <td className="px-4 py-3 text-[#3B4A6B]">
                        {row.summary.documents}
                        <span className="ml-1 text-[10.5px] text-[#98A2B8]">
                          ({row.summary.documents_processed} processed)
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[11px]">
                        <span className="text-[#3B4A6B]">{row.checklist.counts.satisfied ?? 0} satisfied</span>
                        <div className={`text-[10.5px] ${(row.checklist.counts.missing ?? 0) > 0 ? "text-rose-600" : "text-[#98A2B8]"}`}>
                          {row.checklist.counts.missing ?? 0} missing
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10.5px] font-medium ${style.className}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
                          {style.label}
                        </span>
                        <div className="mt-0.5 text-[10px] text-[#98A2B8]">{fmtDate(row.application.last_processed_at)}</div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/intake/${row.application.id}`}
                          className="rounded-lg border border-[#E3E8F2] px-2.5 py-1.5 text-[11.5px] font-medium text-[#2F6BFF] hover:bg-[#F1F5FF]"
                        >
                          Open →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
