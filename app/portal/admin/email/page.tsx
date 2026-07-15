// ============================================================================
//  /portal/admin/email — merged into the Inbox at /portal/admin/messages
//  (1.6.1 IA). Route kept as a redirect so old links and the email OAuth
//  callbacks (?connected= / ?error=) keep working.
// ============================================================================

import { redirect } from "next/navigation";

export default async function EmailPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; connected?: string }>;
}) {
  const params = await searchParams;
  const qs = new URLSearchParams({ tab: "email" });
  if (params.error) qs.set("error", params.error);
  if (params.connected) qs.set("connected", params.connected);
  redirect(`/portal/admin/messages?${qs.toString()}`);
}
