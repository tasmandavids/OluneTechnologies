"use client";

import type { PlatformAnnouncement } from "@/lib/platform/types";

const SEVERITY_STYLE: Record<string, string> = {
  info: "border-blue-500/30 bg-blue-500/5",
  warning: "border-amber-500/30 bg-amber-500/5",
  critical: "border-red-500/30 bg-red-500/5",
};

export function PlatformAnnouncementsBanner({
  announcements,
}: {
  announcements: Pick<PlatformAnnouncement, "id" | "title" | "body" | "severity">[];
}) {
  if (announcements.length === 0) return null;

  return (
    <div className="space-y-2 border-b border-(--hair) bg-surface px-5 py-3">
      {announcements.map((a) => (
        <div
          key={a.id}
          className={`rounded-xl border px-4 py-3 text-sm ${SEVERITY_STYLE[a.severity] ?? SEVERITY_STYLE.info}`}
        >
          <p className="font-semibold text-ink">{a.title}</p>
          <p className="mt-0.5 text-muted whitespace-pre-wrap">{a.body}</p>
        </div>
      ))}
    </div>
  );
}
