"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { READINESS_STYLES, fetchIntakeOverview, type IntakeOverviewRow } from "@/lib/intake";
import { fmtDate } from "@/lib/format";
import { Empty, ErrorBox, Spinner } from "@/components/ui";

export default function DashboardPage() {
  const { token, me } = useAuth();
  const [rows, setRows] = useState<IntakeOverviewRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    fetchIntakeOverview(token)
      .then((data) => setRows(data.applications))
      .catch((e) => setError(e instanceof Error ? e.message : "The dashboard could not be loaded."));
  }, [token]);

  useEffect(load, [load]);

  const open = (rows ?? []).filter((row) => row.application.status === "draft").length;
  const review = (rows ?? []).reduce((sum, row) => sum + row.summary.documents_needs_review, 0);
  const recent = (rows ?? []).slice(0, 6);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-semibold tracking-tight text-[#0B1230]">
            Welcome back{me?.full_name ? `, ${me.full_name.split(" ")[0]}` : ""}
          </h1>
          <p className="mt-1 text-[12.5px] text-[#5A6580]">Your applications and their intake status.</p>
        </div>
        <Link
          href="/applications/new"
          className="rounded-lg bg-[#2F6BFF] px-3.5 py-2 text-[12px] font-semibold text-white hover:bg-[#2557d6]"
        >
          + New application
        </Link>
      </div>

      <ErrorBox message={error} />

      <div className="grid gap-2 sm:grid-cols-3">
        <SmallStat label="Applications" value={rows?.length ?? 0} note={`${open} in progress`} />
        <SmallStat label="Documents to review" value={review} note="types still to confirm" tone={review ? "amber" : undefined} />
        <SmallStat
          label="Completed intakes"
          value={(rows ?? []).filter((row) => row.application.status !== "draft").length}
          note="signed off with a manifest"
        />
      </div>

      {!rows ? (
        <div className="rounded-xl border border-[#E3E8F2] bg-white p-6">
          <Spinner label="Loading applications…" />
        </div>
      ) : recent.length === 0 ? (
        <div className="rounded-xl border border-[#E3E8F2] bg-white p-8 text-center">
          <Empty>No applications yet.</Empty>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[#E3E8F2] bg-white">
          <div className="flex items-center justify-between border-b border-[#EEF1F7] px-4 py-2.5">
            <h2 className="text-[12.5px] font-semibold text-[#0B1230]">Recent applications</h2>
            <Link href="/applications" className="text-[10.5px] text-[#2F6BFF] hover:underline">
              View all
            </Link>
          </div>
          <ul className="divide-y divide-[#F1F4FA]">
            {recent.map((row) => {
              const style = READINESS_STYLES[row.readiness.state] ?? READINESS_STYLES.empty;
              return (
                <li key={row.application.id}>
                  <Link href={`/intake/${row.application.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 hover:bg-[#FAFBFE]">
                    <div className="min-w-0">
                      <div className="text-[12px] font-medium text-[#0B1230]">{row.application.reference_no}</div>
                      <div className="truncate text-[11px] text-[#7B879F]">{row.application.title}</div>
                    </div>
                    <div className="flex items-center gap-3 text-[10.5px] text-[#98A2B8]">
                      <span>
                        {row.summary.documents} doc(s) · {row.summary.pages_total} page(s)
                      </span>
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${style.className}`}>{style.label}</span>
                      <span className="hidden sm:inline">{fmtDate(row.application.last_processed_at)}</span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function SmallStat({ label, value, note, tone }: { label: string; value: number; note: string; tone?: "amber" }) {
  return (
    <div className="rounded-xl border border-[#E3E8F2] bg-white px-4 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-[#7B879F]">{label}</div>
      <div className={`mt-1 text-[20px] font-semibold leading-tight ${tone ? "text-amber-700" : "text-[#0B1230]"}`}>{value}</div>
      <div className="text-[10px] text-[#98A2B8]">{note}</div>
    </div>
  );
}
