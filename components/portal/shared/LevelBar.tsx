"use client";

// ============================================================================
//  LevelBar — the dancer's XP journey (Little Dancer → Étoile).
//  Current level, total XP, and an animated progress bar toward the next level.
// ============================================================================

import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import type { XpSummary } from "@/lib/portal/badges-data";

export default function LevelBar({ xp }: { xp: XpSummary }) {
  const t = useTranslations("portal.progress.badges");

  const pct =
    xp.xpForLevel && xp.xpForLevel > 0
      ? Math.min(100, Math.round((xp.xpIntoLevel / xp.xpForLevel) * 100))
      : 100;
  const atTop = xp.xpToNext === null;

  return (
    <section className="rounded-2xl border border-[--hair] bg-surface p-5">
      <div className="flex items-center gap-4">
        <span
          className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-2xl"
          style={{ background: "var(--brand)", boxShadow: "0 6px 20px rgba(0,0,0,0.12)" }}
          aria-hidden
        >
          {xp.levelIcon ?? "🩰"}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <p className="text-lg font-black tracking-tight text-ink">{xp.levelName}</p>
            <p className="text-sm font-bold text-muted">
              {t("levelLabel", { level: xp.level })} · {t("xpTotal", { xp: xp.totalXp })}
            </p>
          </div>

          <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-base">
            <motion.div
              className="h-full rounded-full"
              style={{ background: "var(--brand)" }}
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.8, ease: "easeOut" }}
            />
          </div>

          <p className="mt-1.5 text-xs text-muted">
            {atTop
              ? t("maxLevel")
              : t("toNext", { xp: xp.xpToNext ?? 0, level: xp.nextLevelName ?? "" })}
          </p>
        </div>
      </div>
    </section>
  );
}
