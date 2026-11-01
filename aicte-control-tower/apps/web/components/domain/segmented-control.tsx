"use client";

import { cn } from "cn";

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  className,
}: {
  options: readonly { label: string; value: T }[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex flex-wrap items-center gap-1 rounded-full border border-line bg-surface p-1",
        className,
      )}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              "h-8 rounded-full px-3.5 text-[13px] font-medium transition-colors duration-150",
              selected
                ? "bg-primary-600 text-white"
                : "text-muted hover:bg-primary-50 hover:text-primary-900",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
