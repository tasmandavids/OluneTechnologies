"use client";

import { confirmDialog } from "@/lib/feedback";
import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { PlatformAnnouncement, AnnouncementSeverity, AnnouncementTarget } from "@/lib/platform/types";
import { createAnnouncement, publishAnnouncement, stopAnnouncement, deleteAnnouncement } from "@/app/platform/announcements/actions";
import { GlassPanel } from "@/components/portal/admin/glass/GlassPanel";
import { RippleButton } from "@/components/portal/admin/glass/RippleButton";
import { PlatformPageHeader, Segmented, StatusPill, fieldClass, type PillTone } from "./glass/ui";

const SEVERITY_TONE: Record<string, PillTone> = { info: "brand", warning: "warm", critical: "danger" };

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

  async function remove(id: string) {
    if (!(await confirmDialog({ title: t("confirmDelete"), destructive: true }))) return;
    startTransition(async () => {
      const res = await deleteAnnouncement(id);
      if (res.ok) {
        setItems((prev) => prev.filter((a) => a.id !== id));
      }
    });
  }

  return (
    <div className="py-2">
      <PlatformPageHeader title={t("title")} subtitle={t("subtitle")} />

      <div className="flex flex-col gap-3.5 lg:flex-row lg:items-start">
        <div className="w-full shrink-0 lg:w-[420px]">
          <GlassPanel>
            <h2 className="mb-3.5 font-display text-lg font-medium tracking-tight text-ink">{t("draft")}</h2>
            <input
              aria-label={t("titlePlaceholder")}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("titlePlaceholder")}
              className={`${fieldClass} mb-2.5`}
            />
            <textarea
              aria-label={t("bodyPlaceholder")}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              placeholder={t("bodyPlaceholder")}
              className={`${fieldClass} mb-3`}
            />
            <div className="mb-3">
              <Segmented
                label={t("severity.info")}
                value={severity}
                onChange={setSeverity}
                options={(["info", "warning", "critical"] as const).map((s) => ({ value: s, label: t(`severity.${s}`) }))}
              />
            </div>
            <select
              aria-label={t("target.all")}
              value={target}
              onChange={(e) => setTarget(e.target.value as AnnouncementTarget)}
              className={`${fieldClass} mb-4`}
            >
              {(["all", "trial", "active", "suspended"] as const).map((tg) => (
                <option key={tg} value={tg}>
                  {t(`target.${tg}`)}
                </option>
              ))}
            </select>
            <RippleButton variant="solid" size="lg" onClick={create} disabled={pending}>
              {t("draft")}
            </RippleButton>
          </GlassPanel>
        </div>

        <ul className="flex min-w-0 flex-1 flex-col gap-2.5">
          {items.map((a) => (
            <li key={a.id}>
              <GlassPanel>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusPill tone={SEVERITY_TONE[a.severity] ?? "neutral"}>{t(`severity.${a.severity}`)}</StatusPill>
                      <span className="text-xs text-muted">
                        {t(`target.${a.target}`)} ·{" "}
                        {a.publishedAt
                          ? t("publishedAt", { date: new Date(a.publishedAt).toLocaleString(locale) })
                          : t("draftStatus")}
                      </span>
                    </div>
                    <p className="mt-2 font-semibold text-ink">{a.title}</p>
                    <p className="mt-1 whitespace-pre-wrap text-[13.5px] leading-relaxed text-muted">{a.body}</p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {!a.publishedAt && (
                      <RippleButton variant="solid" onClick={() => publish(a.id)} disabled={pending}>
                        {t("publishNow")}
                      </RippleButton>
                    )}
                    {a.publishedAt && (
                      <RippleButton onClick={() => stop(a.id)} disabled={pending}>
                        {t("stop")}
                      </RippleButton>
                    )}
                    <RippleButton onClick={() => remove(a.id)} disabled={pending} style={{ color: "var(--error, #dc2626)" }}>
                      {t("delete")}
                    </RippleButton>
                  </div>
                </div>
              </GlassPanel>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
