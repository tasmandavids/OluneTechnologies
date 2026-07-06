import type { SupabaseClient } from "@supabase/supabase-js";
import { loadStudioXeroClient } from "./client";

export type XeroAccountOption = { code: string; name: string };
export type XeroItemOption = { code: string; name: string };

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

/**
 * Live sellable Items from the studio's connected Xero org (Xero's own
 * Products & Services catalog), for a "pick an item code" dropdown. Distinct
 * from an account code — an Item is a specific sellable thing (e.g.
 * "TUITION-BALLET") that can carry its own default account/tax, whereas an
 * account code is just the ledger bucket. Never let admins free-type a code.
 */
export async function listXeroSalesItems(
  supabase: SupabaseClient,
  studioId: string,
  redirectUri: string,
): Promise<XeroItemOption[] | null> {
  const loaded = await loadStudioXeroClient(supabase, studioId, redirectUri);
  if (!loaded) return null;

  const res = await loaded.client.accountingApi.getItems(
    loaded.tenantId,
    undefined,
    "IsSold==true",
  );

  return (res.body.items ?? [])
    .filter((i): i is typeof i & { code: string } => Boolean(i.code))
    .map((i) => ({ code: i.code, name: i.name ?? i.code }))
    .sort((a, b) => a.code.localeCompare(b.code));
}
