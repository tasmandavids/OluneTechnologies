"use client";

// ============================================================================
//  FamilyBadges — the parent's own "family" achievements (Supportive Family,
//  Production Family, …). Read-only; awarded by studio admins.
// ============================================================================

import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import type { ShowcaseBadge } from "@/lib/portal/badges-data";
import { TIER_STYLES } from "@/lib/portal/badge-style";

export default function FamilyBadges({ badges }: { badges: ShowcaseBadge[] }) {
  const t = useTranslations("portal.progress.badges");
  if (badges.length === 0) return null;

  const earnedCount = badges.filter((b) => b.earned).length;

  return (
    <section className="rounded-2xl border border-[--hair] bg-surface p-5">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted">
          {t("familyTitle", { earned: earnedCount, total: badges.length })}
        </h2>
        <p className="text-xs text-muted">{t("familySubtitle")}</p>
      </div>

      <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-6">
        {badges.map((b) => {
          const tier = TIER_STYLES[b.tier];
          return (
            <motion.div
              key={b.id}
              className="flex flex-col items-center gap-1.5 text-center"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              title={[b.name, b.description].filter(Boolean).join(" — ")}
            >
              <span
                className="grid h-16 w-16 place-items-center rounded-full text-2xl"
                style={
                  b.earned
                    ? {
                        background: "var(--surface)",
                        border: `2.5px solid ${tier.ring}`,
                        boxShadow: `0 0 0 4px ${tier.glow}`,
                      }
                    : {
                        background: "var(--base)",
                        border: "2px dashed var(--hair)",
                        filter: "grayscale(1)",
                        opacity: 0.55,
                      }
                }
                aria-hidden
              >
                {b.icon ?? "🏅"}
              </span>
              <span
                className={`line-clamp-2 text-[11px] font-semibold leading-tight ${
                  b.earned ? "text-ink" : "text-muted"
                }`}
              >
                {b.name}
              </span>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
