import { ApiUnavailable } from "@/components/portal/api-unavailable";
import { DocumentsView } from "@/components/portal/documents-view";
import { requireRole } from "@/lib/portal";
import { getDocuments } from "@/lib/server-data";
import { getSessionToken } from "@/lib/session";

export default async function RegionalDocumentsPage() {
  const user = await requireRole("regional_officer");
  const documents = await getDocuments(await getSessionToken());
  if (!documents) return <ApiUnavailable title="Documents" />;
  return <DocumentsView user={user} documents={documents} />;
}
