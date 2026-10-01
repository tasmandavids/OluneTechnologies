import Link from "next/link";
import { getTranslations } from "@/lib/i18n/server";
import { GlassPanel } from "@/components/portal/admin/glass/GlassPanel";
import { Amount, Badge, EmptyState, Notice, PageHeader } from "@/components/admin/books/ui";
import { TaxReturnView } from "@/components/admin/books/TaxReturnView";
import { requireBooks, BOOKS_PATH } from "@/lib/ledger/server/guard";
import { fetchTaxSummary } from "@/lib/ledger/server/data";
import { syncStudioLedger } from "@/lib/ledger/server/sync";
import { buildReturnEntries } from "@/lib/ledger/tax-return";
import { taxPeriodContaining, taxPeriodsBetween, todayIso } from "@/lib/ledger/periods";

export default async function TaxPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const params = await searchParams;
  const { session, ctx } = await requireBooks();
  const t = await getTranslations("books.tax");
  const { settings, jurisdiction: j } = ctx;
  const { supabase, studioId } = session;

  if (!settings.taxRegistered) {
    return (
      <div className="mx-auto max-w-6xl space-y-5 p-6">
        <PageHeader title={t("title", { tax: j.taxName })} />
        <EmptyState
          title={t("notRegistered", { tax: j.taxName })}
          body={t("notRegisteredBody")}
          action={<Link href={`${BOOKS_PATH}/settings`} className="text-sm font-semibold text-[--brand]">{t("openSettings")}</Link>}
        />
      </div>
    );
  }

  await syncStudioLedger(supabase, studioId, { userId: session.userId });

  const today = todayIso();
  const current = taxPeriodContaining(today, settings.filingFrequency, settings.taxPeriodAnchorMonth);
  const periods = taxPeriodsBetween(settings.conversionDate, current.end, settings.filingFrequency, settings.taxPeriodAnchorMonth).reverse();
  const { data: filedRows } = await supabase
    .from("ledger_tax_returns")
    .select("period_start, period_end, net_payable_cents, filing_reference, filed_at, figures, form_code")
    .eq("studio_id", studioId);
  const filed = new Map((filedRows ?? []).map((r) => [`${r.period_start}_${r.period_end}`, r]));

  const firstOpen = [...periods].reverse().find((p) => p.end < today && !filed.has(`${p.start}_${p.end}`) && (!settings.lockDate || p.end > settings.lockDate));
  const key = params.period && periods.some((p) => `${p.start}_${p.end}` === params.period) ? params.period : firstOpen ? `${firstOpen.start}_${firstOpen.end}` : `${current.start}_${current.end}`;
  const [start, end] = key.split("_");
  const filedRow = filed.get(key);
  const locked = !!settings.lockDate && end <= settings.lockDate;

  const entries = filedRow ? [] : buildReturnEntries(await fetchTaxSummary(supabase, studioId, start, end), ctx.rates, { sales: settings.salesTaxBasis, purchases: settings.purchasesTaxBasis });
  const std = ctx.rates.find((r) => r.code === "STD");
  const red = ctx.rates.find((r) => r.code === "RED");

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-6">
      <PageHeader title={t("title", { tax: j.taxName })} subtitle={t("subtitle", { form: j.returnForm.name, authority: j.taxAuthority })} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_1fr]">
        <GlassPanel className="!p-2 h-fit">
          <ul className="max-h-[560px] overflow-y-auto">
            {periods.map((p) => {
              const k = `${p.start}_${p.end}`;
              const f = filed.get(k);
              const isCurrent = k === `${current.start}_${current.end}`;
              const isLocked = !!settings.lockDate && p.end <= settings.lockDate;
              return (
                <li key={k}>
                  <Link
                    href={`${BOOKS_PATH}/tax?period=${k}`}
                    className="flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm"
                    style={{ background: k === key ? "var(--t3)" : "transparent" }}
                  >
                    <span className="tabular-nums text-ink">
                      {p.start.slice(0, 7)} → {p.end.slice(0, 7)}
                    </span>
                    <PeriodBadge state={f ? "filed" : isCurrent ? "current" : isLocked ? "locked" : p.end.localeCompare(today) < 0 ? "due" : null} label={(s) => t(s)} />
                  </Link>
                </li>
              );
            })}
          </ul>
        </GlassPanel>

        <div className="space-y-4">
          <GlassPanel className="!p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-ink">{t("periodHeading", { start, end })}</p>
                <p className="text-xs text-muted">
                  {t("dueOn", { date: j.returnForm.dueDate(end, settings.filingFrequency) })} · {t("basis", { basis: j.bases.find((b) => b.id === settings.taxScheme)?.label ?? settings.salesTaxBasis })}
                </p>
              </div>
              <a href={j.returnForm.authorityUrl || undefined} target="_blank" rel="noreferrer" className="text-xs font-semibold text-[--brand]">
                {t("authorityLink", { authority: j.returnForm.authority })}
              </a>
            </div>
          </GlassPanel>

          {filedRow ? (
            <GlassPanel className="!p-5 space-y-3">
              <Notice tone="good">
                {t("filedOn", { date: String(filedRow.filed_at).slice(0, 10), reference: (filedRow.filing_reference as string) ?? "—" })}
              </Notice>
              <table className="w-full text-sm">
                <tbody>
                  {(((filedRow.figures as { boxes?: { id: string; label: string; valueCents: number; total?: boolean }[] })?.boxes) ?? []).map((b) => (
                    <tr key={b.id} style={{ borderTop: "1px solid var(--hair)" }}>
                      <td className="w-20 px-3 py-2 font-semibold text-muted">{b.id}</td>
                      <td className={`px-3 py-2 ${b.total ? "font-semibold text-ink" : "text-ink"}`}>{b.label}</td>
                      <td className="px-3 py-2 text-right">
                        <Amount cents={b.valueCents} currency={settings.baseCurrency} locale={j.locale} strong={b.total} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </GlassPanel>
          ) : (
            <TaxReturnView
              jurisdictionCode={j.code}
              custom={j.code === "XX" ? { countryName: settings.customCountryName ?? "", currency: settings.baseCurrency, taxName: settings.customTaxName ?? "Tax", standardRateBp: std?.rateBp ?? 0, reducedRateBp: red?.rateBp ?? null } : null}
              entries={entries}
              rateNames={Object.fromEntries(ctx.rates.map((r) => [r.code, r.name]))}
              periodStart={start}
              periodEnd={end}
              canFile={!locked && end < today}
              reasonCantFile={locked ? t("lockedReason", { date: settings.lockDate ?? "" }) : end >= today ? t("notEndedReason") : null}
              currency={settings.baseCurrency}
              locale={j.locale}
              notes={j.returnForm.notes ?? []}
              separateAccounts={j.separateTaxAccounts}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function PeriodBadge({ state, label }: { state: "filed" | "current" | "locked" | "due" | null; label: (s: "filed" | "current" | "locked" | "due") => string }) {
  if (!state) return null;
  const tone = state === "filed" ? "good" : state === "due" ? "warn" : "neutral";
  return <Badge tone={tone}>{label(state)}</Badge>;
}
