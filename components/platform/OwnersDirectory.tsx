"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { PlatformOwner } from "@/lib/platform/types";
import { saveOwnerNotes, createSupportThread } from "@/app/platform/owners/actions";
import { GlassPanel } from "@/components/portal/admin/glass/GlassPanel";
import { RippleButton } from "@/components/portal/admin/glass/RippleButton";
import { IconSearch } from "@/components/admin/dashboard/icons";
import { InitialTile, PlatformPageHeader, StatusPill, fieldClass, initialsOf, type PillTone } from "./glass/ui";

const STATUS_TONE: Record<string, PillTone> = { trial: "brand", active: "success", suspended: "danger" };

export function OwnersDirectory({ owners }: { owners: PlatformOwner[] }) {
  const t = useTranslations("platform.owners");
  const locale = useLocale();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<PlatformOwner | null>(null);
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState("");
  const [subject, setSubject] = useState("");
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<string | null>(null);

  const filtered = owners.filter((o) => {
    const q = search.toLowerCase();
    return (
      !q ||
      o.studioName.toLowerCase().includes(q) ||
      (o.fullName?.toLowerCase().includes(q) ?? false) ||
      (o.email?.toLowerCase().includes(q) ?? false)
    );
  });

  function openOwner(o: PlatformOwner) {
    setSelected(o);
    setNotes(o.notes ?? "");
    setSubject(t("subjectDefault", { studioName: o.studioName }));
    setMessage("");
  }

  function saveNotesHandler() {
    if (!selected) return;
    startTransition(async () => {
      const res = await saveOwnerNotes({
        studioId: selected.studioId,
        notes,
        tags: selected.tags,
      });
      setFeedback(res.ok ? t("notesSaved") : res.error);
      setTimeout(() => setFeedback(null), 2000);
    });
  }

  function sendMessage() {
    if (!selected || !subject.trim() || !message.trim()) return;
    startTransition(async () => {
      const res = await createSupportThread({
        studioId: selected.studioId,
        subject: subject.trim(),
        body: message.trim(),
        priority: "normal",
      });
      setFeedback(res.ok ? t("messageSent") : res.error);
      setMessage("");
      setTimeout(() => setFeedback(null), 3000);
    });
  }

  const labelCls = "mb-2 block text-[9.5px] font-semibold uppercase tracking-[0.16em] text-muted";

  return (
    <div className="py-2">
      <PlatformPageHeader title={t("title")} subtitle={t("subtitle")} />

      <div className="flex flex-col gap-3.5 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1 space-y-2.5">
          <label className="relative block">
            <span className="sr-only">{t("searchPlaceholder")}</span>
            <IconSearch className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("searchPlaceholder")}
              className={`${fieldClass} h-[46px] !rounded-2xl !pl-11`}
            />
          </label>

          <GlassPanel className="!p-2">
            <ul className="flex flex-col gap-0.5">
              {filtered.map((o) => {
                const on = selected?.profileId === o.profileId;
                return (
                  <li key={o.profileId}>
                    <button
                      type="button"
                      onClick={() => openOwner(o)}
                      aria-pressed={on}
                      className="flex w-full items-center gap-3 rounded-[14px] border p-3 text-left transition-colors hover:bg-(--t1)"
                      style={{ borderColor: on ? "var(--tb)" : "transparent", background: on ? "var(--t2)" : undefined }}
                    >
                      <InitialTile text={initialsOf(o.fullName ?? o.studioName)} size={38} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-ink">{o.fullName ?? t("unnamedOwner")}</span>
                        <span className="block truncate text-xs text-muted">
                          {o.studioName}
                          {o.email ? ` · ${o.email}` : ""}
                        </span>
                      </span>
                      <StatusPill tone={STATUS_TONE[o.studioStatus] ?? "neutral"}>
                        <span className="capitalize">{o.studioStatus}</span>
                      </StatusPill>
                    </button>
                  </li>
                );
              })}
            </ul>
          </GlassPanel>
        </div>

        {selected && (
          <aside className="w-full shrink-0 lg:sticky lg:top-24 lg:w-[400px]">
            <GlassPanel>
              <div className="flex items-center gap-3">
                <InitialTile text={initialsOf(selected.fullName ?? selected.studioName)} size={46} />
                <div className="min-w-0">
                  <h2 className="truncate font-display text-xl font-medium tracking-tight text-ink">
                    {selected.fullName ?? t("ownerFallback")}
                  </h2>
                  <p className="truncate text-sm text-muted">{selected.studioName}</p>
                </div>
              </div>

              <div className="mt-4 space-y-1 text-sm">
                {selected.email && (
                  <p>
                    <a href={`mailto:${selected.email}`} className="font-semibold text-ink hover:text-(--brand)">
                      {selected.email}
                    </a>
                  </p>
                )}
                {selected.phone && <p className="text-muted">{selected.phone}</p>}
                <p className="text-xs text-muted">
                  {t("adminSince", { date: new Date(selected.createdAt).toLocaleDateString(locale) })}
                </p>
              </div>

              <div className="my-[18px] h-px bg-(--hair)" />

              <label className="block">
                <span className={labelCls}>{t("privateNotes")}</span>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={4}
                  className={fieldClass}
                  placeholder={t("notesPlaceholder")}
                />
              </label>
              <RippleButton className="mt-2.5" onClick={saveNotesHandler} disabled={pending}>
                {t("saveNotes")}
              </RippleButton>

              <div className="my-[18px] h-px bg-(--hair)" />

              <span className={labelCls}>{t("messageOwner")}</span>
              <input
                aria-label={t("messageOwner")}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className={`${fieldClass} mb-2`}
              />
              <textarea
                aria-label={t("messagePlaceholder")}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
                className={fieldClass}
                placeholder={t("messagePlaceholder")}
              />
              <RippleButton variant="solid" className="mt-2.5" onClick={sendMessage} disabled={pending}>
                {t("sendViaSupport")}
              </RippleButton>

              {feedback && (
                <p className="mt-3 text-xs text-muted" role="status">
                  {feedback}
                </p>
              )}
            </GlassPanel>
          </aside>
        )}
      </div>
    </div>
  );
}
