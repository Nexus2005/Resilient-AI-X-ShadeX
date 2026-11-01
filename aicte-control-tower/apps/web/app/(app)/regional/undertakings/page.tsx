import { ApiUnavailable } from "@/components/portal/api-unavailable";
import { ObligationsView } from "@/components/portal/obligations-view";
import { requireRole } from "@/lib/portal";
import { getObligations } from "@/lib/server-data";
import { getSessionToken } from "@/lib/session";

export default async function RegionalUndertakingsPage() {
  const user = await requireRole("regional_officer");
  const items = await getObligations(await getSessionToken());
  if (!items) return <ApiUnavailable title="Undertakings" />;
  return <ObligationsView user={user} items={items} />;
}
