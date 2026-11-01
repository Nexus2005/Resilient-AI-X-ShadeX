"use client";

import { CheckCircle } from "@phosphor-icons/react";

import { cn } from "cn";

export type StatusState =
  | "on_track"
  | "at_risk"
  | "overdue"
  | "not_due"
  | "submitted"
  | "verified"
  | "closed"
  | "deficient";

const states: Record<
  StatusState,
  { label: string; dot: string; text: string; check?: boolean }
> = {
  on_track: { label: "On track", dot: "bg-muted", text: "text-ink" },
  at_risk: { label: "At risk", dot: "bg-primary-600", text: "text-ink font-medium" },
  overdue: { label: "Overdue", dot: "bg-danger", text: "text-danger font-medium" },
  not_due: { label: "Not yet due", dot: "bg-muted", text: "text-ink" },
  submitted: { label: "Submitted", dot: "bg-primary-400", text: "text-ink" },
  verified: { label: "Verified", dot: "bg-primary-600", text: "text-ink", check: true },
  closed: { label: "Closed", dot: "bg-primary-600", text: "text-ink", check: true },
  deficient: { label: "Deficient", dot: "bg-danger", text: "text-danger" },
};

export function StatusLabel({
  state,
  label,
  className,
  showDot = true,
}: {
  state: StatusState;
  label?: string;
  className?: string;
  showDot?: boolean;
}) {
  const config = states[state];

  return (
    <span
      className={cn("inline-flex items-center gap-2 text-[13px]", config.text, className)}
    >
      {config.check ? (
        <CheckCircle size={15} weight="fill" className="text-primary-600" aria-hidden="true" />
      ) : showDot ? (
        <span aria-hidden="true" className={cn("size-2 rounded-full", config.dot)} />
      ) : null}
      {label ?? config.label}
    </span>
  );
}
