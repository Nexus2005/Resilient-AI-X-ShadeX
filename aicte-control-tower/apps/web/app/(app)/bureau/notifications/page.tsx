import { ApiUnavailable } from "@/components/portal/api-unavailable";
import { NotificationsView } from "@/components/portal/notifications-view";
import { requireRole } from "@/lib/portal";
import { getNotifications } from "@/lib/server-data";
import { getSessionToken } from "@/lib/session";

export default async function BureauNotificationsPage() {
  const user = await requireRole("bureau_officer");
  const data = await getNotifications(await getSessionToken(), 50);
  if (!data) return <ApiUnavailable title="Notifications" />;
  return (
    <NotificationsView user={user} items={data.items} total={data.total} unread={data.unread} />
  );
}
