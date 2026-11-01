import { ApplicationsView, type ApplicationSearchParams } from "@/components/portal/applications-view";
import { requireRole } from "@/lib/portal";

export default async function AdminApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<ApplicationSearchParams>;
}) {
  const user = await requireRole("admin");
  return (
    <ApplicationsView
      user={user}
      basePath="/admin/applications"
      searchParams={await searchParams}
      title="Applications"
      description="Every application across all regions, with the open stage clock."
    />
  );
}
