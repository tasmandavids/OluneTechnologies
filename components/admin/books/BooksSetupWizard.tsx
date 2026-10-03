"use client";

// ============================================================================
//  Olune Books setup — pick a country, and the books set themselves up for it.
//
//  The jurisdiction packs are pure data + functions, so this component imports
//  them directly: tax numbers are checked as they're typed, and the review step
//  shows the exact chart of accounts and tax rates that will be created.
// ============================================================================

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { GlassPanel } from "@/components/portal/admin/glass/GlassPanel";
import { buildChart } from "@/lib/ledger/chart";
import { JURISDICTIONS, customJurisdiction, getJurisdiction, getRegion, ratesFor } from "@/lib/ledger/jurisdictions";
import type { Jurisdiction } from "@/lib/ledger/jurisdictions/types";
import { taxPeriodContaining, fiscalYear } from "@/lib/ledger/periods";
import type { FilingFrequency } from "@/lib/ledger/types";
import { setupBooksAction } from "@/app/portal/admin/books/actions";
import { Field, Notice, fieldClass, fieldStyle, primaryButton, secondaryButton, secondaryButtonStyle } from "./ui";

type Props = {
  today: string;
  studioName: string;
  xeroOrg: string | null;
  existingTaxNumber: string | null;
  existingPricesIncludeTax: boolean;
  productsAtNzRate: number;
};

const STEPS = ["country", "tax", "periods", "review"] as const;
type Step = (typeof STEPS)[number];

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const NZ_PACK = getJurisdiction("NZ")!;

