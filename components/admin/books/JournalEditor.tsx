"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { GlassPanel } from "@/components/portal/admin/glass/GlassPanel";
import { postManualJournalAction } from "@/app/portal/admin/books/actions";
import { formatLedgerMoney, parseMoneyInput } from "@/lib/ledger/money";
import type { LedgerAccount, TaxRate } from "@/lib/ledger/types";
import { Field, fieldClass, fieldStyle, primaryButton, secondaryButton, secondaryButtonStyle, smallFieldClass } from "./ui";

type Line = { key: number; accountId: string; description: string; debit: string; credit: string; taxRateId: string };

type Props = {
  opening: boolean;
  defaultDate: string;
  lockDate: string | null;
  accounts: LedgerAccount[];
  rates: TaxRate[];
  currency: string;
  locale: string;
  taxRegistered: boolean;
};

let nextKey = 1;
const blank = (): Line => ({ key: nextKey++, accountId: "", description: "", debit: "", credit: "", taxRateId: "" });

export function JournalEditor({ opening, defaultDate, lockDate, accounts, rates, currency, locale, taxRegistered }: Props) {
  const t = useTranslations("books.journalEditor");
  const te = useTranslations("books.errors");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [date, setDate] = useState(defaultDate);
  const [narration, setNarration] = useState(opening ? t("openingNarration") : "");
  const [reference, setReference] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>(() =>
    opening
      ? accounts
          .filter((a) => a.type === "asset" || a.type === "liability" || a.type === "equity")
          .filter((a) => a.systemKey !== "retained_earnings")
          .map((a) => ({ ...blank(), accountId: a.id }))
      : [blank(), blank()],
  );

  const parsed = useMemo(
    () => lines.map((l) => ({ ...l, debitCents: parseMoneyInput(l.debit) ?? 0, creditCents: parseMoneyInput(l.credit) ?? 0 })),
    [lines],
  );
  const totalDebit = parsed.reduce((s, l) => s + Math.max(0, l.debitCents), 0);
  const totalCredit = parsed.reduce((s, l) => s + Math.max(0, l.creditCents), 0);
  const diff = totalDebit - totalCredit;
  const openingBalance = accounts.find((a) => a.systemKey === "opening_balance");
  const money = (c: number) => formatLedgerMoney(c, currency, locale);

  function update(key: number, patch: Partial<Line>) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function balanceToOpening() {
    if (!openingBalance || diff === 0) return;
    setLines((ls) => [...ls.filter((l) => l.accountId !== openingBalance.id), { ...blank(), accountId: openingBalance.id, debit: diff < 0 ? (-diff / 100).toFixed(2) : "", credit: diff > 0 ? (diff / 100).toFixed(2) : "" }]);
  }

  function submit() {
    setError(null);
    const used = parsed.filter((l) => l.accountId && (l.debitCents > 0 || l.creditCents > 0));
    if (used.some((l) => l.debitCents < 0 || l.creditCents < 0)) return setError(te("negativeAmount"));
    if (used.some((l) => l.debitCents > 0 && l.creditCents > 0)) return setError(te("debitAndCredit"));
    if (used.length < 2) return setError(te("twoLines"));
    if (diff !== 0) return setError(te("unbalanced"));
    if (lockDate && date <= lockDate) return setError(te("lockedDate", { date: lockDate }));
    start(async () => {
      const res = await postManualJournalAction({
        date,
        narration,
        reference: reference || null,
        opening,
        lines: used.map((l) => ({ accountId: l.accountId, description: l.description || null, debitCents: l.debitCents, creditCents: l.creditCents, taxRateId: l.taxRateId || null })),
      });
      if (!res.ok) return setError(te.has(res.error) ? te(res.error) : res.error);
      router.push(res.data ? `/portal/admin/books/journals/${res.data.id}` : "/portal/admin/books/journals");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <GlassPanel className="!p-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <Field label={t("date")} hint={lockDate ? t("lockHint", { date: lockDate }) : undefined}>
            <input type="date" className={fieldClass} style={fieldStyle} value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <div className="sm:col-span-2">
            <Field label={t("narration")}>
              <input className={fieldClass} style={fieldStyle} value={narration} onChange={(e) => setNarration(e.target.value)} />
            </Field>
          </div>
          <Field label={t("reference")}>
            <input className={fieldClass} style={fieldStyle} value={reference} onChange={(e) => setReference(e.target.value)} />
          </Field>
        </div>
        {opening && <p className="mt-3 text-xs text-muted">{t("openingHelp")}</p>}
      </GlassPanel>

      <GlassPanel className="!p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-muted">
                <th className="px-3 py-2.5">{t("account")}</th>
                <th className="px-3 py-2.5">{t("description")}</th>
                {taxRegistered && !opening && <th className="px-3 py-2.5">{t("taxRate")}</th>}
                <th className="px-3 py-2.5 text-right">{t("debit")}</th>
                <th className="px-3 py-2.5 text-right">{t("credit")}</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.key} style={{ borderTop: "1px solid var(--hair)" }}>
                  <td className="px-3 py-2">
                    <select className={smallFieldClass} style={fieldStyle} value={l.accountId} onChange={(e) => update(l.key, { accountId: e.target.value })} aria-label={t("account")}>
                      <option value="">{t("chooseAccount")}</option>
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.code} — {a.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <input className={smallFieldClass} style={fieldStyle} value={l.description} onChange={(e) => update(l.key, { description: e.target.value })} aria-label={t("description")} />
                  </td>
                  {taxRegistered && !opening && (
                    <td className="px-3 py-2">
                      <select className={smallFieldClass} style={fieldStyle} value={l.taxRateId} onChange={(e) => update(l.key, { taxRateId: e.target.value })} aria-label={t("taxRate")}>
                        <option value="">{t("noTax")}</option>
                        {rates.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                    </td>
                  )}
                  <td className="px-3 py-2">
                    <input className={`${smallFieldClass} text-right tabular-nums`} style={fieldStyle} inputMode="decimal" value={l.debit} onChange={(e) => update(l.key, { debit: e.target.value, credit: e.target.value ? "" : l.credit })} aria-label={t("debit")} />
                  </td>
                  <td className="px-3 py-2">
                    <input className={`${smallFieldClass} text-right tabular-nums`} style={fieldStyle} inputMode="decimal" value={l.credit} onChange={(e) => update(l.key, { credit: e.target.value, debit: e.target.value ? "" : l.debit })} aria-label={t("credit")} />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button type="button" className="text-lg leading-none text-muted" aria-label={t("removeLine")} onClick={() => setLines((ls) => (ls.length > 2 ? ls.filter((x) => x.key !== l.key) : ls))}>
                      ×
                    </button>
                  </td>
                </tr>
              ))}
              <tr style={{ borderTop: "1px solid var(--hair)" }}>
                <td className="px-3 py-3" colSpan={taxRegistered && !opening ? 3 : 2}>
                  <button type="button" className="text-xs font-semibold text-(--brand)" onClick={() => setLines((ls) => [...ls, blank()])}>
                    {t("addLine")}
                  </button>
                </td>
                <td className="px-3 py-3 text-right font-semibold tabular-nums text-ink">{money(totalDebit)}</td>
                <td className="px-3 py-3 text-right font-semibold tabular-nums text-ink">{money(totalCredit)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
        {taxRegistered && !opening && <p className="px-5 pb-3 text-xs text-muted">{t("taxHelp")}</p>}
      </GlassPanel>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm" style={{ color: diff === 0 ? "var(--muted)" : "var(--danger, #c0392b)" }} aria-live="polite">
          {diff === 0 ? t("balanced") : t("outBy", { amount: money(Math.abs(diff)) })}
          {opening && diff !== 0 && openingBalance && (
            <button type="button" className="ml-3 text-xs font-semibold text-(--brand)" onClick={balanceToOpening}>
              {t("balanceToEquity", { account: openingBalance.name })}
            </button>
          )}
        </p>
        <div className="flex gap-2">
          <button type="button" className={secondaryButton} style={secondaryButtonStyle} onClick={() => router.back()}>
            {t("cancel")}
          </button>
          <button type="button" className={primaryButton} disabled={pending || diff !== 0 || !narration.trim()} onClick={submit}>
            {pending ? t("posting") : t("post")}
          </button>
        </div>
      </div>
      {error && <p className="text-sm" role="alert" style={{ color: "var(--danger, #c0392b)" }}>{error}</p>}
    </div>
  );
}
