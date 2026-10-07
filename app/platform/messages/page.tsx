import { createAdminClient } from "@/lib/supabase/admin";
import { getTranslations } from "@/lib/i18n/server";
import { SupportInbox } from "@/components/platform/SupportInbox";
import type { SupportThread } from "@/lib/platform/types";
import { requirePlatformPage } from "@/lib/platform/page-guard";

export default async function PlatformMessagesPage() {
  if (!(await requirePlatformPage())) return null;
  const admin = createAdminClient();
  const t = await getTranslations("platform.dashboard");

  const { data: rows } = await admin
    .from("platform_support_threads")
    .select("id, studio_id, subject, status, priority, created_at, updated_at, studios(name)")
    .order("updated_at", { ascending: false });

  const threadIds = (rows ?? []).map((r) => r.id);
  const { data: msgCounts } = threadIds.length
    ? await admin.from("platform_support_messages").select("thread_id, created_at").in("thread_id", threadIds)
    : { data: [] };

  const countMap = new Map<string, { count: number; lastAt: string | null }>();
  for (const m of msgCounts ?? []) {
    const cur = countMap.get(m.thread_id) ?? { count: 0, lastAt: null };
    cur.count += 1;
    if (!cur.lastAt || m.created_at > cur.lastAt) cur.lastAt = m.created_at;
    countMap.set(m.thread_id, cur);
  }

  const threads: SupportThread[] = (rows ?? []).map((r) => {
    const studio = r.studios as unknown as { name: string } | null;
    const meta = countMap.get(r.id);
    return {
      id: r.id,
      studioId: r.studio_id,
      studioName: studio?.name ?? t("unknownStudio"),
      subject: r.subject,
      status: r.status as SupportThread["status"],
      priority: r.priority as SupportThread["priority"],
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      messageCount: meta?.count ?? 0,
      lastMessageAt: meta?.lastAt ?? null,
    };
  });

  return <SupportInbox threads={threads} />;
}
