import { ApiUnavailable } from "@/components/portal/api-unavailable";
import { ApplicationWizard } from "@/components/portal/application-wizard";
import { requireRole } from "@/lib/portal";
import { getApplicationMeta } from "@/lib/server-data";
import { getSessionToken } from "@/lib/session";

export default async function NewApplicationPage() {
  await requireRole("institution");
  const meta = await getApplicationMeta(await getSessionToken());

  if (!meta) return <ApiUnavailable title="New application" />;

  return <ApplicationWizard meta={meta} />;
}
