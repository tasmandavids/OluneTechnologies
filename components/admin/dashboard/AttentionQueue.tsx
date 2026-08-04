"use client";

// ============================================================================
//  AttentionQueue — "what needs me today" panel. Two real signals for now:
//  overdue invoices and new/trial leads (both server-computed in page.tsx).
//  Empty state shown when there's nothing outstanding.
// ============================================================================

import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import { useMemo } from "react";
import { onGlowMove, onGlowLeave } from "@/components/portal/admin/glass/useMicroInteractions";
import type { AttentionData } from "./types";
import { IconAlertCircle, IconUserPlus, IconCheckCircle, IconCalendarDays } from "./icons";

export function AttentionQueue({ attention }: { attention: AttentionData }) {
  const t = useTranslations("admin.dashboard.attention");
  const locale = useLocale();
  const currency = useMemo(
    () => new Intl.NumberFormat(locale, { style: "currency", currency: "NZD", maximumFractionDigits: 0 }),
    [locale],
  );

  const items: Array<{
    key: string;
    icon: React.ReactNode;
    warn: boolean;
    title: string;
    subtitle: string;
    action: string;
    href: string;
  }> = [];

  if (attention.overdueCount > 0) {
    items.push({
      key: "overdue",
      icon: <IconAlertCircle className="h-[18px] w-[18px]" style={{ color: "#dc2626" }} />,
      warn: true,
      title: t("overdueTitle", { count: attention.overdueCount }),
      subtitle: t("overdueSubtitle", {
        amount: currency.format(attention.overdueAmountCents / 100),
        families: attention.overdueFamilies,
        days: attention.overdueOldestDays,
      }),
      action: t("overdueAction"),
      href: "/portal/admin/money?tab=collections",
    });
  }

  if (attention.leadsCount > 0) {
    items.push({
      key: "leads",
      icon: <IconUserPlus className="h-[18px] w-[18px]" style={{ color: "var(--brand-deep)" }} />,
      warn: false,
      title: t("leadsTitle", { count: attention.leadsCount }),
      subtitle: t("leadsSubtitle", { days: attention.leadsOldestDays }),
      action: t("leadsAction"),
      href: "/portal/admin/leads",
    });
  }

  if (attention.unassignedCount > 0) {
    items.push({
      key: "unassigned",
      icon: <IconCalendarDays className="h-[18px] w-[18px]" style={{ color: "#dc2626" }} />,
      warn: true,
      title: t("unassignedTitle", { count: attention.unassignedCount }),
      subtitle: attention.unassignedNextLabel ?? "",
      action: t("unassignedAction"),
      href: "/portal/admin/classes",
    });
  }

  if (attention.conflictCount > 0) {
    items.push({
      key: "conflict",
      icon: <IconAlertCircle className="h-[18px] w-[18px]" style={{ color: "#dc2626" }} />,
      warn: true,
      title: t("conflictTitle", { count: attention.conflictCount }),
      subtitle: attention.conflictLabel ?? "",
      action: t("conflictAction"),
      href: "/portal/admin/classes",
    });
  }

  return (
    <div>
      <div className="mb-2.5 flex items-baseline gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{t("title")}</h2>
        {items.length > 0 && (
          <span className="inline-grid h-[18px] min-w-[18px] place-items-center rounded-full bg-[--brand] px-1 text-[11px] font-semibold text-white">
            {items.length}
          </span>
        )}
      </div>

      {items.length === 0 ? (
        <div className="flex items-center gap-2.5 rounded-xl border border-dashed border-[--hair] bg-surface px-3.5 py-3">
          <IconCheckCircle className="h-[18px] w-[18px] shrink-0" style={{ color: "var(--brand-deep)" }} />
          <div>
            <p className="text-[13.5px] font-semibold text-ink">{t("allClear")}</p>
            <p className="text-xs text-muted">{t("allClearHint")}</p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((item) => (
            <div
              key={item.key}
              onMouseMove={onGlowMove}
              onMouseLeave={onGlowLeave}
              className="relative flex items-start gap-2.5 overflow-hidden rounded-[15px] border bg-surface p-3 transition-shadow duration-300"
              style={{ borderColor: item.warn ? "color-mix(in srgb, #dc2626 30%, var(--hair))" : "var(--hair)" }}
            >
              <div
                className="pointer-events-none absolute inset-0 transition-opacity duration-[1300ms] ease-out"
                style={{
                  opacity: "var(--glow-o, 0)",
                  background: "radial-gradient(220px circle at var(--mx, -200px) var(--my, -200px), var(--t3), transparent 72%)",
                }}
              />
              <span className="relative mt-0.5 shrink-0">{item.icon}</span>
              <div className="relative min-w-0 flex-1">
                <p className="text-[13.5px] font-semibold text-ink">{item.title}</p>
                <p className="mt-0.5 text-xs text-muted">{item.subtitle}</p>
              </div>
              <Link
                href={item.href}
                className="relative shrink-0 rounded-[9px] border border-[--hair] px-2.5 py-[5px] text-xs font-semibold text-ink transition-colors hover:border-transparent hover:bg-[color-mix(in_srgb,var(--brand)_10%,transparent)]"
              >
                {item.action}
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