export function BooksSetupWizard(props: Props) {
  const t = useTranslations("books.setup");
  const tf = useTranslations("books.frequency");
  const tm = useTranslations("books.months");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [step, setStep] = useState<Step>("country");
  const [error, setError] = useState<string | null>(null);

  // Country
  const [code, setCode] = useState<string>("NZ");
  const [region, setRegion] = useState<string | null>(null);
  const [custom, setCustom] = useState({ countryName: "", currency: "", taxName: "", standardPct: "", reducedPct: "" });

  const customPack = useMemo(() => {
    if (code !== "XX") return null;
    const std = Number(custom.standardPct.replace(",", "."));
    const red = Number(custom.reducedPct.replace(",", "."));
    if (!custom.currency || !Number.isFinite(std)) return null;
    return customJurisdiction({
      countryName: custom.countryName,
      currency: custom.currency.toUpperCase(),
      taxName: custom.taxName,
      standardRateBp: Math.round(std * 100),
      reducedRateBp: custom.reducedPct && Number.isFinite(red) ? Math.round(red * 100) : null,
    });
  }, [code, custom]);

  const j: Jurisdiction | null = code === "XX" ? customPack : getJurisdiction(code);
  const regionPack = j ? getRegion(j, region) : null;

  // Tax
  const [registered, setRegistered] = useState<boolean>(NZ_PACK.defaultRegistered);
  const [taxNumber, setTaxNumber] = useState<string>(props.existingTaxNumber ?? "");
  const [basisId, setBasisId] = useState<string>(NZ_PACK.bases[0].id);
  const [frequency, setFrequency] = useState<FilingFrequency>(NZ_PACK.filing.default);
  const [anchor, setAnchor] = useState<number>(NZ_PACK.filing.defaultAnchorMonth ?? 1);
  const [pricesIncludeTax, setPricesIncludeTax] = useState<boolean>(props.existingPricesIncludeTax);

  // Periods
  const [fyMonth, setFyMonth] = useState<number>(NZ_PACK.fiscalYearStart.month);
  const [fyDay, setFyDay] = useState<number>(NZ_PACK.fiscalYearStart.day);
  const [conversionDate, setConversionDate] = useState<string>(
    () => taxPeriodContaining(props.today, NZ_PACK.filing.default, NZ_PACK.filing.defaultAnchorMonth ?? 1).start,
  );
  const [updateProductRates, setUpdateProductRates] = useState<boolean>(true);

  /** Apply the pack's defaults whenever the country changes. */
  function chooseCountry(next: string) {
    setCode(next);
    setRegion(null);
    setError(null);
    const pack = next === "XX" ? null : getJurisdiction(next);
    if (pack) applyDefaults(pack);
  }

  function applyDefaults(pack: Jurisdiction) {
    setRegistered(pack.defaultRegistered);
    setBasisId(pack.bases[0].id);
    setFrequency(pack.filing.default);
    setAnchor(pack.filing.defaultAnchorMonth ?? 1);
    setPricesIncludeTax(pack.pricesIncludeTax);
    setFyMonth(pack.fiscalYearStart.month);
    setFyDay(pack.fiscalYearStart.day);
    const p = taxPeriodContaining(props.today, pack.filing.default, pack.filing.defaultAnchorMonth ?? 1);
    setConversionDate(pack.defaultRegistered ? p.start : `${props.today.slice(0, 7)}-01`);
  }


  const taxNumberValid = !taxNumber.trim() || !j || j.taxNumber.validate(taxNumber);
  const chart = useMemo(() => (j ? buildChart(j, regionPack) : []), [j, regionPack]);
  const rates = j ? ratesFor(j, regionPack) : [];
  const stdRate = j ? rates.find((r) => r.code === (regionPack?.defaultSalesCode ?? j.defaultSalesCode)) : null;
  const suggestedStart = j ? taxPeriodContaining(props.today, frequency, anchor).start : props.today;
  const fy = fiscalYear(props.today, fyMonth, fyDay);

  function canAdvance(): string | null {
    if (step === "country") {
      if (!j) return t("errors.customIncomplete");
      if (j.regions?.length && !regionPack) return t("errors.pickRegion", { label: j.regionLabel ?? "" });
    }
    if (step === "tax" && registered && !taxNumberValid) return t("errors.taxNumber", { label: j?.taxNumber.label ?? "" });
    return null;
  }

  function next() {
    const problem = canAdvance();
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setStep(STEPS[Math.min(STEPS.indexOf(step) + 1, STEPS.length - 1)]);
  }

  function back() {
    setError(null);
    setStep(STEPS[Math.max(STEPS.indexOf(step) - 1, 0)]);
  }

  function submit() {
    if (!j) return;
    setError(null);
    start(async () => {
      const res = await setupBooksAction({
        jurisdiction: code,
        region: regionPack?.code ?? null,
        custom:
          code === "XX"
            ? {
                countryName: custom.countryName,
                currency: custom.currency.toUpperCase(),
                taxName: custom.taxName,
                standardRateBp: Math.round(Number(custom.standardPct.replace(",", ".")) * 100),
                reducedRateBp: custom.reducedPct ? Math.round(Number(custom.reducedPct.replace(",", ".")) * 100) : null,
              }
            : null,
        taxRegistered: registered,
        taxNumber: registered && taxNumber.trim() ? taxNumber.trim() : null,
        basisId: basisId || j.bases[0].id,
        filingFrequency: frequency,
        taxPeriodAnchorMonth: anchor,
        fiscalYearStartMonth: fyMonth,
        fiscalYearStartDay: fyDay,
        conversionDate,
        pricesIncludeTax,
        updateProductRates,
      });
      if (!res.ok) {
        setError(t.has(`errors.${res.error}`) ? t(`errors.${res.error}`) : res.error);
        return;
      }
      router.push("/portal/admin/books");
      router.refresh();
    });
  }

  if (props.xeroOrg) {
    return (
      <GlassPanel className="!p-8">
        <h1 className="text-lg font-semibold text-ink">{t("title")}</h1>
        <p className="mt-2 text-sm text-muted">{t("xeroBlocks", { org: props.xeroOrg })}</p>
        <a href="/portal/admin/money?tab=accounting" className={`${secondaryButton} mt-4 inline-block`} style={secondaryButtonStyle}>
          {t("openAccounting")}
        </a>
      </GlassPanel>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">{t("eyebrow")}</p>
        <h1 className="text-ink" style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "1.8rem" }}>
          {t("title")}
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">{t("intro")}</p>
      </div>

      <ol className="flex flex-wrap gap-2" aria-label={t("progress")}>
        {STEPS.map((s, i) => (
          <li
            key={s}
            className="rounded-full border px-3 py-1 text-xs font-semibold"
            aria-current={s === step ? "step" : undefined}
            style={{ borderColor: s === step ? "var(--brand)" : "var(--hair)", color: s === step ? "var(--ink)" : "var(--muted)" }}
          >
            {i + 1}. {t(`steps.${s}`)}
          </li>
        ))}
      </ol>

      <GlassPanel className="!p-6">
        {step === "country" && (
          <div className="space-y-5">
            <div>
              <h2 className="text-base font-semibold text-ink">{t("country.heading")}</h2>
              <p className="text-sm text-muted">{t("country.body")}</p>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3" role="radiogroup" aria-label={t("country.heading")}>
              {[...JURISDICTIONS, null].map((pack) => {
                const id = pack?.code ?? "XX";
                const selected = code === id;
                return (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => chooseCountry(id)}
                    className="flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition"
                    style={{ borderColor: selected ? "var(--brand)" : "var(--hair)", background: selected ? "var(--t3)" : "var(--surface)" }}
                  >
                    <span className="text-2xl" aria-hidden>
                      {pack?.flag ?? "🌐"}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-ink">{pack?.name ?? t("country.other")}</span>
                      <span className="block truncate text-xs text-muted">
                        {pack ? `${pack.currency} · ${pack.taxName}` : t("country.otherHint")}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>

            {code === "XX" && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label={t("custom.countryName")}>
                  <input className={fieldClass} style={fieldStyle} value={custom.countryName} onChange={(e) => setCustom({ ...custom, countryName: e.target.value })} />
                </Field>
                <Field label={t("custom.currency")} hint={t("custom.currencyHint")}>
                  <input className={fieldClass} style={fieldStyle} maxLength={3} value={custom.currency} onChange={(e) => setCustom({ ...custom, currency: e.target.value.toUpperCase() })} />
                </Field>
                <Field label={t("custom.taxName")} hint={t("custom.taxNameHint")}>
                  <input className={fieldClass} style={fieldStyle} value={custom.taxName} onChange={(e) => setCustom({ ...custom, taxName: e.target.value })} />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label={t("custom.standardRate")}>
                    <input className={fieldClass} style={fieldStyle} inputMode="decimal" value={custom.standardPct} onChange={(e) => setCustom({ ...custom, standardPct: e.target.value })} />
                  </Field>
                  <Field label={t("custom.reducedRate")}>
                    <input className={fieldClass} style={fieldStyle} inputMode="decimal" value={custom.reducedPct} onChange={(e) => setCustom({ ...custom, reducedPct: e.target.value })} />
                  </Field>
                </div>
              </div>
            )}

            {j?.regions?.length ? (
              <Field label={j.regionLabel ?? t("country.region")} hint={regionPack?.note}>
                <select className={fieldClass} style={fieldStyle} value={region ?? ""} onChange={(e) => setRegion(e.target.value || null)}>
                  <option value="">{t("country.chooseRegion")}</option>
                  {j.regions.map((r) => (
                    <option key={r.code} value={r.code}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}

            {j && code !== "XX" && (
              <div className="rounded-xl border p-4 text-sm" style={{ borderColor: "var(--hair)", background: "var(--surface)" }}>
                <p className="font-semibold text-ink">{t("country.whatWeSetUp", { country: j.name })}</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
                  <li>{t("country.setsCurrency", { currency: j.currency })}</li>
                  <li>{t("country.setsTax", { tax: j.taxName, count: rates.filter((r) => r.rateBp > 0).length })}</li>
                  <li>{t("country.setsReturn", { form: j.returnForm.name, authority: j.taxAuthority })}</li>
                  <li>{t("country.setsChart", { count: chart.length })}</li>
                  <li>{t("country.setsYear", { month: tm(String(j.fiscalYearStart.month)) })}</li>
                </ul>
              </div>
            )}
          </div>
        )}

        {step === "tax" && j && (
          <div className="space-y-5">
            <div>
              <h2 className="text-base font-semibold text-ink">{t("tax.heading", { tax: j.taxName })}</h2>
              <p className="text-sm text-muted">{t("tax.body", { authority: j.taxAuthority })}</p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              {[true, false].map((v) => (
                <button
                  key={String(v)}
                  type="button"
                  onClick={() => setRegistered(v)}
                  aria-pressed={registered === v}
                  className="flex-1 rounded-xl border px-4 py-3 text-left text-sm"
                  style={{ borderColor: registered === v ? "var(--brand)" : "var(--hair)", background: registered === v ? "var(--t3)" : "var(--surface)" }}
                >
                  <span className="block font-semibold text-ink">{v ? t("tax.registered", { tax: j.taxName }) : t("tax.notRegistered", { tax: j.taxName })}</span>
                  <span className="block text-xs text-muted">{v ? t("tax.registeredHint") : t("tax.notRegisteredHint")}</span>
                </button>
              ))}
            </div>

            {j.registrationThreshold && (
              <p className="text-xs text-muted">
                {t("tax.threshold", {
                  amount: new Intl.NumberFormat(j.locale, { style: "currency", currency: j.registrationThreshold.currency, maximumFractionDigits: 0 }).format(j.registrationThreshold.amount),
                  label: j.registrationThreshold.label,
                })}
              </p>
            )}

            {registered && (
              <>
                <Field
                  label={j.taxNumber.label}
                  hint={j.taxNumber.hint}
                  error={taxNumber.trim() && !taxNumberValid ? t("errors.taxNumber", { label: j.taxNumber.label }) : null}
                >
                  <input
                    className={fieldClass}
                    style={fieldStyle}
                    value={taxNumber}
                    placeholder={j.taxNumber.placeholder}
                    onChange={(e) => setTaxNumber(e.target.value)}
                    aria-invalid={!taxNumberValid}
                  />
                </Field>

                <Field label={t("tax.basis")}>
                  <div className="space-y-2">
                    {j.bases.map((b) => (
                      <label key={b.id} className="flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5" style={{ borderColor: basisId === b.id ? "var(--brand)" : "var(--hair)" }}>
                        <input type="radio" name="basis" className="mt-1" checked={basisId === b.id} onChange={() => setBasisId(b.id)} />
                        <span>
                          <span className="block text-sm font-semibold text-ink">{b.label}</span>
                          {b.hint && <span className="block text-xs text-muted">{b.hint}</span>}
                        </span>
                      </label>
                    ))}
                  </div>
                </Field>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label={t("tax.frequency")}>
                    <select className={fieldClass} style={fieldStyle} value={frequency} onChange={(e) => setFrequency(e.target.value as FilingFrequency)}>
                      {j.filing.frequencies.map((f) => (
                        <option key={f} value={f}>
                          {tf(f)}
                        </option>
                      ))}
                    </select>
                  </Field>
                  {frequency !== "monthly" && (
                    <Field label={t("tax.anchor")} hint={t("tax.anchorHint", { start: suggestedStart })}>
                      <select className={fieldClass} style={fieldStyle} value={anchor} onChange={(e) => setAnchor(Number(e.target.value))}>
                        {MONTHS.map((m) => (
                          <option key={m} value={m}>
                            {tm(String(m))}
                          </option>
                        ))}
                      </select>
                    </Field>
                  )}
                </div>
              </>
            )}

            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" className="mt-1" checked={pricesIncludeTax} onChange={(e) => setPricesIncludeTax(e.target.checked)} />
              <span>
                <span className="block font-semibold text-ink">{t("tax.pricesInclude", { tax: j.taxName })}</span>
                <span className="block text-xs text-muted">{t("tax.pricesIncludeHint")}</span>
              </span>
            </label>
          </div>
        )}

        {step === "periods" && j && (
          <div className="space-y-5">
            <div>
              <h2 className="text-base font-semibold text-ink">{t("periods.heading")}</h2>
              <p className="text-sm text-muted">{t("periods.body")}</p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label={t("periods.fyStart")} hint={t("periods.fyHint", { start: fy.start, end: fy.end })}>
                <div className="flex gap-2">
                  <select className={fieldClass} style={fieldStyle} value={fyMonth} onChange={(e) => setFyMonth(Number(e.target.value))} aria-label={t("periods.month")}>
                    {MONTHS.map((m) => (
                      <option key={m} value={m}>
                        {tm(String(m))}
                      </option>
                    ))}
                  </select>
                  <input className={`${fieldClass} w-24`} style={fieldStyle} type="number" min={1} max={31} value={fyDay} onChange={(e) => setFyDay(Math.max(1, Math.min(31, Number(e.target.value) || 1)))} aria-label={t("periods.day")} />
                </div>
              </Field>
              <Field label={t("periods.conversion")} hint={t("periods.conversionHint")}>
                <input className={fieldClass} style={fieldStyle} type="date" value={conversionDate} max={props.today} onChange={(e) => setConversionDate(e.target.value)} />
              </Field>
            </div>
            {registered && conversionDate !== suggestedStart && (
              <button type="button" className="text-xs font-semibold text-(--brand)" onClick={() => setConversionDate(suggestedStart)}>
                {t("periods.useSuggested", { date: suggestedStart })}
              </button>
            )}
            <Notice>{t("periods.openingNote")}</Notice>
          </div>
        )}

        {step === "review" && j && (
          <div className="space-y-5">
            <div>
              <h2 className="text-base font-semibold text-ink">{t("review.heading")}</h2>
              <p className="text-sm text-muted">{t("review.body", { studio: props.studioName })}</p>
            </div>

            <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <Row label={t("review.country")} value={`${j.flag} ${j.name}${regionPack ? ` — ${regionPack.name}` : ""}`} />
              <Row label={t("review.currency")} value={j.currency} />
              <Row label={t("review.tax")} value={registered ? `${t("tax.registered", { tax: j.taxName })}${taxNumber ? ` · ${taxNumber}` : ""}` : t("tax.notRegistered", { tax: j.taxName })} />
              {registered && <Row label={t("review.basis")} value={j.bases.find((b) => b.id === basisId)?.label ?? ""} />}
              {registered && <Row label={t("review.returns")} value={`${j.returnForm.name} · ${tf(frequency)}`} />}
              <Row label={t("review.fy")} value={`${tm(String(fyMonth))} ${fyDay}`} />
              <Row label={t("review.start")} value={conversionDate} />
            </dl>

            <details className="rounded-xl border p-3" style={{ borderColor: "var(--hair)" }}>
              <summary className="cursor-pointer text-sm font-semibold text-ink">{t("review.ratesTitle", { count: rates.length })}</summary>
              <ul className="mt-2 grid grid-cols-1 gap-1 text-xs sm:grid-cols-2">
                {rates.map((r) => (
                  <li key={r.code} className="flex justify-between gap-2 text-muted">
                    <span className="truncate">{r.name}</span>
                    <span className="tabular-nums">{r.rateBp / 100}%</span>
                  </li>
                ))}
              </ul>
            </details>

            <details className="rounded-xl border p-3" style={{ borderColor: "var(--hair)" }}>
              <summary className="cursor-pointer text-sm font-semibold text-ink">{t("review.chartTitle", { count: chart.length })}</summary>
              <ul className="mt-2 grid grid-cols-1 gap-1 text-xs sm:grid-cols-2">
                {chart.map((a) => (
                  <li key={a.code} className="flex gap-2 text-muted">
                    <span className="w-16 shrink-0 tabular-nums">{a.code}</span>
                    <span className="truncate">{a.name}</span>
                  </li>
                ))}
              </ul>
            </details>

            {registered && stdRate && stdRate.rateBp !== 1500 && props.productsAtNzRate > 0 && (
              <label className="flex items-start gap-3 text-sm">
                <input type="checkbox" className="mt-1" checked={updateProductRates} onChange={(e) => setUpdateProductRates(e.target.checked)} />
                <span>
                  <span className="block font-semibold text-ink">{t("review.updateProducts", { count: props.productsAtNzRate, rate: `${stdRate.rateBp / 100}%` })}</span>
                  <span className="block text-xs text-muted">{t("review.updateProductsHint")}</span>
                </span>
              </label>
            )}

            {j.notes.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted">{t("review.notes")}</p>
                <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
                  {j.notes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              </div>
            )}

            <Notice tone="warn">{t("review.disclaimer", { date: j.reviewedAt })}</Notice>
          </div>
        )}

        {error && (
          <p className="mt-4 text-sm" role="alert" style={{ color: "var(--danger, #c0392b)" }}>
            {error}
          </p>
        )}

        <div className="mt-6 flex justify-between gap-2">
          <button type="button" onClick={back} disabled={step === "country" || pending} className={secondaryButton} style={secondaryButtonStyle}>
            {t("back")}
          </button>
          {step === "review" ? (
            <button type="button" onClick={submit} disabled={pending} className={primaryButton}>
              {pending ? t("creating") : t("create")}
            </button>
          ) : (
            <button type="button" onClick={next} className={primaryButton}>
              {t("next")}
            </button>
          )}
        </div>
      </GlassPanel>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-b py-1.5" style={{ borderColor: "var(--hair)" }}>
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-medium text-ink">{value}</dd>
    </div>
  );
}
