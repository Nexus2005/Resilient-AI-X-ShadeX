import type { ReactNode } from "react";

import { cn } from "cn";

export type TimelineItem = {
  id: string;
  title: string;
  meta?: string;
  body?: ReactNode;
  tone?: "default" | "danger";
};

export function Timeline({ items }: { items: readonly TimelineItem[] }) {
  return (
    <ol className="relative flex flex-col gap-5 border-l border-line pl-5">
      {items.map((item) => (
        <li key={item.id} className="relative">
          <span
            aria-hidden="true"
            className={cn(
              "absolute -left-[26px] top-1.5 size-2.5 rounded-full ring-4 ring-surface",
              item.tone === "danger" ? "bg-danger" : "bg-primary-600",
            )}
          />
          <p className="text-[14px] font-medium text-ink">{item.title}</p>
          {item.meta ? <p className="mt-0.5 text-[12px] text-muted">{item.meta}</p> : null}
          {item.body ? (
            <div className="mt-1 text-[13px] leading-5 text-muted">{item.body}</div>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
