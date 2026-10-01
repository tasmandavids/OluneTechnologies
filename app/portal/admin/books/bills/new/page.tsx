import { getTranslations } from "@/lib/i18n/server";
import { PageHeader } from "@/components/admin/books/ui";
import { BillEditor } from "@/components/admin/books/BillEditor";
import { requireBooks } from "@/lib/ledger/server/guard";
import { addDays, todayIso } from "@/lib/ledger/periods";

export default async function NewBillPage() {
  const { session, ctx } = await requireBooks();
  const t = await getTranslations("books.bills");
  const { data: contacts } = await session.supabase
    .from("ledger_contacts")
    .select("id, name, default_account_id")
    .eq("studio_id", session.studioId)
    .eq("is_archived", false)
    .order("name");
  const today = todayIso();

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-6">
      <PageHeader title={t("newBill")} subtitle={t("newSubtitle")} />
      <BillEditor
        initial={null}
        contacts={(contacts ?? []).map((c) => ({ id: c.id as string, name: c.name as string, defaultAccountId: (c.default_account_id as string | null) ?? null }))}
        accounts={ctx.accounts.filter((a) => !a.isArchived && a.type !== "equity")}
        rates={ctx.rates.filter((r) => !r.isArchived && r.appliesTo !== "sales")}
        defaultPurchaseRateCode={ctx.region?.defaultPurchaseCode ?? ctx.jurisdiction.defaultPurchaseCode}
        currency={ctx.settings.baseCurrency}
        locale={ctx.jurisdiction.locale}
        pricesIncludeTax={ctx.settings.pricesIncludeTax}
        taxRegistered={ctx.settings.taxRegistered}
        today={today}
        defaultDue={addDays(today, 20)}
      />
    </div>
  );
}
