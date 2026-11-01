"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, SealCheck, UploadSimple, WarningCircle } from "@phosphor-icons/react";

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
  OBLIGATION_STATE_LABELS,
  ROLE_LABELS,
  type ObligationItem,
  type SessionUser,
} from "@/lib/types";
import { cn } from "cn";

const FILTERS = [
  { value: "all", label: "All" },
  { value: "overdue", label: "Overdue" },
  { value: "due_soon", label: "Due soon" },
  { value: "submitted", label: "Submitted" },
  { value: "verified", label: "Verified" },
  { value: "deficient", label: "Deficient" },
];

export function ObligationsView({
  user,
  items,
}: {
  user: SessionUser;
  items: ObligationItem[];
}) {
  const router = useRouter();
  const canReview = ["regional_officer", "bureau_officer", "admin"].includes(user.role);
  const canSubmitEvidence = user.role === "institution";
  const fileRef = useRef<HTMLInputElement>(null);
  const target = useRef<ObligationItem | null>(null);
  const [filter, setFilter] = useState("all");
  const [active, setActive] = useState<ObligationItem | null>(null);
  const [mode, setMode] = useState<"verify" | "deficient">("verify");
  const [reason, setReason] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const visible = filter === "all" ? items : items.filter((item) => item.state === filter);

  function open(item: ObligationItem, next: "verify" | "deficient") {
    setActive(item);
    setMode(next);
    setReason("");
    setPassword("");
    setError(null);
    setMessage(null);
  }

  async function uploadEvidence(file: File) {
    const obligation = target.current;
    if (!obligation) return;
    setPending(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("type", obligation.type);
      body.append("obligation_id", obligation.id);
      const response = await fetch("/api/proxy/documents", { method: "POST", body });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          typeof payload.detail === "string" ? payload.detail : "The evidence was not stored.",
        );
      }
      setMessage("Evidence uploaded. An officer verifies it before the undertaking closes.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The evidence was not stored.");
    } finally {
      setPending(false);
      target.current = null;
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function submit() {
    if (!active) return;
    setPending(true);
    setError(null);
    try {
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
      const response = await fetch(`/api/proxy/obligations/${active.id}/${mode}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Sign-Token": signedBody.sign_token as string,
        },
        body: JSON.stringify(
          mode === "deficient" ? { reason } : {},
        ),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          typeof body.detail === "string" ? body.detail : "That decision was not recorded.",
        );
      }
      setMessage(
        mode === "verify"
          ? "Undertaking marked verified. The institution has been told."
          : "Deficiency recorded and sent to the institution.",
      );
      setActive(null);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That decision was not recorded.");
    } finally {
      setPending(false);
    }
  }

  const overdue = items.filter((item) => item.state === "overdue").length;
  const submitted = items.filter((item) => item.state === "submitted").length;
  const verified = items.filter((item) => item.state === "verified").length;

  return (
    <div className="flex flex-col gap-6">
      <input
        ref={fileRef}
        type="file"
        accept="application/pdf,image/jpeg,image/png"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void uploadEvidence(file);
        }}
      />

      <PageHeader
        breadcrumbs={[{ label: ROLE_LABELS[user.role] }, { label: "Undertakings" }]}
        title="Undertakings"
        description="Conditions attached to an approval, with the evidence the institution must submit and the officer decision that closes each one. Nothing is verified automatically."
      />

      <section aria-label="Undertaking figures" className="grid gap-4 sm:grid-cols-3">
        <MetricCard
          label="Overdue"
          value={String(overdue)}
          tone={overdue > 0 ? "danger" : "default"}
          hint="Past the due date with no verified evidence"
        />
        <MetricCard label="Waiting for an officer" value={String(submitted)} hint="Evidence uploaded" />
        <MetricCard label="Verified" value={String(verified)} hint="Signed off by an officer" />
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1 rounded-xl border border-line bg-surface p-1" role="group" aria-label="Filter undertakings">
          {FILTERS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setFilter(option.value)}
              aria-pressed={filter === option.value}
              className={cn(
                "h-9 rounded-lg px-3 text-[13px] font-medium transition-colors",
                filter === option.value
                  ? "bg-primary-100 text-primary-900"
                  : "text-muted hover:text-primary-900",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
        <p className="text-[13px] text-muted" aria-live="polite">
          {visible.length} of {items.length} undertakings
        </p>
      </div>

      {message ? (
        <p aria-live="polite" className="flex items-start gap-2 rounded-xl bg-primary-50 p-3 text-[13px] leading-5 text-ink">
          <SealCheck size={16} className="mt-0.5 shrink-0 text-primary-600" aria-hidden="true" />
          {message}
        </p>
      ) : null}

      {visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-surface px-6 py-12 text-center">
          <p className="text-[15px] font-medium text-primary-900">Nothing in this view</p>
          <p className="mt-1 text-[13px] text-muted">
            Undertakings appear here when an approval is signed with conditions.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
          <Table>
            <caption className="sr-only">Undertakings</caption>
            <TableHeader className="bg-primary-50">
              <TableRow className="border-line hover:bg-transparent">
                {["Undertaking", "Due", "Evidence", "State", ""].map((header) => (
                  <TableHead key={header} className="h-11 px-4 text-[13px] font-medium text-muted">
                    {header}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((item) => (
                <TableRow key={item.id} className="border-line hover:bg-primary-50/60">
                  <TableCell className="min-w-[260px] px-4 py-3.5">
                    <p className="text-[14px] font-medium text-primary-900">{item.title}</p>
                    <p className="text-[12px] text-muted">
                      {item.institution_name} / {item.app_no ?? "Standalone"}
                    </p>
                  </TableCell>
                  <TableCell className="px-4 py-3.5 text-[13px] text-muted">
                    {formatDate(item.due_at)}
                  </TableCell>
                  <TableCell className="px-4 py-3.5 text-[13px]">
                    {item.evidence_count > 0 ? (
                      <span className="inline-flex items-center gap-1.5 text-ink">
                        <CheckCircle size={14} className="text-primary-600" aria-hidden="true" />
                        Uploaded
                      </span>
                    ) : (
                      <span className="text-muted">Not uploaded</span>
                    )}
                  </TableCell>
                  <TableCell className="px-4 py-3.5">
                    <span
                      className={cn(
                        "inline-flex rounded-full px-2.5 py-1 text-[12px] font-medium",
                        item.state === "overdue" || item.state === "deficient"
                          ? "bg-danger/10 text-danger"
                          : item.state === "verified"
                            ? "bg-primary-100 text-primary-900"
                            : "bg-primary-50 text-primary-700",
                      )}
                    >
                      {OBLIGATION_STATE_LABELS[item.state] ?? item.state}
                    </span>
                    {item.verified_at ? (
                      <p className="mt-1 text-[12px] text-muted">
                        {item.verified_by} / {formatDateTime(item.verified_at)}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell className="whitespace-nowrap px-4 py-3.5">
                    {canReview && item.state === "submitted" ? (
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" onClick={() => open(item, "verify")}>
                          Verify
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => open(item, "deficient")}>
                          <WarningCircle size={15} aria-hidden="true" />
                          Deficient
                        </Button>
                      </div>
                    ) : canReview && item.state !== "verified" ? (
                      <Button size="sm" variant="outline" onClick={() => open(item, "deficient")}>
                        Deficient
                      </Button>
                    ) : canSubmitEvidence && item.state !== "verified" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() => {
                          target.current = item;
                          setMessage(null);
                          setError(null);
                          fileRef.current?.click();
                        }}
                      >
                        <UploadSimple size={15} aria-hidden="true" />
                        Upload evidence
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={active !== null} onOpenChange={(open) => (open ? undefined : setActive(null))}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {mode === "verify" ? "Verify this undertaking" : "Mark this undertaking deficient"}
            </DialogTitle>
            <DialogDescription>
              {mode === "verify"
                ? "You confirm the evidence meets the condition. The institution is told and the record is signed in your name."
                : "The institution is told exactly what is wrong and must resubmit. The decision is signed in your name."}
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-xl border border-line bg-primary-50/60 p-3">
            <p className="text-[14px] font-medium text-ink">{active?.title}</p>
            <p className="mt-0.5 text-[12px] text-muted">
              {active?.institution_name} / {active?.evidence_required}
            </p>
          </div>

          {mode === "deficient" ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="deficiency-reason">What is wrong</Label>
              <Textarea
                id="deficiency-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                rows={3}
                placeholder="Example: the certificate names the contractor, not the trust."
                className="min-h-[88px] rounded-[12px] text-[14px]"
              />
            </div>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="obligation-password">Password</Label>
            <Input
              id="obligation-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="h-11 rounded-[12px] text-[14px]"
            />
          </div>

          {error ? (
            <p aria-live="polite" className="rounded-xl border border-danger/40 p-3 text-[13px] text-danger">
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <Button variant="outline" size="lg" onClick={() => setActive(null)}>
              Cancel
            </Button>
            <Button
              size="lg"
              onClick={submit}
              disabled={pending || password.length === 0 || (mode === "deficient" && reason.trim().length < 10)}
            >
              Sign and record
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
