"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { formatMoney } from "@/lib/currency";
import { savePlanPrice } from "@/app/platform/plans/actions";

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
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-black text-ink">{t("title")}</h1>
        <p className="text-sm text-muted">{t("subtitle")}</p>
      </header>

      {rows.length === 0 && (
        <p className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-ink">
          {t("emptyWarning")}
        </p>
      )}

      {plans.map((plan) => (
        <section key={plan.key} className="box space-y-4 rounded-2xl p-5">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-base font-bold text-ink">{plan.key}</h2>
            <p className="text-xs text-muted">{t("moduleCount", { count: plan.moduleCount })}</p>
          </div>

          {INTERVALS.map((interval) => {
            const id = `${plan.key}:${interval}`;
            const cents = interval === "month" ? plan.monthlyCents : plan.annualCents;
            const saved = rows.find((r) => r.planKey === plan.key && r.interval === interval);

            return (
              <label key={interval} className="block text-sm">
                <span className="text-xs uppercase tracking-widest text-muted">
                  {t(`interval.${interval}`)} · {formatMoney(cents, { maximumFractionDigits: 0 })}
                </span>
                <div className="mt-1 flex gap-2">
                  <input
                    type="text"
                    spellCheck={false}
                    placeholder="price_1AbC…"
                    value={draft[id] ?? ""}
                    onChange={(e) => setDraft({ ...draft, [id]: e.target.value })}
                    className="w-full rounded-xl border border-[--hair] bg-base px-3 py-2 font-mono text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => save(plan.key, interval)}
                    disabled={pending || !(draft[id] ?? "").trim()}
                    className="shrink-0 rounded-xl bg-brand px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
                  >
                    {t("save")}
                  </button>
                </div>
                {!saved && <p className="mt-1 text-xs text-amber-600">{t("notSet")}</p>}
              </label>
            );
          })}
        </section>
      ))}

      {status && <p className="text-sm font-semibold text-ink">{status}</p>}
    </div>
  );
}
