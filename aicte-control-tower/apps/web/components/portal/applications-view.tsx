import Link from "next/link";
import type { ReactNode } from "react";

import { ApplicationsTable } from "@/components/portal/applications-table";
import { PageHeader } from "@/components/domain/page-header";
import { buttonVariants } from "@/components/ui/button";
import { apiGet } from "@/lib/api";
import { getSessionToken } from "@/lib/session";
import {
  APPLICATION_TYPE_LABELS,
  ROLE_LABELS,
  STAGE_LABELS,
  type ApplicationPage,
  type SessionUser,
} from "@/lib/types";
import { cn } from "cn";

const filterableStages = Object.entries(STAGE_LABELS);

export type ApplicationSearchParams = {
  search?: string;
  stage?: string;
  type?: string;
  page?: string;
  sort?: string;
  direction?: string;
};

const SORT_KEYS = ["submitted_at", "app_no", "institution", "stage", "status", "type", "due_at"];

export async function ApplicationsView({
  user,
  basePath,
  detailBase,
  searchParams,
  title,
  description,
  fixedStage,
  actions,
}: {
  user: SessionUser;
  basePath: string;
  detailBase?: string;
  searchParams: ApplicationSearchParams;
  title: string;
  description: string;
  fixedStage?: string;
  actions?: ReactNode;
}) {
  const token = await getSessionToken();
  const page = Number.parseInt(searchParams.page ?? "1", 10) || 1;
  const sort = SORT_KEYS.includes(searchParams.sort ?? "") ? searchParams.sort! : "submitted_at";
  const direction = searchParams.direction === "asc" ? "asc" : "desc";

  const query = new URLSearchParams({
    page: String(page),
    page_size: "20",
    sort,
    direction,
  });
  if (searchParams.search) query.set("search", searchParams.search);
  if (searchParams.type) query.set("type", searchParams.type);
  const stage = fixedStage ?? searchParams.stage;
  if (stage) query.set("stage", stage);

  let data: ApplicationPage | null = null;
  try {
    data = await apiGet<ApplicationPage>(`/applications?${query.toString()}`, token);
  } catch {
    data = null;
  }

  const pageCount = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;
  const pageQuery = {
    search: searchParams.search,
    stage: searchParams.stage,
    type: searchParams.type,
    sort,
    direction,
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumbs={[{ label: ROLE_LABELS[user.role] }, { label: title }]}
        title={title}
        description={description}
        actions={actions}
      />

      <form
        method="get"
        action={basePath}
        className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 sm:flex-row sm:items-end"
      >
        <input type="hidden" name="sort" value={sort} />
        <input type="hidden" name="direction" value={direction} />
        <div className="flex flex-1 flex-col gap-1.5">
          <label htmlFor="filter-search" className="text-[13px] font-medium text-ink">
            Search
          </label>
          <input
            id="filter-search"
            name="search"
            type="search"
            defaultValue={searchParams.search ?? ""}
            placeholder="Application number, institution or district"
            className="h-11 w-full rounded-[12px] border border-line bg-surface px-3.5 text-[14px] focus-visible:border-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600/30"
          />
        </div>

        {fixedStage ? null : (
          <div className="flex flex-col gap-1.5 sm:w-[200px]">
            <label htmlFor="filter-stage" className="text-[13px] font-medium text-ink">
              Stage
            </label>
            <select
              id="filter-stage"
              name="stage"
              defaultValue={searchParams.stage ?? ""}
              className="h-11 w-full rounded-[12px] border border-line bg-surface px-3 text-[14px] focus-visible:border-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600/30"
            >
              <option value="">All stages</option>
              {filterableStages.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex flex-col gap-1.5 sm:w-[220px]">
          <label htmlFor="filter-type" className="text-[13px] font-medium text-ink">
            Application type
          </label>
          <select
            id="filter-type"
            name="type"
            defaultValue={searchParams.type ?? ""}
            className="h-11 w-full rounded-[12px] border border-line bg-surface px-3 text-[14px] focus-visible:border-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600/30"
          >
            <option value="">All types</option>
            {Object.entries(APPLICATION_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <button type="submit" className={cn(buttonVariants(), "h-11")}>
            Apply filters
          </button>
          <Link href={basePath} className={cn(buttonVariants({ variant: "ghost" }), "h-11")}>
            Clear
          </Link>
        </div>
      </form>

      {data ? (
        <>
          <p className="text-[13px] text-muted" aria-live="polite">
            {data.total} {data.total === 1 ? "application" : "applications"} in this view. Sorted by{" "}
            {sort.replace("_", " ")}, {direction === "asc" ? "ascending" : "descending"}.
          </p>
          <ApplicationsTable
            rows={data.items}
            basePath={basePath}
            detailBase={detailBase}
            query={pageQuery}
            sort={{ sort, direction }}
            sortable
            emptyTitle="No matching applications"
            emptyDescription="Try a different stage, type or search term."
          />
          {pageCount > 1 ? (
            <nav aria-label="Pagination" className="flex items-center justify-between gap-3">
              <span className="text-[13px] text-muted">
                Page {data.page} of {pageCount}
              </span>
              <div className="flex gap-2">
                {data.page > 1 ? (
                  <Link
                    href={{
                      pathname: basePath,
                      query: { ...pageQuery, page: data.page - 1 },
                    }}
                    className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                  >
                    Previous
                  </Link>
                ) : null}
                {data.page < pageCount ? (
                  <Link
                    href={{
                      pathname: basePath,
                      query: { ...pageQuery, page: data.page + 1 },
                    }}
                    className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                  >
                    Next
                  </Link>
                ) : null}
              </div>
            </nav>
          ) : null}
        </>
      ) : (
        <div className="rounded-2xl border border-line bg-surface p-6">
          <h2 className="text-[16px] font-semibold">The application service did not respond</h2>
          <p className="mt-1 text-[14px] leading-6 text-muted">
            Check that the API is running, then reload this page. No figures are shown because
            nothing could be read.
          </p>
        </div>
      )}
    </div>
  );
}
