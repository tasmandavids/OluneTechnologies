import { createAdminClient } from "@/lib/supabase/admin";
import { StudiosManager } from "@/components/platform/StudiosManager";
import type { PlatformStudioSummary } from "@/lib/platform/types";

export default async function PlatformStudiosPage() {
  const admin = createAdminClient();

  const { data: studios } = await admin
    .from("studios")
    .select("id, name, slug, status, custom_domain, created_at, vertical")
    .order("created_at", { ascending: false });

  const studioIds = (studios ?? []).map((s) => s.id);

  const [adminsRes, studentsRes, stripeRes, xeroRes] = await Promise.all([
    admin
      .from("profiles")
      .select("studio_id, full_name, email")
      .eq("role", "admin")
      .in("studio_id", studioIds.length ? studioIds : ["00000000-0000-0000-0000-000000000000"]),
    admin
      .from("profiles")
      .select("studio_id")
      .eq("role", "student")
      .in("studio_id", studioIds.length ? studioIds : ["00000000-0000-0000-0000-000000000000"]),
    admin
      .from("stripe_connect_accounts")
      .select("studio_id, charges_enabled")
      .in("studio_id", studioIds.length ? studioIds : ["00000000-0000-0000-0000-000000000000"]),
    admin
      .from("xero_connections")
      .select("studio_id")
      .in("studio_id", studioIds.length ? studioIds : ["00000000-0000-0000-0000-000000000000"]),
  ]);

  const adminByStudio = new Map<string, { name: string | null; email: string | null }>();
  for (const p of adminsRes.data ?? []) {
    if (p.studio_id && !adminByStudio.has(p.studio_id)) {
      adminByStudio.set(p.studio_id, { name: p.full_name, email: p.email });
    }
  }

  const studentCounts = new Map<string, number>();
  for (const p of studentsRes.data ?? []) {
    if (p.studio_id) {
      studentCounts.set(p.studio_id, (studentCounts.get(p.studio_id) ?? 0) + 1);
    }
  }

  const stripeByStudio = new Map<string, boolean>();
  for (const row of stripeRes.data ?? []) {
    if (row.studio_id) stripeByStudio.set(row.studio_id, row.charges_enabled === true);
  }

  const xeroConnectedStudios = new Set((xeroRes.data ?? []).map((row) => row.studio_id));

  const summaries: PlatformStudioSummary[] = (studios ?? []).map((s) => {
    const owner = adminByStudio.get(s.id);
    return {
      id: s.id,
      name: s.name,
      slug: s.slug,
      status: s.status,
      customDomain: s.custom_domain,
      createdAt: s.created_at,
      ownerName: owner?.name ?? null,
      ownerEmail: owner?.email ?? null,
      studentCount: studentCounts.get(s.id) ?? 0,
      adminCount: 1,
      stripeConnected: stripeByStudio.get(s.id) ?? false,
      xeroConnected: xeroConnectedStudios.has(s.id),
      vertical: (s.vertical as string | null) ?? "dance",
    };
  });

  // Registry drives the picker, so a vertical can be dark-launched (or pulled)
  // without a deploy. Hidden ones are never offered.
  const { data: verticalRows } = await admin
    .from("verticals")
    .select("key, label, status")
    .neq("status", "hidden")
    .order("sort");

  return (
    <StudiosManager
      studios={summaries}
      verticals={(verticalRows ?? []).map((v) => ({
        key: v.key as string,
        label: v.label as string,
        status: v.status as string,
      }))}
    />
  );
}
