import { createAdminClient } from "@/lib/supabase/admin";
import { OpsTasksBoard } from "@/components/platform/OpsTasksBoard";
import type { PlatformTask } from "@/lib/platform/types";
import { requirePlatformPage } from "@/lib/platform/page-guard";

export default async function PlatformTasksPage() {
  if (!(await requirePlatformPage())) return null;
  const admin = createAdminClient();

  const [{ data: tasks }, { data: studios }] = await Promise.all([
    admin
      .from("platform_tasks")
      .select("id, task_type, title, description, studio_id, status, priority, due_at, assigned_to, metadata, created_at, completed_at, studios(name)")
      .order("created_at", { ascending: false }),
    admin.from("studios").select("id, name").order("name"),
  ]);

  const mapped: PlatformTask[] = (tasks ?? []).map((t) => {
    const studio = t.studios as unknown as { name: string } | null;
    return {
      id: t.id,
      taskType: t.task_type,
      title: t.title,
      description: t.description,
      studioId: t.studio_id,
      studioName: studio?.name ?? null,
      status: t.status as PlatformTask["status"],
      priority: t.priority as PlatformTask["priority"],
      dueAt: t.due_at,
      assignedTo: t.assigned_to,
      metadata: (t.metadata as Record<string, unknown>) ?? {},
      createdAt: t.created_at,
      completedAt: t.completed_at,
    };
  });

  return (
    <OpsTasksBoard
      tasks={mapped}
      studios={(studios ?? []).map((s) => ({ id: s.id, name: s.name }))}
    />
  );
}
