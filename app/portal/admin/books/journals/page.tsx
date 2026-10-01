import Link from "next/link";
import { getTranslations } from "@/lib/i18n/server";
import { GlassPanel } from "@/components/portal/admin/glass/GlassPanel";
import { Amount, Badge, PageHeader, primaryButton, rowStyle, secondaryButton, secondaryButtonStyle, tableClass, tdClass, thClass } from "@/components/admin/books/ui";
import { PageLinks } from "@/components/ui/PageLinks";
import { requireBooks, BOOKS_PATH } from "@/lib/ledger/server/guard";
import { parsePage, PAGE_SIZE } from "@/lib/pagination";
import { JOURNAL_SOURCE_TYPES, type JournalSourceType } from "@/lib/ledger/types";

export default async function JournalsPage({ searchParams }: { searchParams: Promise<{ page?: string; source?: string; q?: string }> }) {
  const params = await searchParams;
  const { session, ctx } = await requireBooks();
  const t = await getTranslations("books.journals");
  const ts = await getTranslations("books.sources");
  const page = parsePage(params.page);
  const source = JOURNAL_SOURCE_TYPES.includes(params.source as JournalSourceType) ? (params.source as JournalSourceType) : null;
  const q = (params.q ?? "").trim().slice(0, 80);

  let query = session.supabase
    .from("ledger_journals")
    .select("id, journal_number, date, narration, reference, source_type, status, superseded_by, gross_cents, contact_name", { count: "exact" })
    .eq("studio_id", session.studioId)
    .order("date", { ascending: false })
    .order("journal_number", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (source) query = query.eq("source_type", source);
  if (q) query = query.or(`narration.ilike.%${q.replace(/[%,()]/g, "")}%,reference.ilike.%${q.replace(/[%,()]/g, "")}%`);
  const { data, count } = await query;

  const qs = new URLSearchParams({ ...(source ? { source } : {}), ...(q ? { q } : {}) }).toString();
  const base = `${BOOKS_PATH}/journals${qs ? `?${qs}` : ""}`;

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-6">
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        actions={
          <>
            <Link href={`${BOOKS_PATH}/journals/new?type=opening`} className={secondaryButton} style={secondaryButtonStyle}>
              {t("openingBalances")}
            </Link>
            <Link href={`${BOOKS_PATH}/journals/new`} className={primaryButton}>
              {t("newJournal")}
            </Link>
          </>
        }
      />

      <form className="flex flex-wrap gap-2" action={`${BOOKS_PATH}/journals`}>
        <input name="q" defaultValue={q} placeholder={t("search")} aria-label={t("search")} className="rounded-xl border px-3.5 py-2 text-sm text-ink" style={{ background: "var(--surface)", borderColor: "var(--hair)" }} />
        <select name="source" defaultValue={source ?? ""} aria-label={t("source")} className="rounded-xl border px-3 py-2 text-sm text-ink" style={{ background: "var(--surface)", borderColor: "var(--hair)" }}>
          <option value="">{t("allSources")}</option>
          {JOURNAL_SOURCE_TYPES.map((s) => (
            <option key={s} value={s}>
              {ts(s)}
            </option>
          ))}
        </select>
        <button type="submit" className={secondaryButton} style={secondaryButtonStyle}>
          {t("filter")}
        </button>
      </form>

      <GlassPanel className="!p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className={tableClass}>
            <thead>
              <tr>
                <th className={thClass}>#</th>
                <th className={thClass}>{t("date")}</th>
                <th className={thClass}>{t("narration")}</th>
                <th className={thClass}>{t("source")}</th>
                <th className={`${thClass} text-right`}>{t("amount")}</th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((j) => (
                <tr key={j.id as string} style={rowStyle} className={j.status === "voided" || j.superseded_by ? "opacity-60" : ""}>
                  <td className={`${tdClass} tabular-nums text-muted`}>{j.journal_number as number}</td>
                  <td className={tdClass}>{j.date as string}</td>
                  <td className={`${tdClass} max-w-[460px] truncate`}>
                    <Link href={`${BOOKS_PATH}/journals/${j.id}`} className="hover:underline">
                      {j.narration as string}
                    </Link>{" "}
                    {j.status === "voided" && <Badge tone="bad">{t("voided")}</Badge>}
                    {j.superseded_by && <Badge tone="warn">{t("reversed")}</Badge>}
                  </td>
                  <td className={`${tdClass} text-muted`}>{ts(j.source_type as JournalSourceType)}</td>
                  <td className={`${tdClass} text-right`}>
                    {j.gross_cents != null ? <Amount cents={Number(j.gross_cents)} currency={ctx.settings.baseCurrency} locale={ctx.jurisdiction.locale} /> : <span className="text-muted">—</span>}
                  </td>
                </tr>
              ))}
              {(data ?? []).length === 0 && (
                <tr style={rowStyle}>
                  <td colSpan={5} className="px-3 py-8 text-center text-sm text-muted">
                    {t("empty")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </GlassPanel>
      <PageLinks page={page} total={count ?? 0} baseHref={base} />
    </div>
  );
}
