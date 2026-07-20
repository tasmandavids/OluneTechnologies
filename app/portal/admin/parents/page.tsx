// ============================================================================
//  /portal/admin/parents — Parent roster with linked children.
// ============================================================================

import { requirePortalSession } from "@/lib/portal/session";
import { listStudioMemberProfileIds } from "@/lib/portal/studio-members";
import ParentsManager from "@/components/admin/parents/ParentsManager";
import type { ParentRow, StudentOption } from "@/lib/parents/types";

export type { ParentRow } from "@/lib/parents/types";

export default async function ParentsPage() {
  const { supabase, studioId, role } = await requirePortalSession();
  if (!studioId) return <ParentsManager parents={[]} students={[]} />;

  const canMassEmail = role === "admin";

  const [parentIds, studentIds] = await Promise.all([
    listStudioMemberProfileIds(supabase, studioId, "parent"),
    listStudioMemberProfileIds(supabase, studioId, "student"),
  ]);

  const [parentsRes, guardianshipsRes, studentsRes, classesRes] = await Promise.all([
    parentIds.length === 0
      ? Promise.resolve({ data: [] as never[] })
      : supabase
          .from("profiles")
          .select("id, full_name, email, phone, created_at")
          .in("id", parentIds)
          .eq("role", "parent")
          .order("full_name"),

    supabase
      .from("guardianships")
      .select(`
        guardian_id, student_id, is_primary, relationship,
        profiles!guardian_id ( id, full_name, email, phone )
      `)
      .eq("studio_id", studioId),

    studentIds.length === 0
      ? Promise.resolve({ data: [] as never[] })
      : supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", studentIds)
          .eq("role", "student")
          .order("full_name"),

    canMassEmail
      ? supabase
          .from("classes")
          .select("id, name")
          .eq("studio_id", studioId)
          .order("name")
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);

  const allGuardianships = guardianshipsRes.data ?? [];
  const studentNames = new Map(
    (studentsRes.data ?? []).map((s) => [s.id, s.full_name as string | null]),
  );

  const parents: ParentRow[] = (parentsRes.data ?? []).map((p) => {
    const mine = allGuardianships.filter((g) => g.guardian_id === p.id);
    const myStudentIds = new Set(mine.map((g) => g.student_id as string));

    const children = mine.map((g) => ({
      id: g.student_id as string,
      name: studentNames.get(g.student_id as string) ?? null,
    }));

    const coParentMap = new Map<string, { id: string; name: string | null; email: string | null; phone: string | null }>();
    for (const g of allGuardianships) {
      if (g.guardian_id === p.id) continue;
      if (!myStudentIds.has(g.student_id as string)) continue;
      const prof = g.profiles as unknown as {
        id: string;
        full_name: string | null;
        email: string | null;
        phone: string | null;
      } | null;
      if (!prof) continue;
      coParentMap.set(prof.id, {
        id: prof.id,
        name: prof.full_name,
        email: prof.email,
        phone: prof.phone,
      });
    }

    return {
      id: p.id,
      name: p.full_name,
      email: p.email,
      phone: p.phone,
      createdAt: p.created_at,
      children,
      isPrimaryContact: mine.some((g) => g.is_primary),
      coParents: [...coParentMap.values()],
    };
  });

  const students: StudentOption[] = (studentsRes.data ?? []).map((s) => ({
    id: s.id,
    name: s.full_name,
  }));

  const classes = (classesRes.data ?? []).map((c) => ({
    id: c.id as string,
    name: (c.name as string) || "Untitled class",
  }));

  return (
    <ParentsManager
      parents={parents}
      students={students}
      classes={classes}
      canMassEmail={canMassEmail}
    />
  );
}
