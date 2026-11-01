import { ApiUnavailable } from "@/components/portal/api-unavailable";
import { OverviewView } from "@/components/portal/overview-view";
import { requireRole } from "@/lib/portal";
import { getOverview } from "@/lib/server-data";
import { getSessionToken } from "@/lib/session";

export default async function BureauOverviewPage() {
  const user = await requireRole("bureau_officer");
  const token = await getSessionToken();
  const overview = await getOverview(token);

  if (!overview) return <ApiUnavailable title="Overview" />;

  return (
    <OverviewView
      user={user}
      overview={overview}
      description="All regions, with the approval queue and the cases closest to their deadline."
    />
  );
}
