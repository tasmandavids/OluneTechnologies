"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { GlassPanel } from "@/components/portal/admin/glass/GlassPanel";
import { fileTaxReturnAction } from "@/app/portal/admin/books/actions";
import { resolveJurisdiction, type CustomJurisdictionInput } from "@/lib/ledger/jurisdictions";
import type { TaxReturnEntry } from "@/lib/ledger/jurisdictions/types";
import { formatLedgerMoney, parseMoneyInput } from "@/lib/ledger/money";
import { computeReturn, rateBreakdown } from "@/lib/ledger/tax-return";
import { Dialog } from "./Dialog";
import { Field, Notice, fieldClass, fieldStyle, primaryButton, secondaryButton, secondaryButtonStyle, smallFieldClass } from "./ui";

type Props = {
  jurisdictionCode: string;
  custom: CustomJurisdictionInput | null;
  entries: TaxReturnEntry[];
  rateNames: Record<string, string>;
  periodStart: string;
  periodEnd: string;
  canFile: boolean;
  reasonCantFile: string | null;
  currency: string;
  locale: string;
  notes: string[];
  separateAccounts: boolean;
};

export function TaxReturnView(props: Props) {
  const t = useTranslations("books.tax");
  const te = useTranslations("books.errors");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [manual, setManual] = useState<Record<string, string>>({});
  const [filing, setFiling] = useState(false);
  const [reference, setReference] = useState("");
  const [error, setError] = useState<string | null>(null);

  const j = useMemo(() => resolveJurisdiction(props.jurisdictionCode, props.custom), [props.jurisdictionCode, props.custom]);
  const manualCents = useMemo(() => Object.fromEntries(Object.entries(manual).map(([k, v]) => [k, parseMoneyInput(v) ?? 0])), [manual]);
  const result = useMemo(() => computeReturn(j, props.entries, manualCents), [j, props.entries, manualCents]);
  const breakdown = useMemo(() => rateBreakdown(props.entries), [props.entries]);
  const money = (c: number) => formatLedgerMoney(c, props.currency, props.locale);
  const net = result.netPayableCents;

  let lastSection: string | undefined;

  return (
    <div className="space-y-4">
      <GlassPanel className="!p-0 overflow-hidden">
        <div className="flex items-center justify-between px-5 pt-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">{result.formName}</p>
        </div>
        <table className="w-full text-sm">
          <tbody>
            {result.boxes.map((b) => {
              const heading = b.section && b.section !== lastSection ? b.section : null;
              if (b.section) lastSection = b.section;
              return (
                <FragmentRow key={b.id} heading={heading}>
                  <tr style={{ borderTop: "1px solid var(--hair)" }}>
                    <td className="w-24 px-4 py-2.5 align-top font-semibold text-muted">{b.id}</td>
                    <td className={`px-3 py-2.5 ${b.total ? "font-semibold text-ink" : "text-ink"}`}>
                      {b.label}
                      {b.manual && <span className="ml-2 text-xs text-muted">{t("manualBox")}</span>}
                    </td>
                    <td className="w-48 px-4 py-2.5 text-right">
                      {b.manual ? (
                        <input
                          className={`${smallFieldClass} text-right tabular-nums`}
                          style={fieldStyle}
                          inputMode="decimal"
                          value={manual[b.id] ?? ""}
                          placeholder="0.00"
                          onChange={(e) => setManual({ ...manual, [b.id]: e.target.value })}
                          aria-label={b.label}
                        />
                      ) : (
                        <span className={`tabular-nums ${b.total ? "font-semibold text-ink" : ""}`}>{money(b.valueCents)}</span>
                      )}
                    </td>
                  </tr>
                </FragmentRow>
              );
            })}
          </tbody>
        </table>
      </GlassPanel>

      <GlassPanel className="!p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">{net >= 0 ? t("toPay") : t("toRefund")}</p>
            <p className="tabular-nums text-ink" style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: "1.8rem" }}>
              {money(Math.abs(net))}
            </p>
            <p className="text-xs text-muted">{t("ledgerCheck", { output: money(result.ledgerOutputTaxCents), input: money(result.ledgerInputTaxCents) })}</p>
          </div>
          <div className="text-right">
            <button type="button" className={primaryButton} disabled={!props.canFile} onClick={() => { setError(null); setFiling(true); }}>
              {t("markFiled")}
            </button>
            {props.reasonCantFile && <p className="mt-1 max-w-xs text-xs text-muted">{props.reasonCantFile}</p>}
          </div>
        </div>
      </GlassPanel>

      <GlassPanel className="!p-0 overflow-hidden">
        <p className="px-5 pt-4 text-xs font-semibold uppercase tracking-wider text-muted">{t("byRate")}</p>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-semibold uppercase tracking-wide text-muted">
              <th className="px-4 py-2">{t("rate")}</th>
              <th className="px-4 py-2">{t("direction")}</th>
              <th className="px-4 py-2 text-right">{t("net")}</th>
              <th className="px-4 py-2 text-right">{t("taxAmount")}</th>
            </tr>
          </thead>
          <tbody>
            {breakdown.map((b) => (
              <tr key={`${b.direction}-${b.rateCode}`} style={{ borderTop: "1px solid var(--hair)" }}>
                <td className="px-4 py-2 text-ink">{props.rateNames[b.rateCode] ?? b.rateCode}</td>
                <td className="px-4 py-2 text-muted">{t(`directions.${b.direction}`)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{money(b.netCents)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{money(b.taxCents)}</td>
              </tr>
            ))}
            {breakdown.length === 0 && (
              <tr style={{ borderTop: "1px solid var(--hair)" }}>
                <td colSpan={4} className="px-4 py-6 text-center text-sm text-muted">
                  {t("nothing")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </GlassPanel>

      {props.notes.length > 0 && (
        <ul className="list-disc space-y-1 pl-5 text-xs text-muted">
          {props.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}

      {filing && (
        <Dialog title={t("fileTitle")} onClose={() => setFiling(false)}>
          <p className="text-sm text-muted">{t("fileBody", { start: props.periodStart, end: props.periodEnd })}</p>
          {props.separateAccounts && <p className="mt-2 text-sm text-muted">{t("fileSettlement")}</p>}
          <div className="mt-3">
            <Field label={t("filingReference")} hint={t("filingReferenceHint")}>
              <input className={fieldClass} style={fieldStyle} value={reference} onChange={(e) => setReference(e.target.value)} />
            </Field>
          </div>
          <div className="mt-3">
            <Notice tone="warn">{t("fileWarning")}</Notice>
          </div>
          {error && <p className="mt-3 text-sm" role="alert" style={{ color: "var(--danger, #c0392b)" }}>{error}</p>}
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" className={secondaryButton} style={secondaryButtonStyle} onClick={() => setFiling(false)}>
              {t("cancel")}
            </button>
            <button
              type="button"
              className={primaryButton}
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await fileTaxReturnAction({ periodStart: props.periodStart, periodEnd: props.periodEnd, filingReference: reference || null, manualValues: manualCents });
                  if (!res.ok) return setError(te.has(res.error) ? te(res.error) : res.error);
                  setFiling(false);
                  router.refresh();
                })
              }
            >
              {pending ? t("filing") : t("confirmFiled")}
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}

function FragmentRow({ heading, children }: { heading: string | null; children: ReactNode }) {
  return (
    <>
      {heading && (
        <tr>
          <td colSpan={3} className="px-4 pb-1 pt-4 text-xs font-semibold uppercase tracking-wider text-muted">
            {heading}
          </td>
        </tr>
      )}
      {children}
    </>
  );
}
