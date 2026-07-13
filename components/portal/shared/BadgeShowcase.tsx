"use client";

// ============================================================================
//  BadgeShowcase — the dancer's badge wall, grouped by category.
//  Earned badges glow with their tier ring; unearned are dimmed; secret badges
//  not yet earned are masked as "?" so they stay a surprise.
// ============================================================================

import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import type { ShowcaseBadge } from "@/lib/portal/badges-data";
import { CATEGORY_ORDER, TIER_STYLES } from "@/lib/portal/badge-style";

export default function BadgeShowcase({
  badges,
  earnedCount,
  totalCount,
}: {
  badges: ShowcaseBadge[];
  earnedCount: number;
  totalCount: number;
}) {
  const t = useTranslations("portal.progress.badges");

  if (totalCount === 0) {
    return (
      <section className="rounded-2xl border border-[--hair] bg-surface p-5">
        <h2 className="mb-1 text-xs font-semibold uppercase tracking-widest text-muted">
          {t("title", { earned: 0, total: 0 })}
        </h2>
        <p className="text-sm text-muted">{t("empty")}</p>
      </section>
    );
  }

  const byCategory = new Map<string, ShowcaseBadge[]>();
  for (const b of badges) {
    const list = byCategory.get(b.category) ?? [];
    list.push(b);
    byCategory.set(b.category, list);
  }
  const categories = [...CATEGORY_ORDER].filter((c) => byCategory.has(c));

  return (
    <section className="rounded-2xl border border-[--hair] bg-surface p-5">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted">
          {t("title", { earned: earnedCount, total: totalCount })}
        </h2>
        <p className="text-xs text-muted">{t("subtitle")}</p>
      </div>

      <div className="space-y-6">
        {categories.map((cat) => (
          <div key={cat}>
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-ink/70">
              {t(`categories.${cat}`)}
            </h3>
            <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-6">
              {(byCategory.get(cat) ?? []).map((b) => (
                <BadgeTile key={b.id} badge={b} lockedLabel={t("secret")} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function BadgeTile({
  badge,
  lockedLabel,
}: {
  badge: ShowcaseBadge;
  lockedLabel: string;
}) {
  const tier = TIER_STYLES[badge.tier];
  const title = badge.locked
    ? lockedLabel
    : [badge.name, badge.description, badge.note ? `“${badge.note}”` : null]
        .filter(Boolean)
        .join(" — ");

  return (
    <motion.div
      className="flex flex-col items-center gap-1.5 text-center"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      title={title}
    >
      <span
        className="grid h-16 w-16 place-items-center rounded-full text-2xl transition"
        style={
          badge.earned
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
        {badge.icon ?? "🏅"}
      </span>
      <span
        className={`line-clamp-2 text-[11px] font-semibold leading-tight ${
          badge.earned ? "text-ink" : "text-muted"
        }`}
      >
        {badge.locked ? lockedLabel : badge.name}
      </span>
      {badge.earned && (
        <span
          className="rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide"
          style={{ background: tier.chipBg, color: tier.chipText }}
        >
          {badge.tier}
        </span>
      )}
    </motion.div>
  );
}
