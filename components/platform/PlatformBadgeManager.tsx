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
import { GlassPanel } from "@/components/portal/admin/glass/GlassPanel";
import { RippleButton } from "@/components/portal/admin/glass/RippleButton";
import { GlassSwitch, PlatformPageHeader, SectionLabel, fieldClass } from "./glass/ui";

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
    <div className="py-2">
      <PlatformPageHeader title={t("title")} subtitle={t("subtitle", { active: activeCount, total: items.length })} />

      {error && (
        <p className="mb-3.5 text-sm text-[--error]" role="alert">
          {error}
        </p>
      )}

      <div className="space-y-6">
        {grouped.map(([cat, list]) => (
          <section key={cat}>
            <SectionLabel className="mb-3">{tCat(cat)}</SectionLabel>
            <ul className="grid gap-2.5 md:grid-cols-2">
              {list.map((b) => {
                const tier = TIER_STYLES[b.tier];
                const isDirty = dirty.has(b.id);
                return (
                  <li key={b.id}>
                    <GlassPanel className={b.isActive ? "" : "opacity-70"}>
                      <div className="flex items-center gap-3">
                        <input
                          value={b.icon ?? ""}
                          onChange={(e) => patchLocal(b.id, { icon: e.target.value })}
                          maxLength={4}
                          className="h-12 w-12 shrink-0 rounded-2xl border-2 bg-[--glass2] text-center text-xl outline-none"
                          style={{ borderColor: tier.ring }}
                          aria-label={t("iconLabel")}
                        />
                        <input
                          value={b.name}
                          onChange={(e) => patchLocal(b.id, { name: e.target.value })}
                          aria-label={b.name}
                          className={`${fieldClass} font-semibold`}
                        />
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <select
                          value={b.tier}
                          onChange={(e) => patchLocal(b.id, { tier: e.target.value as BadgeTier })}
                          aria-label={b.tier}
                          className={`${fieldClass} !w-auto !py-1.5 text-xs capitalize`}
                        >
                          {TIERS.map((tr) => (
                            <option key={tr} value={tr}>
                              {tr}
                            </option>
                          ))}
                        </select>
                        <span className="flex items-center gap-1.5">
                          <input
                            type="number"
                            min={0}
                            value={b.xp}
                            onChange={(e) => patchLocal(b.id, { xp: Number(e.target.value) || 0 })}
                            className={`${fieldClass} !w-20 !py-1.5 text-xs tabular-nums`}
                            aria-label={t("xpLabel")}
                          />
                          <span className="text-xs text-muted">XP</span>
                        </span>
                        <span className="flex-1" />
                        <GlassSwitch
                          checked={b.isActive}
                          onChange={(next) => patchLocal(b.id, { isActive: next })}
                          label={`${b.name}: ${b.isActive ? t("active") : t("inactive")}`}
                        />
                        <span className="w-12 text-xs text-muted">{b.isActive ? t("active") : t("inactive")}</span>
                        <RippleButton variant={isDirty ? "solid" : "glass"} onClick={() => save(b)} disabled={!isDirty || pending}>
                          {t("save")}
                        </RippleButton>
                      </div>
                    </GlassPanel>
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
