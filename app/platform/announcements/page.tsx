import { createAdminClient } from "@/lib/supabase/admin";
import { AnnouncementsManager } from "@/components/platform/AnnouncementsManager";
import type { PlatformAnnouncement } from "@/lib/platform/types";
import { requirePlatformPage } from "@/lib/platform/page-guard";

export default async function PlatformAnnouncementsPage() {
  if (!(await requirePlatformPage())) return null;
  const admin = createAdminClient();

  const { data: rows } = await admin
    .from("platform_announcements")
    .select("id, title, body, severity, target, published_at, expires_at, created_at")
    .order("created_at", { ascending: false });

  const announcements: PlatformAnnouncement[] = (rows ?? []).map((r) => ({
    id: r.id,
    title: r.title,
    body: r.body,
    severity: r.severity as PlatformAnnouncement["severity"],
    target: r.target as PlatformAnnouncement["target"],
    publishedAt: r.published_at,
    expiresAt: r.expires_at,
    createdAt: r.created_at,
  }));

  return <AnnouncementsManager announcements={announcements} />;
}
