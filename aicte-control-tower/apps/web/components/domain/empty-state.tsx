import type { ReactNode } from "react";

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-line bg-surface px-6 py-12 text-center">
      <svg viewBox="0 0 96 72" className="h-[72px] w-24" aria-hidden="true" fill="none">
        <rect x="10" y="18" width="76" height="48" rx="10" fill="var(--brand-100)" />
        <rect x="20" y="28" width="34" height="5" rx="2.5" fill="var(--brand-400)" />
        <rect x="20" y="39" width="52" height="5" rx="2.5" fill="var(--brand-200)" />
        <rect x="20" y="50" width="24" height="5" rx="2.5" fill="var(--brand-200)" />
        <circle cx="72" cy="20" r="12" fill="var(--brand-50)" />
        <path
          d="M68 20l3 3 5-6"
          stroke="var(--brand-600)"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <div>
        <p className="text-[15px] font-semibold text-primary-900">{title}</p>
        <p className="mx-auto mt-1 max-w-[46ch] text-[13px] leading-5 text-muted">
          {description}
        </p>
      </div>
      {action}
    </div>
  );
}
