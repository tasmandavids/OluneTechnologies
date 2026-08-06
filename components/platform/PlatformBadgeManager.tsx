"use client";

// ============================================================================
//  PlatformBadgeManager — global badge catalogue editor (platform operators).
//  Adjust XP / tier / active state / copy for the shared, seeded badges.
// ============================================================================

import { useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { updateGlobalBadge } from "@/app/platform/badges/actions";
import { CATEGORY_ORDER, TIER_STYLES } from "@/lib/portal/badge-style";
import type { BadgeTier, BadgeRecipientType } from "@/lib/portal/badges-data";

export type GlobalBadge = {
  id: string;
  category: string;
  name: string;
  description: string | null;
  icon: string | null;
  tier: BadgeTier;
  xp: number;
  isSecret: boolean;
  recipientType: BadgeRecipientType;
  isActive: boolean;
};

const TIERS: BadgeTier[] = ["bronze", "silver", "gold", "diamond"];

export default function PlatformBadgeManager({ badges }: { badges: GlobalBadge[] }) {
  const t = useTranslations("platform.badges");
  const tCat = useTranslations("portal.progress.badges.categories");
  const [items, setItems] = useState(badges);
  const [pending, startTransition] = useTransition();
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const map = new Map<string, GlobalBadge[]>();
    for (const b of items) {
      const list = map.get(b.category) ?? [];
      list.push(b);
      map.set(b.category, list);
    }
    return [...CATEGORY_ORDER].filter((c) => map.has(c)).map((c) => [c, map.get(c)!] as const);
  }, [items]);

  function patchLocal(id: string, patch: Partial<GlobalBadge>) {
    setItems((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
    setDirty((prev) => new Set(prev).add(id));
  }

  function save(b: GlobalBadge) {
    setError(null);
    startTransition(async () => {
      const res = await updateGlobalBadge({
        badgeId: b.id,
        name: b.name,
        description: b.description,
        icon: b.icon ?? "🏅",
        xp: b.xp,
        tier: b.tier,
        isActive: b.isActive,
      });
      if (!res.ok) setError(res.error);
      else setDirty((prev) => {
        const next = new Set(prev);
        next.delete(b.id);
        return next;
      });
    });
  }

  const activeCount = items.filter((b) => b.isActive).length;

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-6">
      <header>
        <h1 className="text-2xl font-black text-ink">{t("title")}</h1>
        <p className="text-sm text-muted">
          {t("subtitle", { active: activeCount, total: items.length })}
        </p>
      </header>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="space-y-6">
        {grouped.map(([cat, list]) => (
          <section key={cat}>
            <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-muted">
              {tCat(cat)}
            </h2>
            <ul className="space-y-2">
              {list.map((b) => {
                const tier = TIER_STYLES[b.tier];
                const isDirty = dirty.has(b.id);
                return (
                  <li
                    key={b.id}
                    className="box flex flex-wrap items-center gap-3 rounded-2xl p-3"
                  >
                    <input
                      value={b.icon ?? ""}
                      onChange={(e) => patchLocal(b.id, { icon: e.target.value })}
                      maxLength={4}
                      className="h-10 w-12 shrink-0 rounded-full border-2 bg-base text-center text-lg outline-none"
                      style={{ borderColor: tier.ring }}
                      aria-label={t("iconLabel")}
                    />
                    <input
                      value={b.name}
                      onChange={(e) => patchLocal(b.id, { name: e.target.value })}
                      className="min-w-[8rem] flex-1 rounded-lg border border-[--hair] bg-base px-2 py-1.5 text-sm font-semibold text-ink outline-none focus:border-brand"
                    />
                    <select
                      value={b.tier}
                      onChange={(e) => patchLocal(b.id, { tier: e.target.value as BadgeTier })}
                      className="rounded-lg border border-[--hair] bg-base px-2 py-1.5 text-xs text-ink outline-none"
                    >
                      {TIERS.map((tr) => (
                        <option key={tr} value={tr}>
                          {tr}
                        </option>
                      ))}
                    </select>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={0}
                        value={b.xp}
                        onChange={(e) => patchLocal(b.id, { xp: Number(e.target.value) || 0 })}
                        className="w-20 rounded-lg border border-[--hair] bg-base px-2 py-1.5 text-xs text-ink outline-none"
                        aria-label={t("xpLabel")}
                      />
                      <span className="text-xs text-muted">XP</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => patchLocal(b.id, { isActive: !b.isActive })}
                      className={`rounded-full px-3 py-1.5 text-xs font-bold uppercase ${
                        b.isActive ? "bg-brand text-white" : "border border-[--hair] text-muted"
                      }`}
                    >
                      {b.isActive ? t("active") : t("inactive")}
                    </button>
                    <button
                      type="button"
                      onClick={() => save(b)}
                      disabled={!isDirty || pending}
                      className="rounded-lg border border-[--hair] px-3 py-1.5 text-xs font-bold text-ink hover:border-brand disabled:opacity-40"
                    >
                      {t("save")}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
