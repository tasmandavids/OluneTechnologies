"use client";

// ============================================================================
//  The hours rate card — a table the studio types, and nothing more.
//
//  "Two hours a week is $170." No percentages, no per-hour arithmetic, no
//  derived numbers. The preview underneath runs ladderTotalCents, the same
//  function the enrolment path bills with, so what a studio sees while typing
//  is exactly what a family is charged — it isn't an illustration.
// ============================================================================

import { useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { GlassPanel } from "@/components/portal/admin/glass/GlassPanel";
import { formatMoney } from "@/lib/currency";
import { toast } from "@/lib/feedback";
import {
  STARTER_HOUR_BANDS,
  STARTER_OVERFLOW_CENTS,
  formatHours,
  ladderTotalCents,
  normaliseLadder,
} from "@/lib/billing/hours-ladder";
import { saveHoursRateCard } from "@/app/portal/admin/money/product-actions";
import type { BillingProduct } from "@/lib/billing/types";

const fieldClass =
  "rounded-xl border px-3.5 py-2.5 text-sm text-ink outline-none transition placeholder:text-muted focus:border-[--brand]";
const fieldStyle = { background: "var(--surface)", borderColor: "var(--hair)" } as const;

type BandDraft = { hours: string; dollars: string };

/** The weeks a preview should cover — a light week, a typical one, a heavy one. */
const PREVIEW_HOURS = [0.75, 1.5, 2.5, 4, 6.5];

export function HoursRateCard({
  product,
  siblingDiscountPct,
}: {
  product: BillingProduct | null;
  siblingDiscountPct: number;
}) {
  const t = useTranslations("admin.money.rateCard");

  // Nothing saved yet means the studio has just picked this model, so open on
  // the starter table rather than an empty grid. Only the first save writes it.
  const seeded = product?.hourBands.length ? product.hourBands : STARTER_HOUR_BANDS;

  const [bands, setBands] = useState<BandDraft[]>(() =>
    seeded.map((b) => ({
      hours: String(b.minHours),
      dollars: (b.totalCents / 100).toFixed(2),
    })),
  );
  const [overflow, setOverflow] = useState(() => {
    const cents = product?.hourBands.length
      ? product.overflowRateCents
      : STARTER_OVERFLOW_CENTS;
    return cents != null ? (cents / 100).toFixed(2) : "";
  });
  const [pending, startTransition] = useTransition();

  const parsed = useMemo(() => {
    const rows = bands
      .map((b) => ({
        minHours: Number.parseFloat(b.hours),
        totalCents: Math.round(Number.parseFloat(b.dollars) * 100),
      }))
      .filter((b) => Number.isFinite(b.minHours) && b.minHours > 0 && Number.isFinite(b.totalCents));

    const overflowCents = overflow.trim() ? Math.round(Number.parseFloat(overflow) * 100) : null;

    return {
      rows,
      overflowCents: Number.isFinite(overflowCents ?? Number.NaN) ? overflowCents : null,
    };
  }, [bands, overflow]);

  // Same function the server bills with — this is the price, not a mock-up.
  const ladder = useMemo(
    () => normaliseLadder(parsed.rows, parsed.overflowCents),
    [parsed],
  );

  const duplicateHours = useMemo(() => {
    const seen = new Set<number>();
    for (const row of parsed.rows) {
      const key = Math.round(row.minHours * 100);
      if (seen.has(key)) return true;
      seen.add(key);
    }
    return false;
  }, [parsed.rows]);

  function sortRows() {
    setBands((current) =>
      [...current].sort((a, b) => {
        const ah = Number.parseFloat(a.hours);
        const bh = Number.parseFloat(b.hours);
        if (!Number.isFinite(ah)) return 1;
        if (!Number.isFinite(bh)) return -1;
        return ah - bh;
      }),
    );
  }

  function save() {
    if (duplicateHours) {
      toast.error(t("errors.duplicateHours"));
      return;
    }

    startTransition(async () => {
      const result = await saveHoursRateCard(parsed.rows, parsed.overflowCents);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
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

      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted">
          <span className="w-28">{t("columns.hours")}</span>
          <span>{t("columns.theyPay")}</span>
        </div>

        {bands.map((band, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <input
              type="number"
              min="0.25"
              step="0.25"
              value={band.hours}
              onBlur={sortRows}
              onChange={(e) =>
                setBands(bands.map((b, i) => (i === idx ? { ...b, hours: e.target.value } : b)))
              }
              className={`${fieldClass} w-28`}
              style={fieldStyle}
            />
            <input
              type="number"
              min="0"
              step="0.01"
              value={band.dollars}
              onChange={(e) =>
                setBands(bands.map((b, i) => (i === idx ? { ...b, dollars: e.target.value } : b)))
              }
              className={`${fieldClass} flex-1`}
              style={fieldStyle}
            />
            <button
              onClick={() => setBands(bands.filter((_, i) => i !== idx))}
              className="text-sm text-muted"
              aria-label={t("removeRow")}
            >
              ×
            </button>
          </div>
        ))}

        <button
          onClick={() => setBands([...bands, { hours: "", dollars: "" }])}
          className="text-xs font-semibold text-[--brand]"
        >
          {t("addRow")}
        </button>

        {duplicateHours && <p className="text-xs text-amber-600">{t("errors.duplicateHours")}</p>}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm text-ink">
        <span>{t("overflow.label")}</span>
        <input
          type="number"
          min="0"
          step="0.01"
          value={overflow}
          onChange={(e) => setOverflow(e.target.value)}
          placeholder="0.00"
          className={`${fieldClass} w-28`}
          style={fieldStyle}
        />
        <span className="text-xs text-muted">{t("overflow.hint")}</span>
      </div>

      {/* The screen that makes the model comprehensible in five seconds. */}
      <div className="rounded-xl px-4 py-3" style={{ background: "var(--t3)" }}>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          {t("preview.title")}
        </p>
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5">
          {PREVIEW_HOURS.map((hours) => {
            const total = ladderTotalCents(ladder, hours);
            return (
              <span key={hours} className="text-sm text-ink">
                <span className="text-muted">{formatHours(hours)} → </span>
                {formatMoney(total)}
              </span>
            );
          })}
        </div>
        {siblingDiscountPct > 0 && (
          <p className="mt-2 text-xs text-muted">
            {t("preview.sibling", {
              pct: siblingDiscountPct,
              amount: formatMoney(
                Math.round((ladderTotalCents(ladder, 2.5) * (100 - siblingDiscountPct)) / 100),
              ),
            })}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={save}
          disabled={pending}
          className="rounded-full px-5 py-2 text-sm font-semibold text-white transition disabled:opacity-50"
          style={{
            background: "linear-gradient(150deg, var(--tg), var(--brand) 60%, var(--brand-deep))",
          }}
        >
          {pending ? t("saving") : t("save")}
        </button>
        {product && <span className="text-xs text-muted">{t("editProduct", { name: product.name })}</span>}
      </div>
    </GlassPanel>
  );
}
