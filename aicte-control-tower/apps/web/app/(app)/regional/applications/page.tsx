import { ApplicationsView, type ApplicationSearchParams } from "@/components/portal/applications-view";
import { requireRole } from "@/lib/portal";

export default async function RegionalApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<ApplicationSearchParams>;
}) {
  const user = await requireRole("regional_officer");
  return (
    <ApplicationsView
      user={user}
      basePath="/regional/applications"
      detailBase="/regional/applications"
      searchParams={await searchParams}
      title="Applications"
      description="Every case in your region. Open a case to see its clocks, documents and action log."
    />
  );
}
