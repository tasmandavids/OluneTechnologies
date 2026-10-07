import { createAdminClient } from "@/lib/supabase/admin";
import { getTranslations } from "@/lib/i18n/server";
import { PlatformDashboard } from "@/components/platform/PlatformDashboard";
import { requirePlatformPage } from "@/lib/platform/page-guard";

export default async function PlatformHomePage() {
  if (!(await requirePlatformPage())) return null;
  const admin = createAdminClient();
  const t = await getTranslations("platform.dashboard");

  const [studiosRes, tasksRes, threadsRes, studentsRes, urgentTasksRes] = await Promise.all([
    admin.from("studios").select("id, name, slug, status, created_at").order("created_at", { ascending: false }),
    admin
      .from("platform_tasks")
      .select("id, title, priority, status, due_at, studios(name)")
      .neq("status", "done")
      .order("priority")
      .limit(9),
    admin
      .from("platform_support_threads")
      .select("id, subject, priority, status, updated_at, studios(name)", { count: "exact" })
      .neq("status", "resolved")
      .order("updated_at", { ascending: false })
      .limit(5),
    admin.from("profiles").select("id", { count: "exact", head: true }).eq("role", "student"),
    admin
      .from("platform_tasks")
      .select("id", { count: "exact", head: true })
      .neq("status", "done")
      .in("priority", ["urgent", "high"]),
  ]);

  const studios = studiosRes.data ?? [];
  const trialCount = studios.filter((s) => s.status === "trial").length;
  const activeCount = studios.filter((s) => s.status === "active").length;
  const suspendedCount = studios.filter((s) => s.status === "suspended").length;

  const stats = [
    {
      id: "studios",
      label: t("stats.totalStudios"),
      value: studios.length,
      hint: t("stats.activeHint", { count: activeCount }),
    },
    { id: "trial", label: t("stats.onTrial"), value: trialCount },
    { id: "suspended", label: t("stats.suspended"), value: suspendedCount },
    {
      id: "students",
      label: t("stats.studentsPlatformWide"),
      value: studentsRes.count ?? 0,
    },
  ];

  const recentStudios = studios.slice(0, 5).map((s) => ({
    id: s.id,
    name: s.name,
    slug: s.slug,
    status: s.status,
    createdAt: s.created_at,
  }));

  const openThreads = (threadsRes.data ?? []).map((thread) => {
    const studio = thread.studios as unknown as { name: string } | null;
    return {
      id: thread.id,
      subject: thread.subject,
      studioName: studio?.name ?? t("unknownStudio"),
      priority: thread.priority,
      status: thread.status,
      updatedAt: thread.updated_at,
    };
  });

  const openTasks = (tasksRes.data ?? []).map((task) => {
    const studio = task.studios as unknown as { name: string } | null;
    return {
      id: task.id,
      title: task.title,
      priority: task.priority,
      status: task.status,
      dueAt: task.due_at,
      studioName: studio?.name ?? null,
    };
  });

  const attention = {
    openThreads: threadsRes.count ?? openThreads.length,
    urgentTasks: urgentTasksRes.count ?? 0,
    trials: trialCount,
    suspended: suspendedCount,
  };

  return (
    <PlatformDashboard
      stats={stats}
      recentStudios={recentStudios}
      openTasks={openTasks}
      openThreads={openThreads}
      attention={attention}
    />
  );
}
