// ============================================================================
//  /portal/admin/payments — merged into Money's Payouts tab. Route kept as a
//  redirect (with the Stripe Connect error/connected params preserved) so
//  old links, bookmarks, and the Stripe Connect return flow keep working.
// ============================================================================

import { redirect } from "next/navigation";

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; connected?: string }>;
}) {
  const params = await searchParams;
  const qs = new URLSearchParams({ tab: "payouts" });
  if (params.error) qs.set("error", params.error);
  if (params.connected) qs.set("connected", params.connected);
  redirect(`/portal/admin/money?${qs.toString()}`);
}
