"use client";

// ============================================================================
//  PulseRow — the three glass stat pills atop Today (Occupancy / Enrolled /
//  Collected). Delta-free by design — see PulseStat's doc comment in
//  types.ts for why.
// ============================================================================

import { useTranslations, useLocale } from "next-intl";
import { onMagnetMove, onMagnetLeave } from "@/components/portal/admin/glass/useMicroInteractions";
import type { PulseStat } from "./types";

export function PulseRow({ pulse }: { pulse: PulseStat[] }) {
  const t = useTranslations("admin.dashboard.pulse");
  const locale = useLocale();
  const numberFmt = new Intl.NumberFormat(locale);

  return (
    <div className="flex flex-wrap gap-2.5">
      {pulse.map((stat) => (
        <div
          key={stat.id}
          onMouseMove={onMagnetMove}
          onMouseLeave={onMagnetLeave}
          className="relative min-w-[136px] overflow-hidden rounded-[18px] border p-[13px_15px] transition-transform duration-300"
          style={{
            background: "linear-gradient(148deg, var(--refract), transparent 42%), var(--glass)",
            borderColor: "var(--edge)",
            backdropFilter: "blur(var(--blur)) saturate(1.85)",
            WebkitBackdropFilter: "blur(var(--blur))",
            boxShadow: "var(--shadow-s), inset 0 1px 0 var(--sheen), inset 0 -1px 0 var(--sheen2), inset 1px 0 0 var(--sheen2)",
          }}
        >
          <div
            className="pointer-events-none absolute -right-5 -top-10 h-[120px] w-[120px] rounded-full animate-[admin-halo_7s_ease-in-out_infinite]"
            style={{ background: "radial-gradient(circle, var(--t3), transparent 70%)" }}
          />
          <div className="relative text-[9px] font-semibold uppercase tracking-[0.16em] text-muted">
            {t(`${stat.id}.label`)}
          </div>
          <div className="relative my-1 font-display text-[25px] font-medium leading-[1.1] tabular-nums text-ink">
            {stat.format === "percent" ? `${stat.value}%` : numberFmt.format(stat.value)}
          </div>
        </div>
      ))}
    </div>
  );
}
