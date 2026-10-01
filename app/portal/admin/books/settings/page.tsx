import { getTranslations } from "@/lib/i18n/server";
import { PageHeader } from "@/components/admin/books/ui";
import { BooksSettingsForm } from "@/components/admin/books/BooksSettingsForm";
import { requireBooks } from "@/lib/ledger/server/guard";

export default async function BooksSettingsPage() {
  const { ctx } = await requireBooks();
  const t = await getTranslations("books.settings");
  const { settings, jurisdiction: j, region } = ctx;

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-6">
      <PageHeader title={t("title")} subtitle={t("subtitle", { country: `${j.flag} ${j.name}${region ? ` — ${region.name}` : ""}` })} />
      <BooksSettingsForm
        settings={settings}
        jurisdictionCode={j.code}
        custom={j.code === "XX" ? { countryName: settings.customCountryName ?? "", currency: settings.baseCurrency, taxName: settings.customTaxName ?? "Tax", standardRateBp: ctx.rates.find((r) => r.code === "STD")?.rateBp ?? 0, reducedRateBp: ctx.rates.find((r) => r.code === "RED")?.rateBp ?? null } : null}
      />
    </div>
  );
}
