import Link from "next/link";
import { getTranslations } from "@/lib/i18n/server";
import { GlassPanel } from "@/components/portal/admin/glass/GlassPanel";
import { Amount, Badge, PageHeader, StatCard, primaryButton, rowStyle, tableClass, tdClass, thClass } from "@/components/admin/books/ui";
import { requireBooks, BOOKS_PATH } from "@/lib/ledger/server/guard";
import { formatLedgerMoney } from "@/lib/ledger/money";
import { todayIso } from "@/lib/ledger/periods";
import { hasModelAccess } from "@/lib/integrations/ai";
import { BillInbox } from "@/components/admin/books/BillInbox";

// Drafts first: that's the inbox — uploads and staff invoices waiting for a look.
const STATUSES = ["draft", "awaiting_payment", "paid", "void"] as const;
type Status = (typeof STATUSES)[number];

export default async function BillsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const params = await searchParams;
  const { session, ctx } = await requireBooks();
  const t = await getTranslations("books.bills");
  const today = todayIso();

  const [{ count: draftCount }, { data: open }, aiAvailable] = await Promise.all([
    session.supabase.from("ledger_bills").select("id", { count: "exact", head: true }).eq("studio_id", session.studioId).eq("status", "draft"),
    session.supabase.from("ledger_bills").select("total_cents, paid_cents, due_date").eq("studio_id", session.studioId).eq("status", "awaiting_payment"),
    hasModelAccess(session.studioId),
  ]);
  // Open on whatever needs attention: drafts to review, else bills to pay.
  const status: Status = STATUSES.includes(params.status as Status) ? (params.status as Status) : (draftCount ?? 0) > 0 ? "draft" : "awaiting_payment";
  const { data: bills } = await session.supabase
    .from("ledger_bills")
    .select("id, reference, issue_date, due_date, status, source, total_cents, paid_cents, contact:ledger_contacts ( name ), ledger_attachments ( count )")
    .eq("studio_id", session.studioId)
    .eq("status", status)
    .order(status === "draft" ? "created_at" : "due_date", { ascending: status !== "paid" && status !== "draft" })
    .limit(200);

  const owing = (open ?? []).reduce((s, b) => s + Number(b.total_cents) - Number(b.paid_cents), 0);
  function isPastDue(due: unknown): boolean {
    return typeof due === "string" && due.localeCompare(today) < 0;
  }
  const overdue = (open ?? [])
    .filter((b) => isPastDue(b.due_date))
    .reduce((s, b) => s + Number(b.total_cents) - Number(b.paid_cents), 0);
  const money = (c: number) => formatLedgerMoney(c, ctx.settings.baseCurrency, ctx.jurisdiction.locale);

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-6">
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        actions={
          <Link href={`${BOOKS_PATH}/bills/new`} className={primaryButton}>
            {t("newBill")}
          </Link>
        }
      />
      <BillInbox currency={ctx.settings.baseCurrency} locale={ctx.jurisdiction.locale} aiAvailable={aiAvailable} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <StatCard label={t("owing")} value={money(owing)} sub={t("owingSub", { count: open?.length ?? 0 })} />
        <StatCard label={t("overdue")} value={money(overdue)} />
      </div>

      <div className="flex flex-wrap gap-1">
        {STATUSES.map((s) => (
          <Link
            key={s}
            href={`${BOOKS_PATH}/bills?status=${s}`}
            className="rounded-[10px] px-3 py-1.5 text-xs font-semibold"
            style={{ color: s === status ? "var(--ink)" : "var(--muted)", background: s === status ? "var(--t3)" : "transparent", border: `1px solid ${s === status ? "var(--tb)" : "transparent"}` }}
          >
            {s === "draft" ? t("toReview") : t(`status.${s}`)}
            {s === "draft" && (draftCount ?? 0) > 0 ? ` (${draftCount})` : ""}
          </Link>
        ))}
      </div>

      <GlassPanel className="!p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className={tableClass}>
            <thead>
              <tr>
                <th className={thClass}>{t("supplier")}</th>
                <th className={thClass}>{t("reference")}</th>
                <th className={thClass}>{t("issued")}</th>
                <th className={thClass}>{t("due")}</th>
                <th className={`${thClass} text-right`}>{t("total")}</th>
                <th className={`${thClass} text-right`}>{t("outstanding")}</th>
              </tr>
            </thead>
            <tbody>
              {(bills ?? []).map((b) => {
                const out = Number(b.total_cents) - Number(b.paid_cents);
                const late = b.status === "awaiting_payment" && isPastDue(b.due_date);
                const attached = ((b.ledger_attachments as { count: number }[] | null) ?? [])[0]?.count ?? 0;
                return (
                  <tr key={b.id as string} style={rowStyle}>
                    <td className={tdClass}>
                      <Link href={`${BOOKS_PATH}/bills/${b.id}`} className="font-medium hover:underline">
                        {(b.contact as { name?: string } | null)?.name ?? t("unknownSupplier")}
                      </Link>{" "}
                      {b.source === "staff" && <Badge>{t("fromStaff")}</Badge>}{" "}
                      {attached > 0 && <span title={t("hasDocument")} aria-label={t("hasDocument")}>📎</span>}
                    </td>
                    <td className={`${tdClass} text-muted`}>{(b.reference as string) ?? ""}</td>
                    <td className={tdClass}>{b.issue_date as string}</td>
                    <td className={tdClass}>
                      {(b.due_date as string) ?? "—"} {late && <Badge tone="bad">{t("late")}</Badge>}
                    </td>
                    <td className={`${tdClass} text-right`}>
                      <Amount cents={Number(b.total_cents)} currency={ctx.settings.baseCurrency} locale={ctx.jurisdiction.locale} />
                    </td>
                    <td className={`${tdClass} text-right`}>
                      <Amount cents={out} currency={ctx.settings.baseCurrency} locale={ctx.jurisdiction.locale} blankZero />
                    </td>
                  </tr>
                );
              })}
              {(bills ?? []).length === 0 && (
                <tr style={rowStyle}>
                  <td colSpan={6} className="px-3 py-8 text-center text-sm text-muted">
                    {t("empty")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </GlassPanel>
    </div>
  );
}
