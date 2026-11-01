import { ApplicationsView, type ApplicationSearchParams } from "@/components/portal/applications-view";
import { requireRole } from "@/lib/portal";

export default async function BureauApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<ApplicationSearchParams>;
}) {
  const user = await requireRole("bureau_officer");
  return (
    <ApplicationsView
      user={user}
      basePath="/bureau/applications"
      detailBase="/bureau/applications"
      searchParams={await searchParams}
      title="Applications"
      description="Every region. Filter by stage or application type to look for congestion."
    />
  );
}
