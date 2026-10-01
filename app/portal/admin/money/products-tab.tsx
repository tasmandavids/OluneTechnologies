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
import { loadStudioTuitionContext, tuitionModelPreflight } from "@/lib/billing/tuition-model";
import { resolveAccountingProvider } from "@/lib/accounting/provider";
import {
  getXeroItemOptions,
  getXeroSalesAccountOptions,
} from "@/app/portal/admin/accounting/actions";
import { ProductsCatalog } from "@/components/admin/money/ProductsCatalog";
import { HoursRateCard } from "@/components/admin/money/HoursRateCard";
import { TuitionModelPicker } from "@/components/admin/money/TuitionModelPicker";

export async function ProductsTab() {
  const { supabase, studioId } = await requirePortalSession();

  const [products, taxSettings, terms, activeProvider, tuition, preflight, studio] =
    await Promise.all([
      loadStudioProducts(supabase, studioId, { includeArchived: true }),
      loadStudioTaxSettings(supabase, studioId),
      supabase
        .from("studio_terms")
        .select("id, name, start_date")
        .eq("studio_id", studioId)
        .order("start_date", { ascending: false }),
      resolveAccountingProvider(supabase, studioId),
      loadStudioTuitionContext(supabase, studioId),
      tuitionModelPreflight(supabase, studioId),
      supabase.from("studios").select("sibling_discount_pct").eq("id", studioId).maybeSingle(),
    ]);

  // Code pickers come from the studio's own accounting: Xero's live chart, or
  // Olune Books' revenue accounts. With neither chosen they stay free text.
  let accountOptions: { code: string; name: string }[] | null = null;
  let itemOptions: { code: string; name: string }[] | null = null;
  if (activeProvider?.provider === "xero") {
    const [accountResult, itemResult] = await Promise.all([getXeroSalesAccountOptions(), getXeroItemOptions()]);
    accountOptions = accountResult.ok ? accountResult.data : null;
    itemOptions = itemResult.ok ? itemResult.data : null;
  } else if (activeProvider?.provider === "olune") {
    const { data: revenue } = await supabase
      .from("ledger_accounts")
      .select("code, name")
      .eq("studio_id", studioId)
      .eq("type", "revenue")
      .eq("is_archived", false)
      .order("code");
    accountOptions = (revenue ?? []).map((a) => ({ code: a.code as string, name: a.name as string }));
  }

  return (
    <div className="space-y-4">
      <div className="mx-auto w-full max-w-6xl px-6 pt-6">
        <TuitionModelPicker model={tuition.model} warnings={preflight} />
      </div>

      {tuition.model === "hours" && (
        <div className="mx-auto w-full max-w-6xl px-6">
          <HoursRateCard
            product={tuition.ladderProduct}
            siblingDiscountPct={Number(studio.data?.sibling_discount_pct ?? 0)}
          />
        </div>
      )}

      <ProductsCatalog
        products={products}
        taxSettings={taxSettings}
        terms={(terms.data ?? []).map((t) => ({ id: t.id as string, name: t.name as string }))}
        accountOptions={accountOptions}
        itemOptions={itemOptions}
        ledgerName={activeProvider?.name ?? null}
        showItemCode={activeProvider?.provider !== "olune"}
        tuitionModel={tuition.model}
      />
    </div>
  );
}
