"use client";

import { useMemo, useState, type ReactNode } from "react";
import { CaretDown, CaretUp, CaretUpDown } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/domain/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "cn";

export type Column<T> = {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  sortValue?: (row: T) => string | number;
  align?: "left" | "right";
};

type SortState = { key: string; direction: "asc" | "desc" } | null;

export function DataTable<T>({
  columns,
  rows,
  getRowId,
  pageSize = 6,
  emptyTitle,
  emptyDescription,
  emptyAction,
  caption,
  initialSort,
}: {
  columns: readonly Column<T>[];
  rows: readonly T[];
  getRowId: (row: T) => string;
  pageSize?: number;
  emptyTitle: string;
  emptyDescription: string;
  emptyAction?: ReactNode;
  caption?: string;
  initialSort?: SortState;
}) {
  const [sort, setSort] = useState<SortState>(initialSort ?? null);
  const [page, setPage] = useState(0);

  const sorted = useMemo(() => {
    if (!sort) return [...rows];
    const column = columns.find((candidate) => candidate.key === sort.key);
    if (!column?.sortValue) return [...rows];
    return [...rows].sort((a, b) => {
      const left = column.sortValue!(a);
      const right = column.sortValue!(b);
      if (left === right) return 0;
      const result = left > right ? 1 : -1;
      return sort.direction === "asc" ? result : -result;
    });
  }, [columns, rows, sort]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const visible = sorted.slice(safePage * pageSize, safePage * pageSize + pageSize);

  if (rows.length === 0) {
    return (
      <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />
    );
  }

  const toggleSort = (key: string) => {
    setSort((current) => {
      if (current?.key !== key) return { key, direction: "asc" };
      return { key, direction: current.direction === "asc" ? "desc" : "asc" };
    });
  };

  return (
    <div className="rounded-2xl border border-line bg-surface">
      <Table>
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <TableHeader className="bg-primary-50">
          <TableRow className="border-line hover:bg-transparent">
            {columns.map((column) => {
              const active = sort?.key === column.key;
              const Icon = !active ? CaretUpDown : sort.direction === "asc" ? CaretUp : CaretDown;
              return (
                <TableHead
                  key={column.key}
                  className={cn(
                    "h-11 px-4 text-[13px] font-medium text-muted",
                    column.align === "right" && "text-right",
                  )}
                >
                  {column.sortValue ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(column.key)}
                      aria-label={`Sort by ${column.header}`}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-md py-1 hover:text-primary-900",
                        active && "text-primary-900",
                      )}
                    >
                      {column.header}
                      <Icon size={13} aria-hidden="true" />
                    </button>
                  ) : (
                    column.header
                  )}
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {visible.map((row) => (
            <TableRow key={getRowId(row)} className="border-line hover:bg-primary-50/60">
              {columns.map((column) => (
                <TableCell
                  key={`${getRowId(row)}-${column.key}`}
                  className={cn(
                    "px-4 py-3.5 text-[14px] text-ink",
                    column.align === "right" && "text-right",
                  )}
                >
                  {column.render(row)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {pageCount > 1 ? (
        <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3">
          <p className="text-[13px] text-muted">
            {safePage * pageSize + 1} to {Math.min((safePage + 1) * pageSize, sorted.length)} of{" "}
            {sorted.length}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((value) => Math.max(0, value - 1))}
              disabled={safePage === 0}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))}
              disabled={safePage >= pageCount - 1}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
