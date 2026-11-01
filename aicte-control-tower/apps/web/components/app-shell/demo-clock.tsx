"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ClockCounterClockwise, Play, SealCheck } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { formatDate } from "@/lib/format";
import type { DemoClock as DemoClockData } from "@/lib/types";
import { cn } from "cn";

export function DemoClock({ clock }: { clock: DemoClockData }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!clock.demo_mode) return null;

  async function post(path: string, body?: unknown) {
    const response = await fetch(`/api/proxy/${path}`, {
      method: "POST",
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setMessage(typeof data.detail === "string" ? data.detail : "That did not work. Try again.");
      return;
    }
    return response.json().catch(() => ({}));
  }

  function advance(days: number) {
    startTransition(async () => {
      const result = (await post("demo/clock/advance", { days })) as { now?: string; checks?: Record<string, number> } | undefined;
      if (result?.now) {
        const raised = result.checks
          ? Object.values(result.checks).reduce((sum, value) => sum + value, 0)
          : 0;
        setMessage(
          `Clock moved to ${formatDate(result.now)}. ${raised} alerts and escalations were checked.`,
        );
        router.refresh();
      }
    });
  }

  function reset() {
    startTransition(async () => {
      const result = await post("demo/clock/reset");
      if (result) {
        setMessage("Clock reset to the live date.");
        router.refresh();
      }
    });
  }

  function tick() {
    startTransition(async () => {
      const result = (await post("demo/tick")) as { checks?: Record<string, number> } | undefined;
      if (result?.checks) {
        const raised = Object.values(result.checks).reduce((sum, value) => sum + value, 0);
        setMessage(`${raised} alerts and escalations were checked just now.`);
        router.refresh();
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <button
            type="button"
            className={cn(
              "hidden h-9 items-center gap-2 rounded-full border border-line bg-surface px-3 text-[12px] font-medium text-ink transition-colors hover:border-primary-200 hover:bg-primary-50 md:inline-flex",
            )}
          />
        }
      >
        <ClockCounterClockwise size={15} className="text-primary-600" aria-hidden="true" />
        Demo clock: {formatDate(clock.now)}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Demo clock</DialogTitle>
          <DialogDescription>
            Move the clock forward to see reminders, deadlines and the escalation ladder respond.
            Nothing is approved automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-xl border border-line bg-primary-50 p-4">
          <p className="text-[12px] text-muted">Current demonstration date</p>
          <p className="mt-1 text-[18px] font-semibold text-primary-900">
            {formatDate(clock.now)}
          </p>
          <p className="mt-1 text-[12px] text-muted">
            {clock.offset_seconds === 0
              ? "Live date. No offset applied."
              : `${Math.round(clock.offset_seconds / 86400)} days ahead of the live date.`}
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {[1, 7, 30].map((days) => (
            <Button key={days} variant="outline" size="lg" disabled={pending} onClick={() => advance(days)}>
              +{days} {days === 1 ? "day" : "days"}
            </Button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="lg" disabled={pending} onClick={tick}>
            <Play size={16} aria-hidden="true" />
            Run checks now
          </Button>
          <Button variant="ghost" size="lg" disabled={pending} onClick={reset}>
            Reset clock
          </Button>
        </div>

        {message ? (
          <p aria-live="polite" className="flex items-start gap-2 rounded-xl bg-primary-50 p-3 text-[13px] text-ink">
            <SealCheck size={16} className="mt-0.5 shrink-0 text-primary-600" aria-hidden="true" />
            {message}
          </p>
        ) : null}

        <DialogFooter>
          <p className="text-[12px] text-muted sm:text-left">
            Every change is written to the audit trail under your name.
          </p>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
