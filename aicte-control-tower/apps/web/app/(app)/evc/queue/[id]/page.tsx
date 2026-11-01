import { notFound } from "next/navigation";

import { ApiUnavailable } from "@/components/portal/api-unavailable";
import { CaseWorkspace } from "@/components/portal/case-workspace";
import { requireRole } from "@/lib/portal";
import { getApplicationDetail } from "@/lib/server-data";
import { getSessionToken } from "@/lib/session";

export default async function EvcCasePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole("evc_coordinator");
  const { id } = await params;
  const token = await getSessionToken();
  const detail = await getApplicationDetail(token, id);

  if (detail === null) {
    const check = await fetch(
      `${process.env.API_INTERNAL_URL ?? "http://localhost:8000/api/v1"}/health`,
    ).catch(() => null);
    if (!check?.ok) return <ApiUnavailable title="Case" />;
    notFound();
  }

  return <CaseWorkspace detail={detail} user={user} basePath="/evc/queue" />;
}
