"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { GlassPanel } from "@/components/portal/admin/glass/GlassPanel";
import { importBankLinesAction } from "@/app/portal/admin/books/actions";
import { detectDateOrder, guessMapping, parseCsv, parseStatement, type ColumnMapping, type DateOrder } from "@/lib/ledger/bank-import";
import { formatLedgerMoney } from "@/lib/ledger/money";
import { Field, fieldStyle, primaryButton, secondaryButton, secondaryButtonStyle, smallFieldClass } from "./ui";

export function BankImport({ accountId, accountName, dateFallback, currency, locale }: { accountId: string; accountName: string; dateFallback: DateOrder; currency: string; locale: string }) {
  const t = useTranslations("books.bank");
  const te = useTranslations("books.errors");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<string[][] | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [dateOrder, setDateOrder] = useState<DateOrder>(dateFallback);
  const [message, setMessage] = useState<string | null>(null);

  const header = rows?.[0] ?? [];
  const body = useMemo(() => rows?.slice(1) ?? [], [rows]);
  const parsed = useMemo(() => (mapping && body.length ? parseStatement(body, mapping, dateOrder) : null), [mapping, body, dateOrder]);

  async function onFile(file: File | undefined) {
    setMessage(null);
    if (!file) return;
    const text = await file.text();
    const all = parseCsv(text);
    if (all.length < 2) return setMessage(te("csvEmpty"));
    setRows(all);
    const guess = guessMapping(all[0]);
    setMapping(guess ?? { date: 0, description: 1, reference: null, amount: 2, debit: null, credit: null });
    if (guess) setDateOrder(detectDateOrder(all.slice(1).map((r) => r[guess.date] ?? ""), dateFallback));
  }

  function save() {
    if (!parsed?.lines.length) return;
    start(async () => {
      const res = await importBankLinesAction({ accountId, lines: parsed.lines });
      if (!res.ok) return setMessage(te.has(res.error) ? te(res.error) : res.error);
      setMessage(t("imported", { imported: res.data?.imported ?? 0, duplicates: res.data?.duplicates ?? 0 }));
      setRows(null);
      setMapping(null);
      router.refresh();
    });
  }

  const col = (key: keyof ColumnMapping, optional = false) => (
    <select
      className={smallFieldClass}
      style={fieldStyle}
      value={mapping?.[key] ?? ""}
      onChange={(e) => setMapping((m) => (m ? { ...m, [key]: e.target.value === "" ? null : Number(e.target.value) } : m))}
      aria-label={t(`columns.${key}`)}
    >
      {optional && <option value="">{t("columns.none")}</option>}
      {header.map((h, i) => (
        <option key={i} value={i}>
          {h || `#${i + 1}`}
        </option>
      ))}
    </select>
  );

  return (
    <GlassPanel className="!p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-ink">{t("importTitle", { account: accountName })}</p>
          <p className="text-xs text-muted">{t("importBody")}</p>
        </div>
        {!open ? (
          <button type="button" className={secondaryButton} style={secondaryButtonStyle} onClick={() => setOpen(true)}>
            {t("importButton")}
          </button>
        ) : (
          <input type="file" accept=".csv,text/csv" onChange={(e) => onFile(e.target.files?.[0])} aria-label={t("chooseFile")} className="text-sm" />
        )}
      </div>

      {rows && mapping && (
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
            <Field label={t("columns.date")}>{col("date")}</Field>
            <Field label={t("columns.description")}>{col("description")}</Field>
            <Field label={t("columns.reference")}>{col("reference", true)}</Field>
            <Field label={t("columns.amount")}>{col("amount", true)}</Field>
            <Field label={t("columns.debit")}>{col("debit", true)}</Field>
            <Field label={t("columns.credit")}>{col("credit", true)}</Field>
          </div>
          <Field label={t("dateOrder")}>
            <select className={`${smallFieldClass} max-w-[220px]`} style={fieldStyle} value={dateOrder} onChange={(e) => setDateOrder(e.target.value as DateOrder)}>
              <option value="dmy">DD/MM/YYYY</option>
              <option value="mdy">MM/DD/YYYY</option>
              <option value="ymd">YYYY-MM-DD</option>
            </select>
          </Field>
          {parsed && (
            <>
              <p className="text-xs text-muted">
                {t("preview", { count: parsed.lines.length })}
                {parsed.errors.length > 0 && ` · ${t("skipped", { count: parsed.errors.length, rows: parsed.errors.slice(0, 5).map((e) => e.row).join(", ") })}`}
              </p>
              <div className="max-h-56 overflow-auto rounded-xl border" style={{ borderColor: "var(--hair)" }}>
                <table className="w-full text-xs">
                  <tbody>
                    {parsed.lines.slice(0, 12).map((l) => (
                      <tr key={l.externalHash} style={{ borderTop: "1px solid var(--hair)" }}>
                        <td className="px-3 py-1.5 tabular-nums">{l.date}</td>
                        <td className="max-w-[360px] truncate px-3 py-1.5">{l.description}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums" style={{ color: l.amountCents < 0 ? "var(--danger, #c0392b)" : undefined }}>
                          {formatLedgerMoney(l.amountCents, currency, locale)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" className={secondaryButton} style={secondaryButtonStyle} onClick={() => { setRows(null); setMapping(null); }}>
                  {t("cancel")}
                </button>
                <button type="button" className={primaryButton} disabled={pending || !parsed.lines.length} onClick={save}>
                  {pending ? t("importing") : t("importCount", { count: parsed.lines.length })}
                </button>
              </div>
            </>
          )}
        </div>
      )}
      {message && <p className="mt-3 text-sm text-ink" aria-live="polite">{message}</p>}
    </GlassPanel>
  );
}
