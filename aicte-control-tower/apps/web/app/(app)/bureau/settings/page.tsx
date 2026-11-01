import { SettingsView } from "@/components/portal/settings-view";
import { requireRole } from "@/lib/portal";
import { getPreferences } from "@/lib/server-data";
import { getSessionToken } from "@/lib/session";

export default async function BureauSettingsPage() {
  const user = await requireRole("bureau_officer");
  const preferences = await getPreferences(await getSessionToken());
  return (
    <SettingsView
      user={user}
      initialPreferences={
        preferences ?? { in_app: true, email: true, sms: false, daily_digest: false }
      }
    />
  );
}
