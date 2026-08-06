// ============================================================================
//  /portal/admin/accounting — merged into Money's Reports tab. Kept as a
//  redirect so old links and bookmarks keep working. Connect results
//  (?connected= / ?error=) now belong to Settings → Connections, which is
//  where the Xero OAuth callback lands.
// ============================================================================

import { redirect } from "next/navigation";
import { CONNECTIONS_PATH } from "@/lib/integrations/routes";

export default async function AccountingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; connected?: string }>;
}) {
  const params = await searchParams;

  if (params.error || params.connected) {
    const qs = new URLSearchParams();
    if (params.error) qs.set("error", params.error);
    if (params.connected) qs.set("connected", params.connected);
    redirect(`${CONNECTIONS_PATH}?${qs.toString()}`);
  }

  redirect("/portal/admin/money?tab=reports");
}
