"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowsClockwise, CalendarCheck, SealCheck } from "@phosphor-icons/react";

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
  DOCUMENT_TYPE_LABELS,
  ROLE_LABELS,
  type DocumentItem,
  type SessionUser,
} from "@/lib/types";
import { cn } from "cn";

function daysTo(expiry: string | null): number | null {
  if (!expiry) return null;
  return Math.ceil((new Date(expiry).getTime() - Date.now()) / 86_400_000);
}

export function DocumentsView({
  user,
  documents,
}: {
  user: SessionUser;
  documents: DocumentItem[];
}) {
  const router = useRouter();
  const isInstitution = user.role === "institution";
  const canConfirm = ["regional_officer", "bureau_officer", "admin"].includes(user.role);

  const [active, setActive] = useState<DocumentItem | null>(null);
  const [issueDate, setIssueDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const renewing = useRef<DocumentItem | null>(null);

  const expiring = documents.filter((item) => {
    const days = daysTo(item.expiry_date);
    return days !== null && days <= 45 && days >= 0;
  }).length;
  const expired = documents.filter((item) => {
    const days = daysTo(item.expiry_date);
    return days !== null && days < 0;
  }).length;
  const unconfirmed = documents.filter((item) => !item.dates_confirmed).length;

  function openConfirm(document: DocumentItem) {
    setActive(document);
    setIssueDate(document.issue_date ?? "");
    setExpiryDate(document.expiry_date ?? "");
    setPassword("");
    setError(null);
    setMessage(null);
  }

  async function confirmDates() {
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
      const response = await fetch(`/api/proxy/documents/${active.id}/confirm-dates`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Sign-Token": signedBody.sign_token as string,
        },
        body: JSON.stringify({
          issue_date: issueDate || null,
          expiry_date: expiryDate || null,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof body.detail === "string" ? body.detail : "The dates were not saved.");
      }
      setMessage("Dates confirmed. The expiry clock now runs from the confirmed date.");
      setActive(null);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The dates were not saved.");
    } finally {
      setPending(false);
    }
  }

  function pickRenewal(document: DocumentItem) {
    renewing.current = document;
    fileRef.current?.click();
  }

  async function uploadRenewal(file: File) {
    const document = renewing.current;
    if (!document) return;
    setPending(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch(`/api/proxy/documents/${document.id}/renew`, {
        method: "POST",
        body,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof payload.detail === "string" ? payload.detail : "The renewal was not stored.");
      }
      setMessage(`Renewal uploaded as version ${payload.version}. An officer verifies it next.`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The renewal was not stored.");
    } finally {
      setPending(false);
      renewing.current = null;
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <input
        ref={fileRef}
        type="file"
        accept="application/pdf,image/jpeg,image/png"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void uploadRenewal(file);
        }}
      />

      <PageHeader
        breadcrumbs={[{ label: ROLE_LABELS[user.role] }, { label: "Documents" }]}
        title="Document register"
        description="Leases, fire NOCs and land papers with the expiry date an officer has confirmed. A reminder fires before each date; the renewal keeps the chain."
      />

      <section aria-label="Document figures" className="grid gap-4 sm:grid-cols-3">
        <MetricCard
          label="Expiring in 45 days"
          value={String(expiring)}
          tone={expiring > 0 ? "danger" : "default"}
          hint="Reminders fire 90, 60, 30 and 7 days before"
        />
        <MetricCard label="Already expired" value={String(expired)} tone={expired > 0 ? "danger" : "default"} hint="Renewal needed" />
        <MetricCard label="Dates not confirmed" value={String(unconfirmed)} hint="No clock runs until an officer confirms" />
      </section>

      {message ? (
        <p aria-live="polite" className="flex items-start gap-2 rounded-xl bg-primary-50 p-3 text-[13px] leading-5 text-ink">
          <SealCheck size={16} className="mt-0.5 shrink-0 text-primary-600" aria-hidden="true" />
          {message}
        </p>
      ) : null}
      {error ? (
        <p aria-live="polite" className="rounded-xl border border-danger/40 p-3 text-[13px] text-danger">
          {error}
        </p>
      ) : null}

      {documents.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-surface px-6 py-12 text-center">
          <p className="text-[15px] font-medium text-primary-900">No document is registered</p>
          <p className="mt-1 text-[13px] text-muted">
            Upload the lease, fire NOC and land papers from a case workspace.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
          <Table>
            <caption className="sr-only">Document register</caption>
            <TableHeader className="bg-primary-50">
              <TableRow className="border-line hover:bg-transparent">
                {["Document", "Expiry", "State", ""].map((header) => (
                  <TableHead key={header} className="h-11 px-4 text-[13px] font-medium text-muted">
                    {header}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {documents.map((item) => {
                const days = daysTo(item.expiry_date);
                return (
                  <TableRow key={item.id} className="border-line hover:bg-primary-50/60">
                    <TableCell className="min-w-[260px] px-4 py-3.5">
                      <p className="text-[14px] font-medium text-primary-900">
                        {DOCUMENT_TYPE_LABELS[item.type] ?? item.type}
                        <span className="ml-2 text-[12px] font-normal text-muted">
                          v{item.version}
                          {item.parent_id ? (
                            <span className="ml-1 text-primary-600">renewal</span>
                          ) : null}
                        </span>
                      </p>
                      <p className="text-[12px] text-muted">
                        {item.institution_name} / {item.file_name}
                      </p>
                      <p className="text-[12px] text-muted">
                        uploaded {formatDateTime(item.created_at)}
                      </p>
                    </TableCell>
                    <TableCell className="px-4 py-3.5 text-[13px]">
                      {item.expiry_date ? (
                        <span
                          className={cn(
                            "inline-flex flex-col",
                            days !== null && days < 0 && "text-danger",
                            days !== null && days >= 0 && days <= 45 && "text-danger",
                          )}
                        >
                          <span>{formatDate(item.expiry_date)}</span>
                          <span className="text-[12px] text-muted">
                            {days === null
                              ? ""
                              : days < 0
                                ? `${Math.abs(days)} days past`
                                : `${days} days left`}
                          </span>
                        </span>
                      ) : (
                        <span className="text-muted">Not recorded</span>
                      )}
                    </TableCell>
                    <TableCell className="px-4 py-3.5 text-[13px]">
                      {item.dates_confirmed ? (
                        <span className="text-ink">Confirmed</span>
                      ) : (
                        <span className="text-muted">Awaiting an officer</span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap px-4 py-3.5">
                      <div className="flex flex-wrap justify-end gap-2">
                        {canConfirm ? (
                          <Button size="sm" variant="outline" onClick={() => openConfirm(item)}>
                            <CalendarCheck size={15} aria-hidden="true" />
                            {item.dates_confirmed ? "Correct dates" : "Confirm dates"}
                          </Button>
                        ) : null}
                        {isInstitution ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => pickRenewal(item)}
                            disabled={pending}
                          >
                            <ArrowsClockwise size={15} aria-hidden="true" />
                            Upload renewal
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={active !== null} onOpenChange={(open) => (open ? undefined : setActive(null))}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Confirm the document dates</DialogTitle>
            <DialogDescription>
              Check the dates on the document itself. The expiry clock starts only after you sign.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="issue-date">Issue date</Label>
              <Input
                id="issue-date"
                type="date"
                value={issueDate}
                onChange={(event) => setIssueDate(event.target.value)}
                className="h-11 rounded-[12px] text-[14px]"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="expiry-date">Expiry date</Label>
              <Input
                id="expiry-date"
                type="date"
                value={expiryDate}
                onChange={(event) => setExpiryDate(event.target.value)}
                className="h-11 rounded-[12px] text-[14px]"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="document-password">Password</Label>
            <Input
              id="document-password"
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
            <Button size="lg" onClick={confirmDates} disabled={pending || password.length === 0}>
              Sign and record
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
