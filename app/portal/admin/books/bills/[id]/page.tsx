import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "@/lib/i18n/server";
import { GlassPanel } from "@/components/portal/admin/glass/GlassPanel";
import { Amount, Badge, PageHeader, rowStyle, tableClass, tdClass, thClass } from "@/components/admin/books/ui";
import { BillEditor } from "@/components/admin/books/BillEditor";
import { BillActions } from "@/components/admin/books/BillActions";
import { requireBooks, BOOKS_PATH } from "@/lib/ledger/server/guard";
import { todayIso } from "@/lib/ledger/periods";

export default async function BillDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { session, ctx } = await requireBooks();
  const t = await getTranslations("books.bills");

  const { data: bill } = await session.supabase
    .from("ledger_bills")
    .select("id, contact_id, reference, issue_date, due_date, status, amounts_include_tax, subtotal_cents, tax_cents, total_cents, paid_cents, notes, journal_id, contact:ledger_contacts ( name ), ledger_bill_lines ( description, account_id, tax_rate_id, quantity, unit_cents, line_total_cents, sort_order ), ledger_bill_payments ( id, date, amount_cents, bank_account_id, journal_id )")
    .eq("id", id)
    .eq("studio_id", session.studioId)
    .maybeSingle();
  if (!bill) notFound();

  type BL = { description: string; account_id: string; tax_rate_id: string | null; quantity: number; unit_cents: number; line_total_cents: number; sort_order: number };
  type BP = { id: string; date: string; amount_cents: number; bank_account_id: string; journal_id: string | null };
  const lines = ((bill.ledger_bill_lines as BL[]) ?? []).sort((a, b) => a.sort_order - b.sort_order);
  const payments = (bill.ledger_bill_payments as BP[]) ?? [];
  const contactName = (bill.contact as { name?: string } | null)?.name ?? "—";
  const amount = (c: number) => <Amount cents={c} currency={ctx.settings.baseCurrency} locale={ctx.jurisdiction.locale} />;

  if (bill.status === "draft") {
    const { data: contacts } = await session.supabase.from("ledger_contacts").select("id, name, default_account_id").eq("studio_id", session.studioId).eq("is_archived", false).order("name");
    return (
      <div className="mx-auto max-w-6xl space-y-5 p-6">
        <PageHeader title={t("editDraft", { supplier: contactName })} actions={<BillActions billId={id} status="draft" outstandingCents={0} bankAccounts={[]} today={todayIso()} currency={ctx.settings.baseCurrency} locale={ctx.jurisdiction.locale} />} />
        <BillEditor
          initial={{
            id,
            contactId: bill.contact_id as string,
            reference: (bill.reference as string) ?? "",
            issueDate: bill.issue_date as string,
            dueDate: (bill.due_date as string) ?? "",
            amountsIncludeTax: bill.amounts_include_tax as boolean,
            notes: (bill.notes as string) ?? "",
            lines: lines.map((l) => ({ description: l.description, accountId: l.account_id, taxRateId: l.tax_rate_id, quantity: Number(l.quantity), unitCents: Number(l.unit_cents) })),
          }}
          contacts={(contacts ?? []).map((c) => ({ id: c.id as string, name: c.name as string, defaultAccountId: (c.default_account_id as string | null) ?? null }))}
          accounts={ctx.accounts.filter((a) => !a.isArchived && a.type !== "equity")}
          rates={ctx.rates.filter((r) => !r.isArchived && r.appliesTo !== "sales")}
          defaultPurchaseRateCode={ctx.region?.defaultPurchaseCode ?? ctx.jurisdiction.defaultPurchaseCode}
          currency={ctx.settings.baseCurrency}
          locale={ctx.jurisdiction.locale}
          pricesIncludeTax={ctx.settings.pricesIncludeTax}
          taxRegistered={ctx.settings.taxRegistered}
          today={todayIso()}
          defaultDue={(bill.due_date as string) ?? todayIso()}
        />
      </div>
    );
  }

  const outstanding = Number(bill.total_cents) - Number(bill.paid_cents);
  const bankAccounts = ctx.accounts.filter((a) => a.subtype === "bank" && !a.isArchived).map((a) => ({ id: a.id, name: `${a.code} — ${a.name}` }));
  const tone = bill.status === "paid" ? "good" : bill.status === "void" ? "bad" : "warn";

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-6">
      <PageHeader
        title={contactName}
        subtitle={`${bill.reference ?? ""} · ${t("issued")} ${bill.issue_date}${bill.due_date ? ` · ${t("due")} ${bill.due_date}` : ""}`}
        actions={<BillActions billId={id} status={bill.status as "awaiting_payment" | "paid" | "void"} outstandingCents={outstanding} bankAccounts={bankAccounts} today={todayIso()} currency={ctx.settings.baseCurrency} locale={ctx.jurisdiction.locale} />}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={tone}>{t(`status.${bill.status as string}`)}</Badge>
        {bill.journal_id ? (
          <Link href={`${BOOKS_PATH}/journals/${bill.journal_id}`} className="text-xs font-semibold text-[--brand]">
            {t("viewJournal")}
          </Link>
        ) : null}
      </div>

      <GlassPanel className="!p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className={tableClass}>
            <thead>
              <tr>
                <th className={thClass}>{t("description")}</th>
                <th className={thClass}>{t("account")}</th>
                <th className={thClass}>{t("taxRate")}</th>
                <th className={`${thClass} text-right`}>{t("qty")}</th>
                <th className={`${thClass} text-right`}>{t("amount")}</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => {
                const a = ctx.chart.byId.get(l.account_id);
                return (
                  <tr key={i} style={rowStyle}>
                    <td className={tdClass}>{l.description}</td>
                    <td className={`${tdClass} text-muted`}>
                      {a?.code} {a?.name}
                    </td>
                    <td className={`${tdClass} text-muted`}>{ctx.rates.find((r) => r.id === l.tax_rate_id)?.name ?? "—"}</td>
                    <td className={`${tdClass} text-right tabular-nums`}>{Number(l.quantity)}</td>
                    <td className={`${tdClass} text-right`}>{amount(Number(l.line_total_cents))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <dl className="ml-auto max-w-xs space-y-1 px-5 py-4 text-sm">
          <div className="flex justify-between text-muted"><dt>{t("subtotal")}</dt><dd>{amount(Number(bill.subtotal_cents))}</dd></div>
          <div className="flex justify-between text-muted"><dt>{t("tax")}</dt><dd>{amount(Number(bill.tax_cents))}</dd></div>
          <div className="flex justify-between font-semibold text-ink"><dt>{t("total")}</dt><dd>{amount(Number(bill.total_cents))}</dd></div>
          <div className="flex justify-between text-muted"><dt>{t("paid")}</dt><dd>{amount(Number(bill.paid_cents))}</dd></div>
          <div className="flex justify-between font-semibold text-ink"><dt>{t("outstanding")}</dt><dd>{amount(outstanding)}</dd></div>
        </dl>
      </GlassPanel>

      {payments.length > 0 && (
        <GlassPanel className="!p-0 overflow-hidden">
          <p className="px-5 pt-4 text-xs font-semibold uppercase tracking-wider text-muted">{t("payments")}</p>
          <table className={tableClass}>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} style={rowStyle}>
                  <td className={tdClass}>{p.date}</td>
                  <td className={`${tdClass} text-muted`}>{ctx.chart.byId.get(p.bank_account_id)?.name}</td>
                  <td className={`${tdClass} text-right`}>{amount(Number(p.amount_cents))}</td>
                  <td className={`${tdClass} text-right`}>
                    {p.journal_id && (
                      <Link href={`${BOOKS_PATH}/journals/${p.journal_id}`} className="text-xs font-semibold text-[--brand]">
                        {t("viewJournal")}
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </GlassPanel>
      )}
      {bill.notes ? <p className="text-sm text-muted">{bill.notes as string}</p> : null}
    </div>
  );
}
