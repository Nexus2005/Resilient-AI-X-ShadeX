import { ApiUnavailable } from "@/components/portal/api-unavailable";
import { EscalationsView } from "@/components/portal/escalations-view";
import { requireRole } from "@/lib/portal";
import { getEscalations } from "@/lib/server-data";
import { getSessionToken } from "@/lib/session";

export default async function RegionalEscalationsPage() {
  const user = await requireRole("regional_officer");
  const items = await getEscalations(await getSessionToken());
  if (!items) return <ApiUnavailable title="Escalations" />;
  return <EscalationsView user={user} items={items} />;
}
