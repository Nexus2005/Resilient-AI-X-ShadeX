import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "cn";

export function PageHeader({
  breadcrumbs,
  title,
  description,
  actions,
  className,
}: {
  breadcrumbs?: readonly { label: string; href?: string }[];
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {breadcrumbs?.length ? (
        <nav aria-label="Breadcrumb">
          <ol className="flex flex-wrap items-center gap-1.5 text-[13px] text-muted">
            {breadcrumbs.map((crumb, index) => (
              <li key={crumb.label} className="flex items-center gap-1.5">
                {index > 0 ? <span aria-hidden="true">/</span> : null}
                {crumb.href ? (
                  <Link href={crumb.href} className="hover:text-primary-700">
                    {crumb.label}
                  </Link>
                ) : (
                  <span className="text-ink">{crumb.label}</span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-[70ch]">
          <h1 className="text-[32px] font-semibold leading-10 tracking-tight">{title}</h1>
          {description ? (
            <p className="mt-2 text-[15px] leading-6 text-muted">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
      </div>
    </div>
  );
}
