import "server-only";

// ============================================================================
//  Where does this studio keep its books?
//
//  A studio makes ONE accounting choice, recorded in studios.accounting_provider
//  and made on Money → Accounting:
//
//    xero   — Olune pushes invoices, payments and refunds to their Xero org.
//             Xero is where they reconcile, report and file GST.
//    olune  — Olune Books keeps the ledger inside Olune (lib/ledger/*).
//    null   — not chosen yet. Nothing is pushed or posted anywhere.
//
//  The choice is the source of truth. Having a Xero token row or a
//  ledger_settings row is not enough on its own: Books' data survives a switch
//  to Xero (journals are immutable, filed returns are history), so "Books has
//  rows" can't mean "Books is on". Everything — Xero pushes, Books
//  auto-posting, the Money UI — asks here.
//
//  The two are mutually exclusive and the server enforces it: the Xero connect
//  route refuses while Books is chosen, Books setup refuses while Xero is
//  connected. Switching goes through Money → Accounting, which takes the old
//  one down before the new one goes up.
// ============================================================================

import type { IntegrationsQueryClient } from "@/lib/integrations/state";

export const ACCOUNTING_CHOICES = ["xero", "olune"] as const;
export type AccountingChoice = (typeof ACCOUNTING_CHOICES)[number];

export function isAccountingChoice(v: unknown): v is AccountingChoice {
  return (ACCOUNTING_CHOICES as readonly unknown[]).includes(v);
}

export const ACCOUNTING_NAMES: Record<AccountingChoice, string> = {
  xero: "Xero",
  olune: "Olune Books",
};

type QueryBuilder = {
  select: (cols: string) => {
    eq: (col: string, val: string) => PromiseLike<{ data: unknown }>;
  };
};

export type AccountingSetup = {
  /** What the studio chose. */
  choice: AccountingChoice | null;
  /** The studio's Xero org, when a token row exists. */
  xero: { tenantName: string | null; orgShortCode: string | null; syncError: string | null } | null;
  /** Olune Books' settings, when Books has ever been set up (kept after a switch). */
  books: { jurisdiction: string; baseCurrency: string; lastSyncedAt: string | null } | null;
};

/** Everything Money → Accounting needs to explain the studio's position. */
export async function loadAccountingSetup(
  supabase: IntegrationsQueryClient,
  studioId: string,
): Promise<AccountingSetup> {
  const first = async (table: string, cols: string, idColumn = "studio_id") => {
    try {
      const { data } = await (supabase.from(table) as QueryBuilder).select(cols).eq(idColumn, studioId);
      return ((data as Record<string, unknown>[] | null) ?? [])[0] ?? null;
    } catch {
      return null;
    }
  };

  const [studio, xero, books] = await Promise.all([
    first("studios", "accounting_provider", "id"),
    first("xero_connections", "tenant_name, org_short_code, sync_error"),
    first("ledger_settings", "jurisdiction, base_currency, last_synced_at"),
  ]);

  const pinned = studio?.accounting_provider;
  // A choice only counts while the system behind it exists — a Xero token row
  // deleted out from under us reads as "not chosen", so the studio is asked
  // again instead of being shown a broken Xero page. And belt and braces for a
  // Xero row that predates the recorded choice (20261001200000 backfilled
  // these, but a mid-deploy connect could slip by).
  const choice: AccountingChoice | null =
    pinned === "xero" ? (xero ? "xero" : null)
    : pinned === "olune" ? (books ? "olune" : null)
    : xero ? "xero"
    : null;

  return {
    choice,
    xero: xero
      ? {
          tenantName: (xero.tenant_name as string | null) ?? null,
          orgShortCode: (xero.org_short_code as string | null) ?? null,
          syncError: (xero.sync_error as string | null) ?? null,
        }
      : null,
    books: books
      ? {
          jurisdiction: books.jurisdiction as string,
          baseCurrency: books.base_currency as string,
          lastSyncedAt: (books.last_synced_at as string | null) ?? null,
        }
      : null,
  };
}

export type ActiveAccountingProvider = {
  provider: AccountingChoice;
  name: string;
  /** Studio-facing name of the Xero org, or "NZ · NZD" for Books. */
  accountLabel: string | null;
};

/**
 * The studio's working ledger: its choice, and only when that choice is
 * actually live (Xero still connected / Books set up). Null otherwise.
 */
export async function resolveAccountingProvider(
  supabase: IntegrationsQueryClient,
  studioId: string,
): Promise<ActiveAccountingProvider | null> {
  const setup = await loadAccountingSetup(supabase, studioId);
  if (setup.choice === "xero" && setup.xero) {
    return { provider: "xero", name: ACCOUNTING_NAMES.xero, accountLabel: setup.xero.tenantName };
  }
  if (setup.choice === "olune" && setup.books) {
    return {
      provider: "olune",
      name: ACCOUNTING_NAMES.olune,
      accountLabel: `${setup.books.jurisdiction} · ${setup.books.baseCurrency}`,
    };
  }
  return null;
}
