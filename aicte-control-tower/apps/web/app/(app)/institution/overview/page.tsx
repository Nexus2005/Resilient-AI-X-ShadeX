import { ApiUnavailable } from "@/components/portal/api-unavailable";
import { OverviewView } from "@/components/portal/overview-view";
import { requireRole } from "@/lib/portal";
import { getOverview } from "@/lib/server-data";
import { getSessionToken } from "@/lib/session";

export default async function InstitutionOverviewPage() {
  const user = await requireRole("institution");
  const token = await getSessionToken();
  const overview = await getOverview(token);

  if (!overview) return <ApiUnavailable title="Overview" />;

  return (
    <OverviewView
      user={user}
      overview={overview}
      description="Your applications, deadlines and assigned actions."
    />
  );
}
