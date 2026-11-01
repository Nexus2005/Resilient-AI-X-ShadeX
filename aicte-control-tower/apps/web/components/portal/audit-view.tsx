import Link from "next/link";

import { ChainVerify } from "@/components/portal/chain-verify";
import { PageHeader } from "@/components/domain/page-header";
import { buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";
import type { AuditPage, SessionUser } from "@/lib/types";
import { cn } from "cn";

export type AuditSearchParams = {
  page?: string;
  action?: string;
  entity_type?: string;
};

export function AuditView({
  user,
  data,
  basePath,
  searchParams,
}: {
  user: SessionUser;
  data: AuditPage;
  basePath: string;
  searchParams: AuditSearchParams;
}) {
  const pageCount = Math.max(1, Math.ceil(data.total / data.page_size));
  const query = { action: searchParams.action, entity_type: searchParams.entity_type };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumbs={[{ label: user.role === "admin" ? "Admin" : "Bureau Officer" }, { label: "Audit trail" }]}
        title="Audit trail"
        description="Every recorded action, in order, joined by a hash chain. Nothing here can be edited without breaking the chain."
        actions={<ChainVerify />}
      />

      <form
        method="get"
        action={basePath}
        className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 sm:flex-row sm:items-end"
      >
        <div className="flex flex-1 flex-col gap-1.5">
          <label htmlFor="audit-action" className="text-[13px] font-medium text-ink">
            Action contains
          </label>
          <input
            id="audit-action"
            name="action"
            type="search"
            defaultValue={searchParams.action ?? ""}
            placeholder="application.reverted"
            className="h-11 w-full rounded-[12px] border border-line bg-surface px-3.5 text-[14px] focus-visible:border-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600/30"
          />
        </div>
        <div className="flex flex-col gap-1.5 sm:w-[220px]">
          <label htmlFor="audit-entity" className="text-[13px] font-medium text-ink">
            Entity
          </label>
          <select
            id="audit-entity"
            name="entity_type"
            defaultValue={searchParams.entity_type ?? ""}
            className="h-11 w-full rounded-[12px] border border-line bg-surface px-3 text-[14px] focus-visible:border-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600/30"
          >
            <option value="">Every entity</option>
            <option value="application">Application</option>
            <option value="document">Document</option>
            <option value="rule_version">Rule version</option>
            <option value="system_clock">Demo clock</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="submit"
            className={cn(buttonVariants({ variant: "default" }), "h-11")}
          >
            Filter
          </button>
          <Link href={basePath} className={cn(buttonVariants({ variant: "ghost" }), "h-11")}>
            Clear
          </Link>
        </div>
      </form>

      <p className="text-[13px] text-muted">{data.total} events recorded in this view.</p>

      <div className="rounded-2xl border border-line bg-surface">
        <Table>
          <caption className="sr-only">Audit events</caption>
          <TableHeader className="bg-primary-50">
            <TableRow className="border-line hover:bg-transparent">
              {["Recorded", "Action", "Actor", "Entity", "Hash", "Previous hash"].map((header) => (
                <TableHead key={header} className="h-11 px-4 text-[13px] font-medium text-muted">
                  {header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((event) => (
              <TableRow key={event.id} className="border-line hover:bg-primary-50/60">
                <TableCell className="px-4 py-3.5 text-[13px] text-muted">
                  {formatDateTime(event.at)}
                </TableCell>
                <TableCell className="px-4 py-3.5 text-[14px] text-ink">
                  {event.action.replace(/\./g, " ")}
                </TableCell>
                <TableCell className="px-4 py-3.5 text-[14px]">
                  <span className="block">{event.actor_name ?? "System"}</span>
                  <span className="block text-[12px] text-muted">
                    {event.role?.replace(/_/g, " ") ?? "no role"}
                  </span>
                </TableCell>
                <TableCell className="px-4 py-3.5 text-[13px] text-muted">
                  <span className="block">{event.entity_type.replace(/_/g, " ")}</span>
                  <span className="block text-[11px]">{event.entity_id?.slice(0, 8) ?? "not set"}</span>
                </TableCell>
                <TableCell className="px-4 py-3.5">
                  <code className="rounded border border-line px-1.5 py-0.5 text-[11px] text-ink">
                    {event.hash.slice(0, 12)}
                  </code>
                </TableCell>
                <TableCell className="px-4 py-3.5">
                  <code className="rounded border border-line px-1.5 py-0.5 text-[11px] text-muted">
                    {event.prev_hash.slice(0, 12)}
                  </code>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {pageCount > 1 ? (
        <nav aria-label="Pagination" className="flex items-center justify-between gap-3">
          <span className="text-[13px] text-muted">
            Page {data.page} of {pageCount}
          </span>
          <div className="flex gap-2">
            {data.page > 1 ? (
              <Link
                href={{ pathname: basePath, query: { ...query, page: data.page - 1 } }}
                className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
              >
                Previous
              </Link>
            ) : null}
            {data.page < pageCount ? (
              <Link
                href={{ pathname: basePath, query: { ...query, page: data.page + 1 } }}
                className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
              >
                Next
              </Link>
            ) : null}
          </div>
        </nav>
      ) : null}
    </div>
  );
}
