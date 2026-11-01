import { ApiUnavailable } from "@/components/portal/api-unavailable";
import { AuditView, type AuditSearchParams } from "@/components/portal/audit-view";
import { requireRole } from "@/lib/portal";
import { getAudit } from "@/lib/server-data";
import { getSessionToken } from "@/lib/session";

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<AuditSearchParams>;
}) {
  const user = await requireRole("admin");
  const params = await searchParams;
  const page = Number.parseInt(params.page ?? "1", 10) || 1;

  const query = new URLSearchParams({ page: String(page), page_size: "25" });
  if (params.action) query.set("action", params.action);
  if (params.entity_type) query.set("entity_type", params.entity_type);

  const data = await getAudit(await getSessionToken(), query);
  if (!data) return <ApiUnavailable title="Audit trail" />;

  return <AuditView user={user} data={data} basePath="/admin/audit" searchParams={params} />;
}
