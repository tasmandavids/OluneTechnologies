"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { formatMoney } from "@/lib/currency";
import { savePlanPrice } from "@/app/platform/plans/actions";
import { GlassPanel } from "@/components/portal/admin/glass/GlassPanel";
import { RippleButton } from "@/components/portal/admin/glass/RippleButton";
import { PlatformPageHeader, StatusPill, fieldClass } from "./glass/ui";

type Row = {
  planKey: string;
  interval: "month" | "year";
  stripePriceId: string;
  active: boolean;
};

type PlanRow = {
  key: string;
  monthlyCents: number;
  annualCents: number;
  moduleCount: number;
};

const INTERVALS = ["month", "year"] as const;

export function PlanPricesForm({ rows, plans }: { rows: Row[]; plans: PlanRow[] }) {
  const t = useTranslations("platform.plans");
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<string | null>(null);

  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(rows.map((r) => [`${r.planKey}:${r.interval}`, r.stripePriceId])),
  );

  function save(planKey: string, interval: "month" | "year") {
    const stripePriceId = (draft[`${planKey}:${interval}`] ?? "").trim();
    startTransition(async () => {
      const res = await savePlanPrice({ planKey, interval, stripePriceId, active: true });
      setStatus(res.ok ? t("saved") : res.error);
      setTimeout(() => setStatus(null), 3000);
    });
  }

  return (
    <div className="py-2">
      <PlatformPageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        actions={status ? <span className="text-sm font-semibold text-ink" role="status">{status}</span> : undefined}
      />

      {rows.length === 0 && (
        <p
          className="mb-3.5 rounded-2xl border p-4 text-sm text-ink"
          style={{ borderColor: "color-mix(in srgb, #f2b788 60%, transparent)", background: "color-mix(in srgb, #f2b788 16%, transparent)" }}
        >
          {t("emptyWarning")}
        </p>
      )}

      <div className="grid items-start gap-3.5 md:grid-cols-2 xl:grid-cols-3">
        {plans.map((plan) => (
          <GlassPanel key={plan.key}>
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="font-display text-2xl font-medium capitalize tracking-tight text-ink">{plan.key}</h2>
              <p className="text-xs text-muted">{t("moduleCount", { count: plan.moduleCount })}</p>
            </div>
            <p className="mt-1 font-display text-[40px] font-semibold leading-none tracking-[-0.05em] tabular-nums text-ink">
              {formatMoney(plan.monthlyCents, { maximumFractionDigits: 0 })}
              <span className="ml-1.5 font-body text-[13px] font-normal tracking-normal text-muted">
                /mo · {formatMoney(plan.annualCents, { maximumFractionDigits: 0 })}/yr
              </span>
            </p>
            <div className="my-[18px] h-px bg-(--hair)" />
            {INTERVALS.map((interval) => {
              const id = `${plan.key}:${interval}`;
              const cents = interval === "month" ? plan.monthlyCents : plan.annualCents;
              const saved = rows.find((r) => r.planKey === plan.key && r.interval === interval);
              return (
                <label key={interval} className="mb-3.5 block last:mb-0">
                  <span className="mb-2 block text-[9.5px] font-semibold uppercase tracking-[0.16em] text-muted">
                    {t(`interval.${interval}`)} · {formatMoney(cents, { maximumFractionDigits: 0 })}
                  </span>
                  <span className="flex gap-2">
                    <input
                      type="text"
                      spellCheck={false}
                      placeholder="price_1AbC…"
                      value={draft[id] ?? ""}
                      onChange={(e) => setDraft({ ...draft, [id]: e.target.value })}
                      className={`${fieldClass} font-mono text-xs`}
                    />
                    <RippleButton onClick={() => save(plan.key, interval)} disabled={pending || !(draft[id] ?? "").trim()}>
                      {t("save")}
                    </RippleButton>
                  </span>
                  {!saved && (
                    <span className="mt-1.5 block">
                      <StatusPill tone="warm">{t("notSet")}</StatusPill>
                    </span>
                  )}
                </label>
              );
            })}
          </GlassPanel>
        ))}
      </div>
    </div>
  );
}
