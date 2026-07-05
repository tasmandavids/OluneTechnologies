"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { PlatformAnnouncement, AnnouncementSeverity, AnnouncementTarget } from "@/lib/platform/types";
import { createAnnouncement, publishAnnouncement, stopAnnouncement, deleteAnnouncement } from "@/app/platform/announcements/actions";

export function AnnouncementsManager({
  announcements,
}: {
  announcements: PlatformAnnouncement[];
}) {
  const t = useTranslations("platform.announcements");
  const locale = useLocale();
  const [items, setItems] = useState(announcements);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [severity, setSeverity] = useState<AnnouncementSeverity>("info");
  const [target, setTarget] = useState<AnnouncementTarget>("all");
  const [pending, startTransition] = useTransition();

  function create() {
    if (!title.trim() || !body.trim()) return;
    startTransition(async () => {
      const res = await createAnnouncement({ title, body, severity, target });
      if (res.ok && res.announcement) {
        setItems((prev) => [res.announcement!, ...prev]);
        setTitle("");
        setBody("");
      }
    });
  }

  function publish(id: string) {
    startTransition(async () => {
      const res = await publishAnnouncement(id);
      if (res.ok) {
        setItems((prev) =>
          prev.map((a) =>
            a.id === id ? { ...a, publishedAt: new Date().toISOString() } : a,
          ),
        );
      }
    });
  }

  function stop(id: string) {
    startTransition(async () => {
      const res = await stopAnnouncement(id);
      if (res.ok) {
        setItems((prev) =>
          prev.map((a) => (a.id === id ? { ...a, publishedAt: null } : a)),
        );
      }
    });
  }

  function remove(id: string) {
    if (!window.confirm(t("confirmDelete"))) return;
    startTransition(async () => {
      const res = await deleteAnnouncement(id);
      if (res.ok) {
        setItems((prev) => prev.filter((a) => a.id !== id));
      }
    });
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-black text-ink">{t("title")}</h1>
        <p className="text-sm text-muted">{t("subtitle")}</p>
      </header>

      <div className="rounded-2xl border border-[--hair] bg-surface p-5 space-y-3">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("titlePlaceholder")}
          className="w-full rounded-xl border border-[--hair] bg-base px-3 py-2 text-sm"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          placeholder={t("bodyPlaceholder")}
          className="w-full rounded-xl border border-[--hair] bg-base px-3 py-2 text-sm"
        />
        <div className="flex flex-wrap gap-3">
          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value as AnnouncementSeverity)}
            className="rounded-xl border border-[--hair] bg-base px-3 py-2 text-sm"
          >
            {(["info", "warning", "critical"] as const).map((s) => (
              <option key={s} value={s}>
                {t(`severity.${s}`)}
              </option>
            ))}
          </select>
          <select
            value={target}
            onChange={(e) => setTarget(e.target.value as AnnouncementTarget)}
            className="rounded-xl border border-[--hair] bg-base px-3 py-2 text-sm"
          >
            {(["all", "trial", "active", "suspended"] as const).map((tg) => (
              <option key={tg} value={tg}>
                {t(`target.${tg}`)}
              </option>
            ))}
          </select>
          <button
            onClick={create}
            disabled={pending}
            className="rounded-full bg-brand px-5 py-2 text-xs font-bold uppercase text-white"
          >
            {t("draft")}
          </button>
        </div>
      </div>

      <ul className="space-y-3">
        {items.map((a) => (
          <li key={a.id} className="rounded-2xl border border-[--hair] bg-surface p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-bold text-ink">{a.title}</p>
                <p className="mt-1 text-sm text-muted whitespace-pre-wrap">{a.body}</p>
                <p className="mt-2 text-xs text-muted">
                  {t(`severity.${a.severity}`)} · {t(`target.${a.target}`)}
                  {a.publishedAt
                    ? ` · ${t("publishedAt", {
                        date: new Date(a.publishedAt).toLocaleString(locale),
                      })}`
                    : ` · ${t("draftStatus")}`}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                {!a.publishedAt && (
                  <button
                    onClick={() => publish(a.id)}
                    disabled={pending}
                    className="rounded-full border border-[--hair] px-4 py-1.5 text-xs font-bold uppercase hover:border-brand"
                  >
                    {t("publishNow")}
                  </button>
                )}
                {a.publishedAt && (
                  <button
                    onClick={() => stop(a.id)}
                    disabled={pending}
                    className="rounded-full border border-[--hair] px-4 py-1.5 text-xs font-bold uppercase text-amber-600 hover:border-amber-500"
                  >
                    {t("stop")}
                  </button>
                )}
                <button
                  onClick={() => remove(a.id)}
                  disabled={pending}
                  className="rounded-full border border-[--hair] px-4 py-1.5 text-xs font-bold uppercase text-red-600 hover:border-red-500"
                >
                  {t("delete")}
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
