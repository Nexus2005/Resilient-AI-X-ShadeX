import Link from "next/link";

import { ApplicationsView, type ApplicationSearchParams } from "@/components/portal/applications-view";
import { buttonVariants } from "@/components/ui/button";
import { requireRole } from "@/lib/portal";
import { cn } from "cn";

export default async function InstitutionApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<ApplicationSearchParams>;
}) {
  const user = await requireRole("institution");
  return (
    <ApplicationsView
      user={user}
      basePath="/institution/applications"
      detailBase="/institution/applications"
      searchParams={await searchParams}
      title="Applications"
      description="Every application filed by your institution, with its current stage and clock."
      actions={
        <Link href="/institution/applications/new" className={cn(buttonVariants(), "h-11")}>
          New application
        </Link>
      }
    />
  );
}
