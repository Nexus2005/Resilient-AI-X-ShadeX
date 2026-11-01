"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Lock, Plus, SealCheck, Trash } from "@phosphor-icons/react";

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
import type { ApplicationDetail, CaseAction } from "@/lib/types";

const REVERT_CATEGORIES = [
  "Fire NOC not in the institution name",
  "Lease agreement incomplete or expired",
  "Land document does not match the site",
  "Building plan not approved by the local body",
  "Faculty list does not meet the sanctioned ratio",
  "Financial statement not signed by the trust",
];

type Condition = { key: string; title: string; evidence: string; dueDays: number };

function newCondition(index: number): Condition {
  return {
    key: `condition-${index}-${Date.now()}`,
    title: "",
    evidence: "Signed certificate uploaded to the document register",
    dueDays: 90,
  };
}

export function CaseActions({
  detail,
  className,
}: {
  detail: ApplicationDetail;
  className?: string;
}) {
  const router = useRouter();
  const [active, setActive] = useState<CaseAction | null>(null);
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [category, setCategory] = useState(REVERT_CATEGORIES[0]);
  const [evidence, setEvidence] = useState("");
  const [dueDays, setDueDays] = useState(7);
  const [conditions, setConditions] = useState<Condition[]>([newCondition(0)]);

  if (detail.permitted_actions.length === 0) {
    return (
      <p className={className}>
        <span className="text-[13px] leading-5 text-muted">
          No action is open to you at this stage. The case is with{" "}
          {detail.open_stage?.owner_name ?? "another desk"}.
        </span>
      </p>
    );
  }

  function close() {
    setActive(null);
    setPassword("");
    setMessage(null);
    setError(null);
  }

  async function call(path: string, init: RequestInit) {
    const response = await fetch(`/api/proxy/${path}`, init);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(
        typeof body.detail === "string" ? body.detail : "That action was not recorded.",
      );
    }
    return body;
  }

  function run(action: CaseAction) {
    startTransition(async () => {
      setError(null);
      setMessage(null);
      try {
        let signToken: string | undefined;
        if (action.signed) {
          if (!password) {
            setError("Enter your password to sign this decision.");
            return;
          }
          const signed = await call("sign", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ password }),
          });
          signToken = signed.sign_token as string;
        }

        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (signToken) headers["X-Sign-Token"] = signToken;

        if (action.event === "revert") {
          await call(`applications/${detail.id}/revert`, {
            method: "POST",
            headers,
            body: JSON.stringify({
              category,
              required_evidence: evidence,
              due_days: dueDays,
              aph_reference: "To be mapped from APH 2024-27",
            }),
          });
          setMessage("The case was returned to the institution and recorded under your name.");
        } else if (action.event === "approve") {
          await call(`applications/${detail.id}/approve`, {
            method: "POST",
            headers,
            body: JSON.stringify({
              conditions: conditions.map((condition) => ({
                title: condition.title,
                evidence_required: condition.evidence,
                source_ref: "To be mapped from APH 2024-27",
                due_days: condition.dueDays,
              })),
            }),
          });
          setMessage(
            `Approval signed and recorded with ${conditions.length} ${
              conditions.length === 1 ? "undertaking" : "undertakings"
            }.`,
          );
        } else {
          await call(`applications/${detail.id}/${action.event}`, { method: "POST", headers });
          setMessage(
            action.event === "submit"
              ? "Application submitted and routed by the published rules."
              : action.event === "resubmit"
                ? "Evidence resubmitted. The case returns to the officer who raised it."
                : "Scrutiny cleared and recorded under your name.",
          );
        }
        router.refresh();
        setPassword("");
        setActive(null);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "That action was not recorded.");
      }
    });
  }

  return (
    <div className={className}>
      <div className="flex flex-wrap gap-3">
        {detail.permitted_actions.map((action) => (
          <Button
            key={action.event}
            size="lg"
            variant={action.event === "revert" ? "outline" : "default"}
            onClick={() => {
              setActive(action);
              setError(null);
              setMessage(null);
            }}
          >
            {action.signed ? <Lock size={16} aria-hidden="true" /> : null}
            {action.label}
          </Button>
        ))}
      </div>

      {message ? (
        <p
          aria-live="polite"
          className="mt-3 flex items-start gap-2 rounded-xl bg-primary-50 p-3 text-[13px] leading-5 text-ink"
        >
          <SealCheck size={16} className="mt-0.5 shrink-0 text-primary-600" aria-hidden="true" />
          {message}
        </p>
      ) : null}

      <Dialog open={active !== null} onOpenChange={(open) => (open ? undefined : close())}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{active?.label ?? "Record a decision"}</DialogTitle>
            <DialogDescription>
              {active?.signed
                ? "This decision is recorded under your name and cannot be edited afterwards."
                : "The change is written to the audit trail with your name, the time and the reason."}
            </DialogDescription>
          </DialogHeader>

          {active?.event === "revert" ? (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="revert-category">Reason category</Label>
                <select
                  id="revert-category"
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  className="h-11 w-full rounded-[12px] border border-line bg-surface px-3 text-[14px] focus-visible:border-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600/30"
                >
                  {REVERT_CATEGORIES.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="revert-evidence">Evidence the institution must submit</Label>
                <Textarea
                  id="revert-evidence"
                  value={evidence}
                  onChange={(event) => setEvidence(event.target.value)}
                  rows={3}
                  placeholder="State exactly what must be uploaded before the case returns."
                  className="min-h-[88px] rounded-[12px] text-[14px]"
                />
              </div>
              <div className="flex flex-col gap-1.5 sm:w-48">
                <Label htmlFor="revert-due">Working days to comply</Label>
                <select
                  id="revert-due"
                  value={dueDays}
                  onChange={(event) => setDueDays(Number(event.target.value))}
                  className="h-11 w-full rounded-[12px] border border-line bg-surface px-3 text-[14px] focus-visible:border-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600/30"
                >
                  {[5, 7, 14, 21].map((days) => (
                    <option key={days} value={days}>
                      {days} working days
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : null}

          {active?.event === "approve" ? (
            <div className="flex flex-col gap-4">
              {conditions.map((condition, index) => (
                <div key={condition.key} className="rounded-xl border border-line p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[13px] font-medium text-ink">Undertaking {index + 1}</p>
                    {conditions.length > 1 ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setConditions((current) =>
                            current.filter((item) => item.key !== condition.key),
                          )
                        }
                      >
                        <Trash size={15} aria-hidden="true" />
                        Remove
                      </Button>
                    ) : null}
                  </div>
                  <div className="mt-3 flex flex-col gap-3">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor={`title-${condition.key}`}>Condition</Label>
                      <Input
                        id={`title-${condition.key}`}
                        value={condition.title}
                        onChange={(event) =>
                          setConditions((current) =>
                            current.map((item) =>
                              item.key === condition.key
                                ? { ...item, title: event.target.value }
                                : item,
                            ),
                          )
                        }
                        placeholder="Example: Submit the annual fire safety certificate"
                        className="h-11 rounded-[12px] text-[14px]"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor={`evidence-${condition.key}`}>Evidence required</Label>
                      <Input
                        id={`evidence-${condition.key}`}
                        value={condition.evidence}
                        onChange={(event) =>
                          setConditions((current) =>
                            current.map((item) =>
                              item.key === condition.key
                                ? { ...item, evidence: event.target.value }
                                : item,
                            ),
                          )
                        }
                        className="h-11 rounded-[12px] text-[14px]"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5 sm:w-48">
                      <Label htmlFor={`due-${condition.key}`}>Due in</Label>
                      <select
                        id={`due-${condition.key}`}
                        value={condition.dueDays}
                        onChange={(event) =>
                          setConditions((current) =>
                            current.map((item) =>
                              item.key === condition.key
                                ? { ...item, dueDays: Number(event.target.value) }
                                : item,
                            ),
                          )
                        }
                        className="h-11 w-full rounded-[12px] border border-line bg-surface px-3 text-[14px] focus-visible:border-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600/30"
                      >
                        {[30, 60, 90, 180].map((days) => (
                          <option key={days} value={days}>
                            {days} days
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              ))}
              {conditions.length < 5 ? (
                <Button
                  variant="outline"
                  onClick={() => setConditions((current) => [...current, newCondition(current.length)])}
                >
                  <Plus size={16} aria-hidden="true" />
                  Add another undertaking
                </Button>
              ) : null}
            </div>
          ) : null}

          {active?.signed ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sign-password">Password</Label>
              <Input
                id="sign-password"
                type="password"
                value={password}
                autoComplete="current-password"
                onChange={(event) => setPassword(event.target.value)}
                className="h-11 rounded-[12px] text-[14px]"
              />
              <p className="text-[12px] text-muted">
                This decision is recorded under your name and time-stamped in the audit trail.
              </p>
            </div>
          ) : null}

          {error ? (
            <p
              aria-live="polite"
              className="rounded-xl border border-danger/40 p-3 text-[13px] text-danger"
            >
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <Button variant="outline" size="lg" onClick={close}>
              Cancel
            </Button>
            <Button
              size="lg"
              disabled={pending || (active?.event === "revert" && evidence.trim().length < 3)}
              onClick={() => (active ? run(active) : undefined)}
            >
              {active?.signed ? "Sign and record" : active?.label}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
