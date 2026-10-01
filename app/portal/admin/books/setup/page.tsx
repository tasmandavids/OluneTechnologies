import { redirect } from "next/navigation";
import { requireBooksAdmin, BOOKS_PATH } from "@/lib/ledger/server/guard";
import { booksIsChosen, loadLedgerSettings } from "@/lib/ledger/server/data";
import { ACCOUNTING_PATH } from "@/lib/integrations/routes";
import { todayIso } from "@/lib/ledger/periods";
import { BooksSetupWizard } from "@/components/admin/books/BooksSetupWizard";

export default async function BooksSetupPage() {
  const session = await requireBooksAdmin();
  const { supabase, studioId } = session;
  const existing = await loadLedgerSettings(supabase, studioId);
  // Already set up: straight in, or — if the studio moved to Xero since —
  // to Money → Accounting, which is where paused books are resumed.
  if (existing) redirect((await booksIsChosen(supabase, studioId)) ? BOOKS_PATH : ACCOUNTING_PATH);

  const [{ data: xero }, { data: studio }, { count: productCount }] = await Promise.all([
    supabase.from("xero_connections").select("tenant_name").eq("studio_id", studioId).maybeSingle(),
    supabase.from("studios").select("name, gst_number, gst_registered, prices_include_tax").eq("id", studioId).maybeSingle(),
    supabase.from("billing_products").select("id", { count: "exact", head: true }).eq("studio_id", studioId).eq("tax_rate_bp", 1500),
  ]);

  return (
    <div className="mx-auto max-w-4xl p-6">
      <BooksSetupWizard
        today={todayIso("Pacific/Auckland")}
        studioName={(studio?.name as string | undefined) ?? ""}
        xeroOrg={(xero?.tenant_name as string | undefined) ?? null}
        existingTaxNumber={(studio?.gst_number as string | null) ?? null}
        existingPricesIncludeTax={(studio?.prices_include_tax as boolean | undefined) ?? true}
        productsAtNzRate={productCount ?? 0}
      />
    </div>
  );
}
