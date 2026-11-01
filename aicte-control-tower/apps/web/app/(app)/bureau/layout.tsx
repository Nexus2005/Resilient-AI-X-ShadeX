import { AppShell } from "@/components/app-shell/app-shell";
import { requireRole } from "@/lib/portal";
import { getShellData } from "@/lib/server-data";
import { getSessionToken } from "@/lib/session";

export default async function BureauLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole("bureau_officer");
  const { clock, unread } = await getShellData(await getSessionToken());
  return (
    <AppShell user={user} clock={clock} unread={unread}>
      {children}
    </AppShell>
  );
}
