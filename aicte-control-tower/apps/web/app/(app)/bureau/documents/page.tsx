import { ApiUnavailable } from "@/components/portal/api-unavailable";
import { DocumentsView } from "@/components/portal/documents-view";
import { requireRole } from "@/lib/portal";
import { getDocuments } from "@/lib/server-data";
import { getSessionToken } from "@/lib/session";

export default async function BureauDocumentsPage() {
  const user = await requireRole("bureau_officer");
  const documents = await getDocuments(await getSessionToken());
  if (!documents) return <ApiUnavailable title="Documents" />;
  return <DocumentsView user={user} documents={documents} />;
}
