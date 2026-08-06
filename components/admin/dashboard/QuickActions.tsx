"use client";

// ============================================================================
//  QuickActions — 2x2 shortcuts into the pages owners reach for most from
//  the dashboard. Real links only, no invented functionality.
// ============================================================================

import Link from "next/link";
import { useTranslations } from "next-intl";
import { onMagnetMove, onMagnetLeave } from "@/components/portal/admin/glass/useMicroInteractions";
import { IconCalendarPlus, IconReceipt, IconMegaphone, IconUserPlus, IconQrCode } from "./icons";

const ACTIONS = [
  { key: "addClass", href: "/portal/admin/classes", icon: IconCalendarPlus },
  { key: "newInvoice", href: "/portal/admin/money?tab=invoices", icon: IconReceipt },
  { key: "message", href: "/portal/admin/messages", icon: IconMegaphone },
  { key: "addLead", href: "/portal/admin/leads", icon: IconUserPlus },
  { key: "redeemPass", href: "/portal/admin/passes", icon: IconQrCode },
] as const;

export function QuickActions() {
  const t = useTranslations("admin.dashboard.quickActions");

  return (
    <div>
      <h2 className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{t("title")}</h2>
      <div className="grid grid-cols-2 gap-2">
        {ACTIONS.map(({ key, href, icon: Icon }) => (
          <Link
            key={key}
            href={href}
            onMouseMove={onMagnetMove}
            onMouseLeave={onMagnetLeave}
            className="box flex items-center gap-2 rounded-xl px-3 py-2.5 text-[13px] font-medium text-ink transition-transform duration-300 hover:bg-[color-mix(in_srgb,var(--brand)_8%,var(--surface))]"
          >
            <Icon className="h-4 w-4 shrink-0" style={{ color: "var(--brand-deep)" }} />
            {t(key)}
          </Link>
        ))}
      </div>
    </div>
  );
}
