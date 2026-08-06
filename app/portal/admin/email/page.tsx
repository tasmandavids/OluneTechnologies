// ============================================================================
//  /portal/admin/email — merged into the Inbox at /portal/admin/messages
//  (1.6.1 IA). Kept as a redirect so old links keep working. Connect results
//  (?connected= / ?error=) now belong to Settings → Connections, which is
//  where the mail OAuth callbacks land.
// ============================================================================

import { redirect } from "next/navigation";
import { CONNECTIONS_PATH } from "@/lib/integrations/routes";

export default async function EmailPage({
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

  redirect("/portal/admin/messages?tab=email");
}
