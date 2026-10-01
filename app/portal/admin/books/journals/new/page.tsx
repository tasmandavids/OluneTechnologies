import { getTranslations } from "@/lib/i18n/server";
import { PageHeader } from "@/components/admin/books/ui";
import { JournalEditor } from "@/components/admin/books/JournalEditor";
import { requireBooks } from "@/lib/ledger/server/guard";
import { dayBefore, firstOpenDate, todayIso } from "@/lib/ledger/periods";

export default async function NewJournalPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const { type } = await searchParams;
  const opening = type === "opening";
  const { ctx } = await requireBooks();
  const t = await getTranslations("books.journalEditor");
  const defaultDate = firstOpenDate(ctx.settings.lockDate, opening ? dayBefore(ctx.settings.conversionDate) : todayIso());

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-6">
      <PageHeader title={opening ? t("openingTitle") : t("title")} subtitle={opening ? t("openingSubtitle", { date: ctx.settings.conversionDate }) : t("subtitle")} />
      <JournalEditor
        opening={opening}
        defaultDate={defaultDate}
        lockDate={ctx.settings.lockDate}
        accounts={ctx.accounts.filter((a) => !a.isArchived)}
        rates={ctx.rates.filter((r) => !r.isArchived)}
        currency={ctx.settings.baseCurrency}
        locale={ctx.jurisdiction.locale}
        taxRegistered={ctx.settings.taxRegistered}
      />
    </div>
  );
}
