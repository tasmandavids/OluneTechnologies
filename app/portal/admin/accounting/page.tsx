// ============================================================================
//  /portal/admin/accounting — merged into Money's Reports tab. Route kept as
//  a redirect (with the Xero OAuth error/connected params preserved) so old
//  links, bookmarks, and the Xero OAuth callback keep working.
// ============================================================================

import { redirect } from "next/navigation";

export default async function AccountingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; connected?: string }>;
}) {
  const params = await searchParams;
  const qs = new URLSearchParams({ tab: "reports" });
  if (params.error) qs.set("error", params.error);
  if (params.connected) qs.set("connected", params.connected);
  redirect(`/portal/admin/money?${qs.toString()}`);
}
