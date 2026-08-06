// ============================================================================
//  Products tab (Money) — the studio's billing catalogue.
//
//  Everything a studio sells lives here with its pricing model, GST treatment
//  and accounting codes, and the rest of the app buys from it: class fees,
//  class passes, private lessons, subscription lines and manual invoice lines.
//
//  Ledger dropdowns are only offered when Xero is connected, because they're
//  backed by a live call to that org's chart of accounts. Without a connection
//  the same fields stay free text rather than disappearing — a studio still
//  wants to record the codes its bookkeeper uses.
// ============================================================================

import { requirePortalSession } from "@/lib/portal/session";
import { loadStudioProducts, loadStudioTaxSettings } from "@/lib/billing/catalog";
import { resolveAccountingProvider } from "@/lib/accounting/provider";
import {
  getXeroItemOptions,
  getXeroSalesAccountOptions,
} from "@/app/portal/admin/accounting/actions";
import { ProductsCatalog } from "@/components/admin/money/ProductsCatalog";

export async function ProductsTab() {
  const { supabase, studioId } = await requirePortalSession();

  const [products, taxSettings, terms, activeProvider] = await Promise.all([
    loadStudioProducts(supabase, studioId, { includeArchived: true }),
    loadStudioTaxSettings(supabase, studioId),
    supabase
      .from("studio_terms")
      .select("id, name, start_date")
      .eq("studio_id", studioId)
      .order("start_date", { ascending: false }),
    resolveAccountingProvider(supabase, studioId),
  ]);

  // Both yield null when Xero isn't connected (or the call failed), which is
  // exactly the signal the editor uses to fall back to free-text code entry.
  const [accountResult, itemResult] = await Promise.all([
    getXeroSalesAccountOptions(),
    getXeroItemOptions(),
  ]);
  const accountOptions = accountResult.ok ? accountResult.data : null;
  const itemOptions = itemResult.ok ? itemResult.data : null;

  return (
    <ProductsCatalog
      products={products}
      taxSettings={taxSettings}
      terms={(terms.data ?? []).map((t) => ({ id: t.id as string, name: t.name as string }))}
      accountOptions={accountOptions}
      itemOptions={itemOptions}
      ledgerName={activeProvider?.capabilities.name ?? null}
      otherLedgersConnected={activeProvider?.ambiguous ?? false}
    />
  );
}
