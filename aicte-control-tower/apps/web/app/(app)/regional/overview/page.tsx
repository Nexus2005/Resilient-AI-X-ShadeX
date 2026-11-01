import { ApiUnavailable } from "@/components/portal/api-unavailable";
import { OverviewView } from "@/components/portal/overview-view";
import { requireRole } from "@/lib/portal";
import { getOverview } from "@/lib/server-data";
import { getSessionToken } from "@/lib/session";

export default async function RegionalOverviewPage() {
  const user = await requireRole("regional_officer");
  const token = await getSessionToken();
  const overview = await getOverview(token);

  if (!overview) return <ApiUnavailable title="Overview" />;

  return (
    <OverviewView
      user={user}
      overview={overview}
      description="Cases in your region, with the clocks that are closest to their target."
    />
  );
}
