"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { GlassPanel } from "@/components/portal/admin/glass/GlassPanel";
import { updateBooksSettingsAction } from "@/app/portal/admin/books/actions";
import { resolveJurisdiction, type CustomJurisdictionInput } from "@/lib/ledger/jurisdictions";
import type { FilingFrequency, LedgerSettings } from "@/lib/ledger/types";
import { Field, Notice, fieldClass, fieldStyle, primaryButton } from "./ui";
import { SyncNowButton } from "./SyncNowButton";

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

export function BooksSettingsForm({ settings, jurisdictionCode, custom }: { settings: LedgerSettings; jurisdictionCode: string; custom: CustomJurisdictionInput | null }) {
  const t = useTranslations("books.settings");
  const ts = useTranslations("books.setup");
  const tf = useTranslations("books.frequency");
  const tm = useTranslations("books.months");
  const te = useTranslations("books.errors");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ tone: "good" | "bad"; text: string } | null>(null);
  const j = useMemo(() => resolveJurisdiction(jurisdictionCode, custom), [jurisdictionCode, custom]);

  const [registered, setRegistered] = useState(settings.taxRegistered);
  const [taxNumber, setTaxNumber] = useState(settings.taxNumber ?? "");
  const [basisId, setBasisId] = useState(settings.taxScheme ?? j.bases[0].id);
  const [frequency, setFrequency] = useState<FilingFrequency>(settings.filingFrequency);
  const [anchor, setAnchor] = useState(settings.taxPeriodAnchorMonth);
  const [fyMonth, setFyMonth] = useState(settings.fiscalYearStartMonth);
  const [fyDay, setFyDay] = useState(settings.fiscalYearStartDay);
  const [pricesIncludeTax, setPricesIncludeTax] = useState(settings.pricesIncludeTax);
  const [autoPost, setAutoPost] = useState(settings.autoPost);
  const [lockDate, setLockDate] = useState(settings.lockDate ?? "");

  const numberOk = !registered || !taxNumber.trim() || j.taxNumber.validate(taxNumber);

  function save() {
    setMessage(null);
    start(async () => {
      const res = await updateBooksSettingsAction({
        taxRegistered: registered,
        taxNumber: taxNumber.trim() || null,
        basisId,
        filingFrequency: frequency,
        taxPeriodAnchorMonth: anchor,
        fiscalYearStartMonth: fyMonth,
        fiscalYearStartDay: fyDay,
        pricesIncludeTax,
        autoPost,
        lockDate: lockDate || null,
      });
      if (!res.ok) return setMessage({ tone: "bad", text: te.has(res.error) ? te(res.error) : res.error });
      setMessage({ tone: "good", text: t("saved") });
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <GlassPanel className="!p-6 space-y-5">
        <h2 className="text-base font-semibold text-ink">{t("taxHeading", { tax: j.taxName })}</h2>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={registered} onChange={(e) => setRegistered(e.target.checked)} />
          {ts("tax.registered", { tax: j.taxName })}
        </label>
        {registered && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={j.taxNumber.label} hint={j.taxNumber.hint} error={numberOk ? null : te("taxNumber")}>
              <input className={fieldClass} style={fieldStyle} value={taxNumber} placeholder={j.taxNumber.placeholder} onChange={(e) => setTaxNumber(e.target.value)} />
            </Field>
            <Field label={ts("tax.basis")}>
              <select className={fieldClass} style={fieldStyle} value={basisId} onChange={(e) => setBasisId(e.target.value)}>
                {j.bases.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={ts("tax.frequency")}>
              <select className={fieldClass} style={fieldStyle} value={frequency} onChange={(e) => setFrequency(e.target.value as FilingFrequency)}>
                {j.filing.frequencies.map((f) => (
                  <option key={f} value={f}>
                    {tf(f)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={ts("tax.anchor")}>
              <select className={fieldClass} style={fieldStyle} value={anchor} onChange={(e) => setAnchor(Number(e.target.value))}>
                {MONTHS.map((m) => (
                  <option key={m} value={m}>
                    {tm(String(m))}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        )}
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={pricesIncludeTax} onChange={(e) => setPricesIncludeTax(e.target.checked)} />
          {ts("tax.pricesInclude", { tax: j.taxName })}
        </label>
      </GlassPanel>

      <GlassPanel className="!p-6 space-y-5">
        <h2 className="text-base font-semibold text-ink">{t("periodsHeading")}</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label={ts("periods.fyStart")}>
            <div className="flex gap-2">
              <select className={fieldClass} style={fieldStyle} value={fyMonth} onChange={(e) => setFyMonth(Number(e.target.value))} aria-label={ts("periods.month")}>
                {MONTHS.map((m) => (
                  <option key={m} value={m}>
                    {tm(String(m))}
                  </option>
                ))}
              </select>
              <input className={`${fieldClass} w-20`} style={fieldStyle} type="number" min={1} max={31} value={fyDay} onChange={(e) => setFyDay(Math.max(1, Math.min(31, Number(e.target.value) || 1)))} aria-label={ts("periods.day")} />
            </div>
          </Field>
          <Field label={t("conversionDate")} hint={t("conversionHint")}>
            <input className={fieldClass} style={fieldStyle} value={settings.conversionDate} disabled />
          </Field>
          <Field label={t("lockDate")} hint={t("lockHint")}>
            <input type="date" className={fieldClass} style={fieldStyle} value={lockDate} onChange={(e) => setLockDate(e.target.value)} />
          </Field>
        </div>
        {settings.lockDate && lockDate !== settings.lockDate && <Notice tone="warn">{t("lockChangeWarning")}</Notice>}
      </GlassPanel>

      <GlassPanel className="!p-6 space-y-4">
        <h2 className="text-base font-semibold text-ink">{t("autoHeading")}</h2>
        <label className="flex items-start gap-2 text-sm text-ink">
          <input type="checkbox" className="mt-1" checked={autoPost} onChange={(e) => setAutoPost(e.target.checked)} />
          <span>
            <span className="block">{t("autoPost")}</span>
            <span className="block text-xs text-muted">{t("autoPostHint")}</span>
          </span>
        </label>
        <SyncNowButton lastSyncedAt={settings.lastSyncedAt} />
      </GlassPanel>

      <GlassPanel className="!p-6 space-y-2">
        <h2 className="text-base font-semibold text-ink">{t("packHeading")}</h2>
        <p className="text-sm text-muted">{t("packBody", { country: j.name, date: j.reviewedAt, currency: settings.baseCurrency })}</p>
        {j.notes.length > 0 && (
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
            {j.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        )}
      </GlassPanel>

      {message && <Notice tone={message.tone}>{message.text}</Notice>}
      <div className="flex justify-end">
        <button type="button" className={primaryButton} disabled={pending || !numberOk} onClick={save}>
          {pending ? t("saving") : t("save")}
        </button>
      </div>
    </div>
  );
}
