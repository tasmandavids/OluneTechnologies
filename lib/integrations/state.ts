import "server-only";

// ============================================================================
//  Per-studio connection state for the Settings → Connections hub.
//
//  Four integrations predate the generic table and keep their bespoke homes
//  (xero_connections, stripe_connect_accounts, email_accounts,
//  social_connections). Everything else lives in studio_integrations. This
//  module is the one place that knows which is which, so the UI can treat all
//  providers identically.
// ============================================================================

import { INTEGRATIONS } from "./catalog";
import { isProviderConfigured } from "./env";
import { emptyState, type IntegrationState, type IntegrationStateMap } from "./types";

/**
 * Structural, not `SupabaseClient<...>`: the generated database generics vary
 * by call site and none of these reads need typed rows. `from` returns
 * `unknown` so TypeScript doesn't have to unify Supabase's deeply generic
 * query-builder types at every call site.
 */
export type IntegrationsQueryClient = { from: (table: string) => unknown };

type QueryBuilder = {
  select: (cols: string) => {
    eq: (col: string, val: string) => PromiseLike<{ data: unknown }>;
  };
};

export type GenericIntegrationRow = {
  id: string;
  provider: string;
  status: "connected" | "pending" | "error";
  display_name: string | null;
  external_account_id: string | null;
  metadata: Record<string, unknown> | null;
  last_verified_at: string | null;
  last_error: string | null;
  updated_at: string;
};

/**
 * Build the state map for every catalog entry. Missing tables or RLS denials
 * degrade to "not connected" rather than throwing — the hub must render even
 * if one integration's storage is unavailable.
 */
export async function loadIntegrationStates(
  supabase: IntegrationsQueryClient,
  studioId: string,
): Promise<IntegrationStateMap> {
  const states: IntegrationStateMap = {};
  for (const provider of INTEGRATIONS) {
    states[provider.id] = emptyState(provider.id, isProviderConfigured(provider));
  }

  const safe = async (table: string, cols: string): Promise<Record<string, unknown>[]> => {
    try {
      const { data } = await (supabase.from(table) as QueryBuilder)
        .select(cols)
        .eq("studio_id", studioId);
      return (data as Record<string, unknown>[] | null) ?? [];
    } catch {
      return [];
    }
  };

  const [xero, stripe, email, social, generic] = await Promise.all([
    safe("xero_connections", "tenant_name, last_sync_at, sync_error, updated_at"),
    safe(
      "stripe_connect_accounts",
      "stripe_account_id, charges_enabled, payouts_enabled, details_submitted, disabled_reason, last_synced_at",
    ),
    safe("email_accounts", "provider, email_address, display_name, last_sync_at, sync_error"),
    safe("social_connections", "platform, account_id, account_name, last_sync_at, sync_error"),
    safe(
      "studio_integrations",
      "id, provider, status, display_name, external_account_id, metadata, last_verified_at, last_error, updated_at",
    ),
  ]);

  const xeroRow = xero[0];
  if (xeroRow && states.xero) {
    const syncError = (xeroRow.sync_error as string | null) ?? null;
    states.xero = {
      ...states.xero,
      connected: true,
      accountLabel: (xeroRow.tenant_name as string | null) ?? "Xero organisation",
      status: syncError ? "error" : "connected",
      lastActivityAt: (xeroRow.last_sync_at as string | null) ?? (xeroRow.updated_at as string | null),
      error: syncError,
    };
  }

  const stripeRow = stripe[0];
  if (stripeRow && states.stripe) {
    const chargesEnabled = stripeRow.charges_enabled === true;
    states.stripe = {
      ...states.stripe,
      connected: true,
      accountLabel: (stripeRow.stripe_account_id as string | null) ?? "Stripe account",
      status: chargesEnabled ? "connected" : "pending",
      lastActivityAt: (stripeRow.last_synced_at as string | null) ?? null,
      error: chargesEnabled ? null : ((stripeRow.disabled_reason as string | null) ?? null),
    };
  }

  // A studio can connect several mailboxes on the same provider. One card can
  // only name one, so say how many there are — the inbox's per-account controls
  // stay the way to remove just one of them.
  const mailboxCounts = new Map<string, number>();
  for (const row of email) {
    const providerId = row.provider as string;
    const current = states[providerId];
    if (!current) continue;
    const count = (mailboxCounts.get(providerId) ?? 0) + 1;
    mailboxCounts.set(providerId, count);
    const syncError = (row.sync_error as string | null) ?? null;
    const address = (row.email_address as string | null) ?? (row.display_name as string | null);
    states[providerId] = {
      ...current,
      connected: true,
      accountLabel: count > 1 ? `${count} mailboxes` : address,
      // Any mailbox in error puts the whole card in error.
      status: syncError || current.status === "error" ? "error" : "connected",
      lastActivityAt: (row.last_sync_at as string | null) ?? current.lastActivityAt,
      error: syncError ?? current.error,
    };
  }

  for (const row of social) {
    const providerId = row.platform as string;
    const current = states[providerId];
    if (!current) continue;
    const syncError = (row.sync_error as string | null) ?? null;
    states[providerId] = {
      ...current,
      connected: true,
      accountLabel: (row.account_name as string | null) ?? (row.account_id as string | null),
      status: syncError ? "error" : "connected",
      lastActivityAt: (row.last_sync_at as string | null) ?? null,
      error: syncError,
    };
  }

  for (const row of generic) {
    const providerId = row.provider as string;
    const current = states[providerId];
    if (!current) continue;
    const status = (row.status as GenericIntegrationRow["status"]) ?? "connected";
    states[providerId] = {
      ...current,
      connected: status !== "error" || Boolean(row.external_account_id),
      accountLabel:
        (row.display_name as string | null) ?? (row.external_account_id as string | null),
      status,
      lastActivityAt:
        (row.last_verified_at as string | null) ?? (row.updated_at as string | null) ?? null,
      error: (row.last_error as string | null) ?? null,
    };
  }

  return states;
}

export function connectedCount(states: IntegrationStateMap): number {
  return Object.values(states).filter((s: IntegrationState) => s.connected).length;
}

export function attentionCount(states: IntegrationStateMap): number {
  return Object.values(states).filter(
    (s: IntegrationState) => s.status === "error" || s.status === "pending",
  ).length;
}
