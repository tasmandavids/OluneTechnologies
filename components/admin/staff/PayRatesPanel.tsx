"use client";

// ============================================================================
//  PayRatesPanel — effective-dated pay rates for one staff member.
//
//  Admin-only by construction: staff_pay_rates has no self-read policy in 0118,
//  so this panel has no counterpart anywhere in the staff portal. See that
//  migration's header for why the person being paid doesn't see an "estimated
//  gross" figure that omits loading, tax and accrual.
//
//  Rates are added, not edited. A rate that was in force for a fortnight that
//  has already been paid is a historical fact; correcting a typo means adding
//  the right rate from the right date, or deleting the wrong row outright.
// ============================================================================

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { GlassPanel } from "@/components/portal/admin/glass/GlassPanel";
import { formatMoney } from "@/lib/currency";
import { deletePayRate, setPayRate } from "@/app/portal/admin/staff/actions";

export type PayRateRow = {
  id: string;
  effectiveFrom: string;
  rateCents: number;
  currency: string;
};

/** "24.50" → 2450. Returns null for anything that isn't a positive amount. */
function dollarsToCents(input: string): number | null {
  const value = Number(input.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

export default function PayRatesPanel({
  staffId,
  rates,
  onSaved,
}: {
  staffId: string;
  rates: PayRateRow[];
  onSaved?: () => void;
}) {
  const t = useTranslations("timeclock.admin.rates");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [from, setFrom] = useState("");

  const save = () => {
    const rateCents = dollarsToCents(amount);
    if (rateCents === null || !from) {
      setError(t("errors.needAmountAndDate"));
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await setPayRate({
        staffId,
        effectiveFrom: from,
        rateCents,
        currency: "NZD",
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setAmount("");
      setFrom("");
      onSaved?.();
    });
  };

  const remove = (id: string) => {
    setError(null);
    startTransition(async () => {
      const result = await deletePayRate(id);
      if (!result.ok) setError(result.error);
      else onSaved?.();
    });
  };

  // Newest first: the current rate is the one a manager looks for.
  const sorted = [...rates].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));

  return (
    <GlassPanel className="space-y-4 !p-5">
      <div>
        <h3 className="font-semibold text-ink">{t("title")}</h3>
        <p className="mt-0.5 text-xs text-muted">{t("subtitle")}</p>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {error}
        </p>
      )}

      {sorted.length === 0 ? (
        <p className="text-sm text-muted">{t("empty")}</p>
      ) : (
        <ul className="space-y-1.5">
          {sorted.map((rate, index) => (
            <li
              key={rate.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-[--hair] px-3 py-2 text-sm"
            >
              <span className="text-ink">
                <span className="font-semibold tabular-nums">
                  {formatMoney(rate.rateCents)}
                </span>
                <span className="text-muted"> {t("perHour")}</span>
              </span>
              <span className="flex items-center gap-2 text-xs text-muted">
                {t("from", { date: rate.effectiveFrom })}
                {index === 0 && (
                  <span className="rounded-full bg-brand/15 px-2 py-0.5 text-[0.55rem] font-semibold uppercase tracking-wider text-brand">
                    {t("current")}
                  </span>
                )}
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => remove(rate.id)}
                  className="text-red-600 underline disabled:opacity-50"
                >
                  {t("remove")}
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-end gap-2 border-t border-[--hair] pt-3">
        <label className="text-xs text-muted">
          {t("fields.amount")}
          <input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="24.50"
            className="mt-1 block w-28 rounded-lg border border-[--hair] bg-base px-3 py-2 text-sm text-ink"
          />
        </label>
        <label className="text-xs text-muted">
          {t("fields.effectiveFrom")}
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="mt-1 block rounded-lg border border-[--hair] bg-base px-3 py-2 text-sm text-ink"
          />
        </label>
        <button
          type="button"
          disabled={pending}
          onClick={save}
          className="rounded-xl px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
          style={{ background: "var(--brand)" }}
        >
          {t("add")}
        </button>
      </div>
    </GlassPanel>
  );
}
