"use client";

// ============================================================================
//  BadgeAwarder — teacher/admin control to award or remove badges for a
//  student (or parent, for Family badges). RLS is the real gate; this is the UI.
// ============================================================================

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { awardBadge, revokeBadge } from "@/app/actions/badges";
import type { BadgeDefinition } from "@/lib/portal/badges-data";
import { TIER_STYLES } from "@/lib/portal/badge-style";

export default function BadgeAwarder({
  recipientId,
  catalogue,
  earnedIds,
}: {
  recipientId: string;
  catalogue: BadgeDefinition[];
  earnedIds: string[];
}) {
  const t = useTranslations("portal.progress.badges.award");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const earned = useMemo(() => new Set(earnedIds), [earnedIds]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return catalogue;
    return catalogue.filter(
      (b) =>
        b.name.toLowerCase().includes(q) ||
        (b.description ?? "").toLowerCase().includes(q) ||
        b.category.includes(q),
    );
  }, [catalogue, query]);

  function runAward(badgeId: string) {
    setError(null);
    setBusyId(badgeId);
    startTransition(async () => {
      const res = await awardBadge({ recipientId, badgeId, note: note.trim() });
      setBusyId(null);
      if (!res.ok) setError(res.error);
      else {
        setNote("");
        router.refresh();
      }
    });
  }

  function runRevoke(badgeId: string) {
    setError(null);
    setBusyId(badgeId);
    startTransition(async () => {
      const res = await revokeBadge({ recipientId, badgeId });
      setBusyId(null);
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <section className="box rounded-2xl p-5">
      <h2 className="mb-1 text-xs font-semibold uppercase tracking-widest text-muted">
        {t("title")}
      </h2>
      <p className="mb-4 text-sm text-muted">{t("subtitle")}</p>

      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("search")}
          className="flex-1 rounded-xl border border-[--hair] bg-base px-3 py-2 text-sm text-ink outline-none focus:border-[--brand]"
        />
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t("note")}
          maxLength={500}
          className="flex-1 rounded-xl border border-[--hair] bg-base px-3 py-2 text-sm text-ink outline-none focus:border-[--brand]"
        />
      </div>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      <ul className="max-h-96 space-y-2 overflow-y-auto pr-1">
        {filtered.map((b) => {
          const isEarned = earned.has(b.id);
          const tier = TIER_STYLES[b.tier];
          const isBusy = pending && busyId === b.id;
          return (
            <li
              key={b.id}
              className="box flex items-center gap-3 rounded-xl px-3 py-2"
            >
              <span
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-lg"
                style={{ border: `2px solid ${tier.ring}`, background: "var(--surface)" }}
                aria-hidden
              >
                {b.icon ?? "🏅"}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">
                  {b.name}
                  {b.isSecret ? " 🤫" : ""}
                </p>
                <p className="truncate text-xs text-muted">
                  {b.description ?? ""} · {b.xp} XP
                </p>
              </div>
              {isEarned ? (
                <button
                  type="button"
                  onClick={() => runRevoke(b.id)}
                  disabled={isBusy}
                  className="box-pill shrink-0 px-3 py-1.5 text-xs font-bold text-muted transition-colors hover:text-red-600 disabled:opacity-50"
                >
                  {isBusy ? "…" : t("revoke")}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => runAward(b.id)}
                  disabled={isBusy}
                  className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                  style={{ background: "var(--brand)" }}
                >
                  {isBusy ? "…" : t("awardCta")}
                </button>
              )}
            </li>
          );
        })}
        {filtered.length === 0 && (
          <li className="px-1 py-4 text-center text-sm text-muted">{t("noResults")}</li>
        )}
      </ul>
    </section>
  );
}
