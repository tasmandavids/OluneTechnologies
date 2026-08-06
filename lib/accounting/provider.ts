import "server-only";

// ============================================================================
//  Which ledger is this studio's source of truth?
//
//  Until now the answer was always Xero, and lib/xero/* was called directly.
//  QuickBooks and MYOB change that, so the rest of the app should ask here
//  instead of assuming. Today only Xero reports `syncSupported: true` — the
//  other two connect and store tokens but have no sync code, and callers must
//  respect that rather than pretending.
//
//  The intended migration path: as each provider's sync lands, implement it
//  behind this resolver and flip `syncSupported`. No caller changes.
// ============================================================================

import { ACCOUNTING_PROVIDER_IDS, type AccountingProviderId } from "@/lib/integrations/catalog";
import type { IntegrationsQueryClient } from "@/lib/integrations/state";

type QueryBuilder = {
  select: (cols: string) => {
    eq: (col: string, val: string) => PromiseLike<{ data: unknown }>;
  };
};

export type AccountingProviderCapabilities = {
  id: AccountingProviderId;
  name: string;
  /** Does invoice/payment sync actually run for this provider? */
  syncSupported: boolean;
  /** Can classes carry a provider account/item code? (Xero-only today.) */
  lineItemCoding: boolean;
};

export const ACCOUNTING_CAPABILITIES: Record<
  AccountingProviderId,
  AccountingProviderCapabilities
> = {
  xero: { id: "xero", name: "Xero", syncSupported: true, lineItemCoding: true },
  // lineItemCoding is true for all three now: the billing catalogue (0105)
  // stores account/item codes provider-neutrally, with per-provider overrides
  // in billing_product_ledger_codes, so a studio can code its products for
  // QuickBooks or MYOB today. syncSupported stays false — the codes are
  // captured and ready, but nothing pushes them yet.
  quickbooks: {
    id: "quickbooks",
    name: "QuickBooks Online",
    syncSupported: false,
    lineItemCoding: true,
  },
  myob: { id: "myob", name: "MYOB Business", syncSupported: false, lineItemCoding: true },
};

export type ActiveAccountingProvider = {
  provider: AccountingProviderId;
  capabilities: AccountingProviderCapabilities;
  /** Studio-facing name of the connected organisation / company file. */
  accountLabel: string | null;
  /** True when more than one ledger is connected and one had to be picked. */
  ambiguous: boolean;
};


/**
 * Resolve the studio's active ledger. Preference order:
 *   1. studios.accounting_provider, when that provider is actually connected
 *   2. Xero, if connected (the historical default)
 *   3. Whichever of QuickBooks/MYOB is connected
 *   4. null — no ledger connected
 */
export async function resolveAccountingProvider(
  supabase: IntegrationsQueryClient,
  studioId: string,
): Promise<ActiveAccountingProvider | null> {
  const readMany = async (
    table: string,
    cols: string,
    idColumn = "studio_id",
  ): Promise<Record<string, unknown>[]> => {
    try {
      const { data } = await (supabase.from(table) as QueryBuilder)
        .select(cols)
        .eq(idColumn, studioId);
      return (data as Record<string, unknown>[] | null) ?? [];
    } catch {
      return [];
    }
  };

  const [studioRows, xeroRows, genericRows] = await Promise.all([
    readMany("studios", "accounting_provider", "id"),
    readMany("xero_connections", "tenant_name"),
    readMany("studio_integrations", "provider, display_name, status"),
  ]);

  const connected = new Map<AccountingProviderId, string | null>();
  if (xeroRows[0]) {
    connected.set("xero", (xeroRows[0].tenant_name as string | null) ?? null);
  }
  for (const row of genericRows) {
    const id = row.provider as string;
    if ((ACCOUNTING_PROVIDER_IDS as readonly string[]).includes(id)) {
      connected.set(id as AccountingProviderId, (row.display_name as string | null) ?? null);
    }
  }

  if (connected.size === 0) return null;

  const pinned = studioRows[0]?.accounting_provider as AccountingProviderId | null | undefined;
  const chosen: AccountingProviderId =
    pinned && connected.has(pinned)
      ? pinned
      : connected.has("xero")
        ? "xero"
        : ([...connected.keys()][0] as AccountingProviderId);

  return {
    provider: chosen,
    capabilities: ACCOUNTING_CAPABILITIES[chosen],
    accountLabel: connected.get(chosen) ?? null,
    ambiguous: connected.size > 1,
  };
}

/**
 * Guard for code paths that push to the ledger. Returns the provider only when
 * sync is genuinely implemented, so a QuickBooks studio silently skips the
 * Xero-shaped push instead of erroring or writing to the wrong place.
 */
export async function resolveSyncableAccountingProvider(
  supabase: IntegrationsQueryClient,
  studioId: string,
): Promise<ActiveAccountingProvider | null> {
  const active = await resolveAccountingProvider(supabase, studioId);
  if (!active?.capabilities.syncSupported) return null;
  return active;
}
