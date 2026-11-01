"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowFatLineUp, CheckCircle } from "@phosphor-icons/react";

import { PageHeader } from "@/components/domain/page-header";
import { StatusLabel } from "@/components/domain/status-label";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";
import { ROLE_LABELS, type EscalationItem, type SessionUser } from "@/lib/types";
import { cn } from "cn";

export function EscalationsView({
  user,
  items,
}: {
  user: SessionUser;
  items: EscalationItem[];
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<"open" | "all">("open");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const visible = filter === "open" ? items.filter((item) => item.acknowledged_at === null) : items;
  const open = items.filter((item) => item.acknowledged_at === null).length;

  async function acknowledge(id: string) {
    setBusy(id);
    setError(null);
    const response = await fetch(`/api/proxy/escalations/${id}/acknowledge`, { method: "POST" });
    const body = await response.json().catch(() => ({}));
    setBusy(null);
    if (!response.ok) {
      setError(typeof body.detail === "string" ? body.detail : "The escalation was not acknowledged.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumbs={[{ label: ROLE_LABELS[user.role] }, { label: "Escalations" }]}
        title="Escalations"
        description="Deadlines that moved up the ladder because no one acted in time. Acknowledging records that you have taken it up."
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-xl border border-line bg-surface p-1" role="group" aria-label="Filter escalations">
          {(["open", "all"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setFilter(option)}
              aria-pressed={filter === option}
              className={cn(
                "h-9 rounded-lg px-3 text-[13px] font-medium transition-colors",
                filter === option
                  ? "bg-primary-100 text-primary-900"
                  : "text-muted hover:text-primary-900",
              )}
            >
              {option === "open" ? "Open" : "All"}
            </button>
          ))}
        </div>
        <p className="text-[13px] text-muted" aria-live="polite">
          {open} open / {items.length} recorded
        </p>
      </div>

      {error ? (
        <p aria-live="polite" className="rounded-xl border border-danger/40 p-3 text-[13px] text-danger">
          {error}
        </p>
      ) : null}

      {visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-surface px-6 py-12 text-center">
          <p className="text-[15px] font-medium text-primary-900">
            {filter === "open" ? "Nothing is waiting for acknowledgement" : "No escalation has been raised"}
          </p>
          <p className="mt-1 text-[13px] text-muted">
            The scheduler raises one when a stage, revert or undertaking passes its deadline.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-line bg-surface">
          <Table>
            <caption className="sr-only">Escalations</caption>
            <TableHeader className="bg-primary-50">
              <TableRow className="border-line hover:bg-transparent">
                {["Case", "Level", "Region", "Raised", "Addressed to", "State", ""].map((header) => (
                  <TableHead key={header} className="h-11 px-4 text-[13px] font-medium text-muted">
                    {header}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((item) => (
                <TableRow key={item.id} className="border-line hover:bg-primary-50/60">
                  <TableCell className="px-4 py-3.5 text-[14px] font-medium text-primary-900">
                    {item.label}
                  </TableCell>
                  <TableCell className="px-4 py-3.5 text-[14px]">
                    <span className="inline-flex items-center gap-1.5">
                      <ArrowFatLineUp size={15} className="text-primary-600" aria-hidden="true" />
                      Level {item.level}
                    </span>
                  </TableCell>
                  <TableCell className="px-4 py-3.5 text-[14px] text-muted">
                    {item.region_name ?? "Headquarters"}
                  </TableCell>
                  <TableCell className="px-4 py-3.5 text-[13px] text-muted">
                    {formatDateTime(item.triggered_at)}
                  </TableCell>
                  <TableCell className="px-4 py-3.5 text-[14px]">
                    {item.to_user_name ?? "Unassigned"}
                  </TableCell>
                  <TableCell className="px-4 py-3.5 text-[14px]">
                    {item.acknowledged_at ? (
                      <StatusLabel state="closed" label="Acknowledged" />
                    ) : (
                      <StatusLabel state="at_risk" label="Awaiting acknowledgement" />
                    )}
                  </TableCell>
                  <TableCell className="px-4 py-3.5 text-right">
                    {item.acknowledged_at === null ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => acknowledge(item.id)}
                        disabled={busy === item.id}
                      >
                        <CheckCircle size={15} aria-hidden="true" />
                        Acknowledge
                      </Button>
                    ) : (
                      <span className="text-[12px] text-muted">
                        {formatDateTime(item.acknowledged_at)}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
