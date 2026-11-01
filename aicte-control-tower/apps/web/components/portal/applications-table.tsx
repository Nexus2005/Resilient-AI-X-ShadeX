import Link from "next/link";
import { CaretDown, CaretUp, CaretUpDown } from "@phosphor-icons/react/dist/ssr";

import { EmptyState } from "@/components/domain/empty-state";
import { StatusLabel, type StatusState } from "@/components/domain/status-label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  APPLICATION_TYPE_LABELS,
  STAGE_LABELS,
  type ApplicationListItem,
} from "@/lib/types";
import { cn } from "cn";

type SortState = { sort: string; direction: "asc" | "desc" };

type ColumnSpec = { key: string; header: string; sortable?: boolean };

const COLUMNS: readonly ColumnSpec[] = [
  { key: "app_no", header: "Application" },
  { key: "institution", header: "Institution" },
  { key: "type", header: "Type" },
  { key: "stage", header: "Stage" },
  { key: "owner", header: "Owner", sortable: false },
  { key: "due_at", header: "Time in stage" },
  { key: "status", header: "State", sortable: false },
];

function sortHref(
  basePath: string,
  query: Record<string, string | undefined>,
  sort: SortState,
  key: string,
): string {
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries(query)) {
    if (value) params.set(name, value);
  }
  const nextDirection = sort.sort === key && sort.direction === "asc" ? "desc" : "asc";
  params.set("sort", key);
  params.set("direction", nextDirection);
  params.delete("page");
  return `${basePath}?${params.toString()}`;
}

export function ApplicationsTable({
  rows,
  basePath,
  detailBase,
  query = {},
  sort = { sort: "submitted_at", direction: "desc" },
  sortable = false,
  emptyTitle = "No applications in this view",
  emptyDescription = "Adjust the filters, or clear the search to see every case in your scope.",
}: {
  rows: readonly ApplicationListItem[];
  basePath: string;
  detailBase?: string;
  query?: Record<string, string | undefined>;
  sort?: SortState;
  sortable?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  if (rows.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <div className="rounded-2xl border border-line bg-surface">
      <Table>
        <caption className="sr-only">Applications</caption>
        <TableHeader className="bg-primary-50">
          <TableRow className="border-line hover:bg-transparent">
            {COLUMNS.map((column) => {
              const canSort = sortable && column.sortable !== false;
              const active = sort.sort === column.key;
              const Icon = !active ? CaretUpDown : sort.direction === "asc" ? CaretUp : CaretDown;
              return (
                <TableHead
                  key={column.key}
                  aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}
                  className="h-11 whitespace-nowrap px-4 text-[13px] font-medium text-muted"
                >
                  {canSort ? (
                    <Link
                      href={sortHref(basePath, query, sort, column.key)}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-md py-1 hover:text-primary-900",
                        active && "text-primary-900",
                      )}
                    >
                      {column.header}
                      <Icon size={13} aria-hidden="true" />
                    </Link>
                  ) : (
                    column.header
                  )}
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow
              key={row.id}
              className={cn(
                "relative border-line hover:bg-primary-50/60",
                row.sla_state === "overdue" && "border-l-2 border-l-danger",
              )}
            >
              <TableCell className="px-4 py-3.5 text-[14px]">
                {detailBase ? (
                  <Link
                    href={`${detailBase}/${row.id}`}
                    className="font-medium text-primary-900 after:absolute after:inset-0 after:content-[''] hover:text-primary-600 focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-primary-600/40"
                  >
                    {row.app_no}
                  </Link>
                ) : (
                  <span className="font-medium text-primary-900">{row.app_no}</span>
                )}
              </TableCell>
              <TableCell className="px-4 py-3.5 text-[14px]">
                <span className="block text-ink">{row.institution_name}</span>
                <span className="block text-[12px] text-muted">
                  {row.institution_state} / {row.region_name}
                </span>
              </TableCell>
              <TableCell className="px-4 py-3.5 text-[14px]">
                {APPLICATION_TYPE_LABELS[row.type] ?? row.type.replace(/_/g, " ")}
              </TableCell>
              <TableCell className="px-4 py-3.5 text-[14px]">
                {STAGE_LABELS[row.current_stage] ?? row.current_stage.replace(/_/g, " ")}
              </TableCell>
              <TableCell className="px-4 py-3.5 text-[14px] text-muted">
                {row.owner_name ?? "Unassigned"}
              </TableCell>
              <TableCell className="px-4 py-3.5 text-[14px]">
                {row.stage_age_days === null ? (
                  <span className="text-[13px] text-muted">No open clock</span>
                ) : (
                  <span
                    className={cn(
                      "tabular-nums",
                      row.sla_state === "overdue" && "font-medium text-danger",
                    )}
                  >
                    {row.stage_age_days} of {row.stage_target_days} days
                  </span>
                )}
              </TableCell>
              <TableCell className="px-4 py-3.5 text-[14px]">
                {row.sla_state ? (
                  <StatusLabel state={row.sla_state as StatusState} />
                ) : (
                  <span className="text-[13px] text-muted">Complete</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
