import { getTranslations } from "@/lib/i18n/server";
import { PageHeader } from "@/components/admin/books/ui";
import { AccountsManager } from "@/components/admin/books/AccountsManager";
import { requireBooks } from "@/lib/ledger/server/guard";
import { fetchMovements } from "@/lib/ledger/server/data";
import { todayIso } from "@/lib/ledger/periods";
import { normalBalance, toMovementMap } from "@/lib/ledger/reports";

export default async function BooksAccountsPage() {
  const { session, ctx } = await requireBooks();
  const t = await getTranslations("books.accounts");
  const movements = toMovementMap(await fetchMovements(session.supabase, session.studioId, null, todayIso()));
  const balances = Object.fromEntries(ctx.accounts.map((a) => [a.id, normalBalance(a, movements.get(a.id))]));

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-6">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <AccountsManager
        accounts={ctx.accounts}
        rates={ctx.rates}
        balances={balances}
        currency={ctx.settings.baseCurrency}
        locale={ctx.jurisdiction.locale}
        taxName={ctx.jurisdiction.taxName}
      />
    </div>
  );
}
