import type { SupabaseClient } from "@supabase/supabase-js";
import { loadStudioXeroClient } from "./client";

export type XeroAccountOption = { code: string; name: string };

/**
 * Live revenue accounts from the studio's connected Xero org, for a "pick a
 * ledger code" dropdown — never let admins free-type a code, since a typo or
 * a code Xero has since archived would silently fail (or mis-post) at sync
 * time. Returns null when Xero isn't connected so callers can render a
 * "connect Xero first" hint instead of an empty list.
 */
export async function listXeroSalesAccounts(
  supabase: SupabaseClient,
  studioId: string,
  redirectUri: string,
): Promise<XeroAccountOption[] | null> {
  const loaded = await loadStudioXeroClient(supabase, studioId, redirectUri);
  if (!loaded) return null;

  const res = await loaded.client.accountingApi.getAccounts(
    loaded.tenantId,
    undefined,
    'Status=="ACTIVE" AND Class=="REVENUE"',
  );

  return (res.body.accounts ?? [])
    .filter((a): a is typeof a & { code: string } => Boolean(a.code))
    .map((a) => ({ code: a.code, name: a.name ?? a.code }))
    .sort((a, b) => a.code.localeCompare(b.code));
}
