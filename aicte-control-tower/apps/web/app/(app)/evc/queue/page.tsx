import { ApiUnavailable } from "@/components/portal/api-unavailable";
import { EvcQueueView } from "@/components/portal/evc-queue-view";
import { requireRole } from "@/lib/portal";
import { getEvcQueue, getExperts } from "@/lib/server-data";
import { getSessionToken } from "@/lib/session";

export default async function EvcQueuePage() {
  const user = await requireRole("evc_coordinator");
  const token = await getSessionToken();
  const [cases, experts] = await Promise.all([getEvcQueue(token), getExperts(token)]);
  if (!cases || !experts) return <ApiUnavailable title="EVC queue" />;

  return <EvcQueueView user={user} cases={cases} experts={experts} canSchedule />;
}
