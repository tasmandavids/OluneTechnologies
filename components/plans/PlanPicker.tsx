"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { formatMoney } from "@/lib/currency";
import {
  PLANS,
  PLAN_ORDER,
  DEFAULT_PLAN,
  planAmountCents,
  type BillingInterval,
  type PlanKey,
} from "@/lib/plans/catalog";

/**
 * The three tiers, an interval toggle, and a button that starts Checkout.
 *
 * Shared by /plan/locked and /portal/admin/plan so a studio sees the same
 * prices and the same module lists whether it is buying for the first time or
 * changing tier. `currentPlan` is what turns the same component into an
 * upgrade screen.
 */
export function PlanPicker({
  currentPlan = null,
  defaultInterval = "month",
}: {
  currentPlan?: PlanKey | null;
  defaultInterval?: BillingInterval;
}) {
  const t = useTranslations("plan");
  const [interval, setInterval] = useState<BillingInterval>(defaultInterval);
  const [busy, setBusy] = useState<PlanKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function subscribe(plan: PlanKey) {
    setBusy(plan);
    setError(null);
    try {
      const res = await fetch("/api/plans/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, interval }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        setError(data.error ?? t("errors.checkoutFailed"));
        setBusy(null);
        return;
      }
      startTransition(() => {
        window.location.href = data.url as string;
      });
    } catch {
      setError(t("errors.checkoutFailed"));
      setBusy(null);
    }
  }

  return (
    <div>
      <div className="mb-6 flex justify-center">
        <div className="box-pill inline-flex gap-1 p-1">
          {(["month", "year"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setInterval(option)}
              className={
                interval === option
                  ? "rounded-full bg-brand px-4 py-1.5 text-xs font-bold text-white"
                  : "rounded-full px-4 py-1.5 text-xs font-semibold text-muted hover:text-ink"
              }
            >
              {option === "month" ? t("interval.monthly") : t("interval.annual")}
            </button>
          ))}
        </div>
      </div>

      {interval === "year" && (
        <p className="mb-6 text-center text-xs font-semibold text-brand">{t("interval.saving")}</p>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        {PLAN_ORDER.map((key) => {
          const plan = PLANS[key];
          const isCurrent = currentPlan === key;
          const popular = key === DEFAULT_PLAN;

          return (
            <div
              key={key}
              className={
                popular
                  ? "relative rounded-2xl border-2 border-brand bg-surface p-5"
                  : "relative rounded-2xl border border-[--hair] bg-surface p-5"
              }
            >
              {popular && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brand px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-white">
                  {t("mostPopular")}
                </span>
              )}

              <h3 className="text-base font-bold text-ink">{t(`plans.${key}.name`)}</h3>
              <p className="mt-1 text-xs text-muted">{t(`plans.${key}.tagline`)}</p>

              <p className="mt-4 text-2xl font-bold text-ink">
                {formatMoney(planAmountCents(plan, interval), { maximumFractionDigits: 0 })}
                <span className="text-sm font-medium text-muted">
                  {interval === "year" ? t("perYear") : t("perMonth")}
                </span>
              </p>

              <p className="mt-3 text-xs leading-relaxed text-muted">{t(`plans.${key}.body`)}</p>

              <ul className="mt-4 space-y-1.5">
                {plan.modules.slice(0, 8).map((moduleKey) => (
                  <li key={moduleKey} className="text-xs text-muted">
                    {t(`modules.${moduleKey}`)}
                  </li>
                ))}
                {plan.modules.length > 8 && (
                  <li className="text-xs font-semibold text-ink">
                    {t("moreModules", { count: plan.modules.length - 8 })}
                  </li>
                )}
              </ul>

              <button
                type="button"
                onClick={() => subscribe(key)}
                disabled={busy !== null || isCurrent}
                className={
                  popular
                    ? "mt-5 w-full rounded-full bg-brand px-4 py-2 text-xs font-bold text-white disabled:opacity-60"
                    : "mt-5 w-full rounded-full border border-[--hair] px-4 py-2 text-xs font-bold text-ink disabled:opacity-60"
                }
              >
                {isCurrent
                  ? t("currentPlan")
                  : busy === key
                    ? t("opening")
                    : t("choosePlan")}
              </button>
            </div>
          );
        })}
      </div>

      <p className="mt-5 text-center text-xs text-muted">{t("unlimitedStudents")}</p>

      {error && (
        <p role="alert" className="mt-4 text-center text-xs font-semibold text-red-500">
          {error}
        </p>
      )}
    </div>
  );
}
