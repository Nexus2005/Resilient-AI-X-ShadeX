"use client";

import { Check } from "@phosphor-icons/react";

import { cn } from "cn";

export function StageTracker({
  stages,
  currentIndex,
  className,
}: {
  stages: readonly string[];
  currentIndex: number;
  className?: string;
}) {
  return (
    <ol
      className={cn("flex min-w-[560px] items-start gap-2 overflow-x-auto", className)}
      aria-label="Application stages"
    >
      {stages.map((stage, index) => {
        const done = index < currentIndex;
        const current = index === currentIndex;
        return (
          <li key={stage} className="flex flex-1 flex-col gap-2">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full border",
                  done
                    ? "border-primary-600 bg-primary-600 text-white"
                    : current
                      ? "border-2 border-primary-600 bg-surface"
                      : "border-line bg-surface",
                )}
              >
                {done ? (
                  <Check size={13} weight="bold" aria-hidden="true" />
                ) : current ? (
                  <span className="size-2 rounded-full bg-primary-600" aria-hidden="true" />
                ) : null}
              </span>
              {index < stages.length - 1 ? (
                <span
                  aria-hidden="true"
                  className={cn(
                    "h-px flex-1",
                    done ? "bg-primary-400" : "bg-line",
                  )}
                />
              ) : null}
            </div>
            <span
              className={cn(
                "pr-2 text-[12px] leading-4",
                current
                  ? "font-semibold text-primary-900"
                  : done
                    ? "text-ink"
                    : "text-muted",
              )}
              aria-current={current ? "step" : undefined}
            >
              {stage}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
