"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { PlatformOwner } from "@/lib/platform/types";
import { saveOwnerNotes, createSupportThread } from "@/app/platform/owners/actions";

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

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6 lg:flex-row">
      <div className="flex-1 space-y-4">
        <header>
          <h1 className="text-2xl font-black text-ink">{t("title")}</h1>
          <p className="text-sm text-muted">{t("subtitle")}</p>
        </header>

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("searchPlaceholder")}
          className="w-full rounded-xl border border-[--hair] bg-surface px-4 py-2.5 text-sm"
        />

        <ul className="space-y-2">
          {filtered.map((o) => (
            <li key={o.profileId}>
              <button
                onClick={() => openOwner(o)}
                className={`w-full rounded-xl border p-4 text-left transition-colors ${
                  selected?.profileId === o.profileId
                    ? "border-brand bg-surface"
                    : "border-[--hair] bg-surface hover:border-brand/40"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-ink">{o.fullName ?? t("unnamedOwner")}</p>
                    <p className="text-xs text-muted">{o.studioName}</p>
                    {o.email && <p className="mt-1 text-xs text-muted">{o.email}</p>}
                  </div>
                  <span className="shrink-0 rounded-full bg-base px-2 py-0.5 text-[0.65rem] uppercase">
                    {o.studioStatus}
                  </span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {selected && (
        <aside className="box w-full shrink-0 space-y-4 rounded-2xl p-5 lg:w-96">
          <div>
            <h2 className="text-lg font-bold text-ink">{selected.fullName ?? t("ownerFallback")}</h2>
            <p className="text-sm text-muted">{selected.studioName}</p>
          </div>

          <div className="space-y-1 text-sm">
            {selected.email && (
              <p>
                <a href={`mailto:${selected.email}`} className="text-brand hover:underline">
                  {selected.email}
                </a>
              </p>
            )}
            {selected.phone && <p className="text-muted">{selected.phone}</p>}
            <p className="text-xs text-muted">
              {t("adminSince", {
                date: new Date(selected.createdAt).toLocaleDateString(locale),
              })}
            </p>
          </div>

          <div>
            <label className="mb-1 block text-xs uppercase tracking-widest text-muted">
              {t("privateNotes")}
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              className="w-full rounded-xl border border-[--hair] bg-base px-3 py-2 text-sm"
              placeholder={t("notesPlaceholder")}
            />
            <button
              onClick={saveNotesHandler}
              disabled={pending}
              className="mt-2 rounded-full bg-brand px-4 py-1.5 text-xs font-bold uppercase text-white"
            >
              {t("saveNotes")}
            </button>
          </div>

          <div className="border-t border-[--hair] pt-4">
            <label className="mb-1 block text-xs uppercase tracking-widest text-muted">
              {t("messageOwner")}
            </label>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="mb-2 w-full rounded-xl border border-[--hair] bg-base px-3 py-2 text-sm"
            />
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              className="w-full rounded-xl border border-[--hair] bg-base px-3 py-2 text-sm"
              placeholder={t("messagePlaceholder")}
            />
            <button
              onClick={sendMessage}
              disabled={pending}
              className="mt-2 rounded-full border border-[--hair] px-4 py-1.5 text-xs font-bold uppercase hover:border-brand"
            >
              {t("sendViaSupport")}
            </button>
          </div>

          {feedback && <p className="text-xs text-muted">{feedback}</p>}
        </aside>
      )}
    </div>
  );
}
