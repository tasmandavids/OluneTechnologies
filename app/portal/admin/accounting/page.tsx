// ============================================================================
//  /portal/admin/accounting — now Money → Accounting. Kept as a redirect so
//  old links, bookmarks and any in-flight ?connected= / ?error= banners keep
//  working.
// ============================================================================

import { redirect } from "next/navigation";
import { accountingPath } from "@/lib/integrations/routes";

export default async function AccountingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; connected?: string }>;
}) {
  const params = await searchParams;
  redirect(accountingPath({ connected: params.connected, error: params.error }));
}
