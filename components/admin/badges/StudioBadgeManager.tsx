"use client";

// ============================================================================
//  StudioBadgeManager — admin catalogue control.
//  Hide/show global badges for this studio and create/delete custom badges.
// ============================================================================

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  setStudioBadgeHidden,
  createStudioBadge,
  deleteStudioBadge,
} from "@/app/actions/badges";
import { CATEGORY_ORDER, TIER_STYLES } from "@/lib/portal/badge-style";
import type { BadgeTier, BadgeRecipientType } from "@/lib/portal/badges-data";

export type ManagedBadge = {
  id: string;
  category: string;
  name: string;
  description: string | null;
  icon: string | null;
  tier: BadgeTier;
  xp: number;
  isSecret: boolean;
  recipientType: BadgeRecipientType;
  isCustom: boolean;
  hidden: boolean;
};

const TIERS: BadgeTier[] = ["bronze", "silver", "gold", "diamond"];

export default function StudioBadgeManager({ badges }: { badges: ManagedBadge[] }) {
  const t = useTranslations("admin.badges");
  const tCat = useTranslations("portal.progress.badges.categories");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const grouped = useMemo(() => {
    const map = new Map<string, ManagedBadge[]>();
    for (const b of badges) {
      const list = map.get(b.category) ?? [];
      list.push(b);
      map.set(b.category, list);
    }
    return [...CATEGORY_ORDER].filter((c) => map.has(c)).map((c) => [c, map.get(c)!] as const);
  }, [badges]);

  const visibleCount = badges.filter((b) => !b.hidden).length;

  function toggleHidden(b: ManagedBadge) {
    setError(null);
    startTransition(async () => {
      const res = await setStudioBadgeHidden({ badgeId: b.id, hidden: !b.hidden });
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  }

  function removeCustom(b: ManagedBadge) {
    setError(null);
    startTransition(async () => {
      const res = await deleteStudioBadge(b.id);
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-ink">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted">
            {t("subtitle", { visible: visibleCount, total: badges.length })}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="rounded-xl px-4 py-2 text-sm font-bold text-white"
          style={{ background: "var(--brand)" }}
        >
          {showForm ? t("cancel") : t("addCustom")}
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {showForm && (
        <CustomBadgeForm
          pending={pending}
          onDone={() => {
            setShowForm(false);
            router.refresh();
          }}
          onError={setError}
        />
      )}

      <div className="space-y-6">
        {grouped.map(([cat, list]) => (
          <section key={cat} className="rounded-2xl border border-[--hair] bg-surface p-5">
            <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-ink/70">
              {tCat(cat)}
            </h2>
            <ul className="divide-y divide-[--hair]">
              {list.map((b) => {
                const tier = TIER_STYLES[b.tier];
                return (
                  <li key={b.id} className="flex items-center gap-3 py-2">
                    <span
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-base"
                      style={{
                        border: `2px solid ${tier.ring}`,
                        background: "var(--base)",
                        opacity: b.hidden ? 0.4 : 1,
                      }}
                      aria-hidden
                    >
                      {b.icon ?? "🏅"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className={`truncate text-sm font-semibold ${b.hidden ? "text-muted line-through" : "text-ink"}`}>
                        {b.name}
                        {b.isCustom ? ` · ${t("customTag")}` : ""}
                        {b.recipientType === "parent" ? " 👪" : ""}
                      </p>
                      <p className="truncate text-xs text-muted">
                        {b.tier} · {b.xp} XP{b.description ? ` · ${b.description}` : ""}
                      </p>
                    </div>
                    {b.isCustom ? (
                      <button
                        type="button"
                        onClick={() => removeCustom(b)}
                        disabled={pending}
                        className="shrink-0 rounded-lg border border-[--hair] px-3 py-1.5 text-xs font-bold text-muted hover:border-red-400 hover:text-red-600 disabled:opacity-50"
                      >
                        {t("delete")}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => toggleHidden(b)}
                        disabled={pending}
                        className="shrink-0 rounded-lg border border-[--hair] px-3 py-1.5 text-xs font-bold text-ink hover:border-[--brand] disabled:opacity-50"
                      >
                        {b.hidden ? t("show") : t("hide")}
                      </button>
                    )}
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

function CustomBadgeForm({
  pending,
  onDone,
  onError,
}: {
  pending: boolean;
  onDone: () => void;
  onError: (msg: string | null) => void;
}) {
  const t = useTranslations("admin.badges");
  const tCat = useTranslations("portal.progress.badges.categories");
  const [, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("🏅");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<string>("character");
  const [tier, setTier] = useState<BadgeTier>("bronze");
  const [xp, setXp] = useState(100);
  const [recipientType, setRecipientType] = useState<BadgeRecipientType>("student");

  function submit() {
    onError(null);
    startTransition(async () => {
      const res = await createStudioBadge({
        name,
        icon,
        description,
        category,
        tier,
        xp,
        recipientType,
        isSecret: false,
      });
      if (!res.ok) onError(res.error);
      else onDone();
    });
  }

  return (
    <div className="space-y-3 rounded-2xl border border-[--hair] bg-surface p-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-6">
        <input
          value={icon}
          onChange={(e) => setIcon(e.target.value)}
          maxLength={4}
          className="rounded-xl border border-[--hair] bg-base px-3 py-2 text-center text-lg outline-none focus:border-[--brand] sm:col-span-1"
          aria-label={t("iconLabel")}
        />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("nameLabel")}
          className="rounded-xl border border-[--hair] bg-base px-3 py-2 text-sm text-ink outline-none focus:border-[--brand] sm:col-span-5"
        />
      </div>
      <input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder={t("descLabel")}
        className="w-full rounded-xl border border-[--hair] bg-base px-3 py-2 text-sm text-ink outline-none focus:border-[--brand]"
      />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded-xl border border-[--hair] bg-base px-3 py-2 text-sm text-ink outline-none focus:border-[--brand]"
        >
          {CATEGORY_ORDER.map((c) => (
            <option key={c} value={c}>
              {tCat(c)}
            </option>
          ))}
        </select>
        <select
          value={tier}
          onChange={(e) => setTier(e.target.value as BadgeTier)}
          className="rounded-xl border border-[--hair] bg-base px-3 py-2 text-sm text-ink outline-none focus:border-[--brand]"
        >
          {TIERS.map((tr) => (
            <option key={tr} value={tr}>
              {tr}
            </option>
          ))}
        </select>
        <input
          type="number"
          min={0}
          value={xp}
          onChange={(e) => setXp(Number(e.target.value) || 0)}
          className="rounded-xl border border-[--hair] bg-base px-3 py-2 text-sm text-ink outline-none focus:border-[--brand]"
          aria-label={t("xpLabel")}
        />
        <select
          value={recipientType}
          onChange={(e) => setRecipientType(e.target.value as BadgeRecipientType)}
          className="rounded-xl border border-[--hair] bg-base px-3 py-2 text-sm text-ink outline-none focus:border-[--brand]"
        >
          <option value="student">{t("forStudent")}</option>
          <option value="parent">{t("forParent")}</option>
        </select>
      </div>
      <button
        type="button"
        onClick={submit}
        disabled={pending || name.trim().length === 0}
        className="rounded-xl px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
        style={{ background: "var(--brand)" }}
      >
        {t("create")}
      </button>
    </div>
  );
}
