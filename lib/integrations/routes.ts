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
