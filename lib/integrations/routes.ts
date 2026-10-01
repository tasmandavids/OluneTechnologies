/**
 * One home for connections. Every OAuth callback, error redirect and
 * "not connected yet" pointer in the app aims here, so there is exactly one
 * place a studio owner manages third-party systems.
 */
export const CONNECTIONS_PATH = "/portal/admin/settings/connections";

/** Deep link to a single provider's card (the hub scrolls to and opens it). */
export function connectionPath(providerId: string): string {
  return `${CONNECTIONS_PATH}#connection-${providerId}`;
}

/**
 * Accounting is the exception: whether a studio keeps its books in Xero or
 * Olune Books is a money decision, so it's made and managed on Money →
 * Accounting, and the Xero OAuth round-trip lands there too.
 */
export const ACCOUNTING_PATH = "/portal/admin/money?tab=accounting";

/** Money → Accounting with a ?connected= / ?error= banner. */
export function accountingPath(banner?: { connected?: string; error?: string }): string {
  const qs = new URLSearchParams({ tab: "accounting" });
  if (banner?.connected) qs.set("connected", banner.connected);
  if (banner?.error) qs.set("error", banner.error);
  return `/portal/admin/money?${qs.toString()}`;
}
