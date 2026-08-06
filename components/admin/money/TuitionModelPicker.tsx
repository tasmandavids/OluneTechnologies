"use client";

// ============================================================================
//  Money → Products → How you charge.
//
//  The one screen that decides what a family is quoted. A studio picks a model
//  once and the catalogue below only shows the controls that model uses, which
//  is the whole point: the person setting this up runs a dance school, not a
//  billing system, and shouldn't have to hold three pricing schemes in their
//  head to price one class.
//
//  Every card is a sentence and a worked example in real money. Two of them
//  restate the studio's own complaint back to them — "$299 + $299 = $598" is
//  the thing that was wrong, so the fix reads as an answer rather than a
//  setting.
// ============================================================================

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { GlassPanel } from "@/components/portal/admin/glass/GlassPanel";
import { toast } from "@/lib/feedback";
import { formatMoney } from "@/lib/currency";
import {
  TUITION_PRICING_MODELS,
  type TuitionPricingModel,
} from "@/lib/billing/tuition-quote";
import { setTuitionPricingModel } from "@/app/portal/admin/money/product-actions";

export type TuitionModelWarnings = {
  classesWithoutEndTime: number;
  activeSubscriptions: number;
};

export function TuitionModelPicker({
  model,
  warnings,
}: {
  model: TuitionPricingModel;
  warnings: TuitionModelWarnings;
}) {
  const t = useTranslations("admin.money.tuitionModel");
  const [selected, setSelected] = useState<TuitionPricingModel>(model);
  const [confirming, setConfirming] = useState<TuitionPricingModel | null>(null);
  const [pending, startTransition] = useTransition();

  function choose(next: TuitionPricingModel) {
    if (next === selected) return;
    setConfirming(next);
  }

  function commit(next: TuitionPricingModel) {
    startTransition(async () => {
      const result = await setTuitionPricingModel(next);
      if (!result.ok) {
        toast.error(result.error);
        setConfirming(null);
        return;
      }
      setSelected(next);
      setConfirming(null);
      toast.success(t("saved"));
      location.reload();
    });
  }

  return (
    <GlassPanel className="space-y-4">
      <div>
        <p className="font-medium text-ink">{t("title")}</p>
        <p className="mt-0.5 text-sm text-muted">{t("description")}</p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {TUITION_PRICING_MODELS.map((option) => {
          const active = selected === option;
          return (
            <button
              key={option}
              onClick={() => choose(option)}
              disabled={pending}
              className="rounded-2xl border p-4 text-left transition disabled:opacity-60"
              style={{
                background: active ? "var(--t3)" : "var(--surface)",
                borderColor: active ? "var(--brand)" : "var(--hair)",
              }}
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-ink">{t(`options.${option}.name`)}</span>
                {option === "per_class" && (
                  <span
                    className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase text-muted"
                    style={{ background: "var(--t3)" }}
                  >
                    {t("badges.simplest")}
                  </span>
                )}
                {option === "hours" && (
                  <span
                    className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase text-muted"
                    style={{ background: "var(--t3)" }}
                  >
                    {t("badges.studioPro")}
                  </span>
                )}
              </div>
              <p className="mt-1.5 text-xs text-muted">{t(`options.${option}.body`)}</p>
              <p className="mt-2 text-xs font-medium text-ink">
                {t(`options.${option}.example`, {
                  each: formatMoney(29900),
                  both: formatMoney(59800),
                  twoHours: formatMoney(17000),
                  threeHours: formatMoney(23000),
                })}
              </p>
            </button>
          );
        })}
      </div>

      {confirming && (
        <div
          className="space-y-3 rounded-xl border p-4"
          style={{ background: "var(--surface)", borderColor: "var(--hair)" }}
        >
          <p className="text-sm font-medium text-ink">
            {t("confirm.title", { model: t(`options.${confirming}.name`) })}
          </p>
          <p className="text-xs text-muted">{t("confirm.body")}</p>

          {/* Sent invoices carry their own frozen prices, so switching can't
              rewrite them — but per-class invoices already paid this term don't
              count toward an hours ladder, so the first hours enrolment charges
              the full band on top. Best changed between terms. */}
          {confirming === "hours" && <p className="text-xs text-muted">{t("confirm.betweenTerms")}</p>}

          {confirming === "hours" && warnings.classesWithoutEndTime > 0 && (
            <p className="text-xs text-amber-600">
              {t("warnings.noEndTime", { count: warnings.classesWithoutEndTime })}{" "}
              <Link href="/portal/admin/classes" className="font-semibold underline">
                {t("warnings.fixInClasses")}
              </Link>
            </p>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={() => commit(confirming)}
              disabled={pending}
              className="rounded-full px-5 py-2 text-sm font-semibold text-white transition disabled:opacity-50"
              style={{
                background:
                  "linear-gradient(150deg, var(--tg), var(--brand) 60%, var(--brand-deep))",
              }}
            >
              {pending ? t("confirm.saving") : t("confirm.confirm")}
            </button>
            <button
              onClick={() => setConfirming(null)}
              disabled={pending}
              className="text-sm font-semibold text-muted"
            >
              {t("confirm.cancel")}
            </button>
          </div>
        </div>
      )}
    </GlassPanel>
  );
}
