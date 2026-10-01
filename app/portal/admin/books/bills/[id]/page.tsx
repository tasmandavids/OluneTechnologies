import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "@/lib/i18n/server";
import { GlassPanel } from "@/components/portal/admin/glass/GlassPanel";
import { Amount, Badge, PageHeader, rowStyle, tableClass, tdClass, thClass } from "@/components/admin/books/ui";
import { BillEditor } from "@/components/admin/books/BillEditor";
import { BillActions } from "@/components/admin/books/BillActions";
import { BillDocuments, type BillDocument } from "@/components/admin/books/BillDocuments";
import { requireBooks, BOOKS_PATH } from "@/lib/ledger/server/guard";
import { signedAttachmentUrl } from "@/lib/ledger/server/inbox";
import { hasModelAccess } from "@/lib/integrations/ai";
import { Notice } from "@/components/admin/books/ui";
import { todayIso } from "@/lib/ledger/periods";

export default async function BillDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { session, ctx } = await requireBooks();
  const t = await getTranslations("books.bills");
  const ti = await getTranslations("books.inbox");

  const { data: bill } = await session.supabase
    .from("ledger_bills")
    .select("id, contact_id, reference, issue_date, due_date, status, amounts_include_tax, subtotal_cents, tax_cents, total_cents, paid_cents, notes, journal_id, source, submitted_at, extracted, contact:ledger_contacts ( name ), submitter:profiles!submitted_by ( full_name ), ledger_attachments ( id, storage_path, file_name, mime_type, created_at ), ledger_bill_lines ( description, account_id, tax_rate_id, quantity, unit_cents, line_total_cents, sort_order ), ledger_bill_payments ( id, date, amount_cents, bank_account_id, journal_id )")
    .eq("id", id)
    .eq("studio_id", session.studioId)
    .maybeSingle();
  if (!bill) notFound();

  type BL = { description: string; account_id: string; tax_rate_id: string | null; quantity: number; unit_cents: number; line_total_cents: number; sort_order: number };
  type BP = { id: string; date: string; amount_cents: number; bank_account_id: string; journal_id: string | null };
  const lines = ((bill.ledger_bill_lines as BL[]) ?? []).sort((a, b) => a.sort_order - b.sort_order);
  const payments = (bill.ledger_bill_payments as BP[]) ?? [];
  const contactName = (bill.contact as { name?: string } | null)?.name ?? t("unknownSupplier");
  const amount = (c: number) => <Amount cents={c} currency={ctx.settings.baseCurrency} locale={ctx.jurisdiction.locale} />;

  type Att = { id: string; storage_path: string; file_name: string; mime_type: string; created_at: string };
  const atts = ((bill.ledger_attachments as Att[] | null) ?? []).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const [documents, aiAvailable] = await Promise.all([
    Promise.all(atts.map(async (a): Promise<BillDocument> => ({ id: a.id, name: a.file_name, mimeType: a.mime_type, url: await signedAttachmentUrl(a.storage_path) }))),
    bill.status === "draft" ? hasModelAccess(session.studioId) : Promise.resolve(false),
  ]);
  const submitter = (bill.submitter as { full_name?: string | null } | null)?.full_name ?? null;
  const warnings = ((bill.extracted as { warnings?: string[] } | null)?.warnings ?? []).filter((w) => ti.has(`warnings.${w}`));
  const origin =
    bill.source === "staff" ? (
      <Notice>{t("staffSubmitted", { name: submitter ?? "—", date: String(bill.submitted_at ?? "").slice(0, 10) })}</Notice>
    ) : bill.source === "upload" && bill.extracted ? (
      <Notice tone={warnings.length ? "warn" : "neutral"}>
        {ti("readNotice")}
        {warnings.length > 0 && (
          <ul className="mt-1 list-disc pl-5">
            {warnings.map((w) => (
              <li key={w}>{ti(`warnings.${w}`)}</li>
            ))}
          </ul>
        )}
      </Notice>
    ) : bill.source === "upload" && bill.status === "draft" ? (
      <Notice>{aiAvailable ? ti("notReadNotice") : ti("noAiNotice")}</Notice>
    ) : null;

  if (bill.status === "draft") {
    const { data: contacts } = await session.supabase.from("ledger_contacts").select("id, name, default_account_id").eq("studio_id", session.studioId).eq("is_archived", false).order("name");
    const editor = (
        <BillEditor
          initial={{
            id,
            contactId: (bill.contact_id as string | null) ?? "",
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
    );
    const header = (
      <PageHeader title={t("editDraft", { supplier: contactName })} actions={<BillActions billId={id} status="draft" outstandingCents={0} bankAccounts={[]} today={todayIso()} currency={ctx.settings.baseCurrency} locale={ctx.jurisdiction.locale} />} />
    );
    // With a document: review layout, the original beside the bill.
    if (documents.length > 0) {
      return (
        <div className="mx-auto max-w-[1400px] space-y-5 p-6">
          {header}
          {origin}
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
            <div className="xl:sticky xl:top-4 xl:self-start">
              <BillDocuments billId={id} documents={documents} draft aiAvailable={aiAvailable} preview />
            </div>
            <div>{editor}</div>
          </div>
        </div>
      );
    }
    return (
      <div className="mx-auto max-w-6xl space-y-5 p-6">
        {header}
        {origin}
        {editor}
        <BillDocuments billId={id} documents={[]} draft aiAvailable={aiAvailable} preview={false} />
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
      {bill.source === "staff" && origin}
      <BillDocuments billId={id} documents={documents} draft={false} aiAvailable={false} preview={false} />
    </div>
  );
}
