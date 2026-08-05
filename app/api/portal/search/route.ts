// ============================================================================
//  GET /api/portal/search?q= — global ⌘K search over studio data: students,
//  staff, parents, classes, leads. Admin-only (same audience as the palette).
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { getPortalSession } from "@/lib/portal/session";
import { listStudioMemberProfileIds } from "@/lib/portal/studio-members";

export type PortalSearchResult = {
  type: "student" | "staff" | "parent" | "class" | "lead";
  id: string;
  label: string;
  sublabel: string | null;
  href: string;
};

/** Strip anything that could break a PostgREST `or=` filter or act as an
 *  ilike wildcard, keeping only characters real names/emails/phones use. */
function sanitizeTerm(raw: string): string {
  return raw.replace(/[^\p{L}\p{N}\s@.+-]/gu, "").trim();
}

export async function GET(req: NextRequest) {
  const session = await getPortalSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin" || !session.studioId) {
    return NextResponse.json({ results: [] satisfies PortalSearchResult[] });
  }

  const { supabase, studioId } = session;
  const term = sanitizeTerm(req.nextUrl.searchParams.get("q") ?? "");
  if (term.length < 2) return NextResponse.json({ results: [] satisfies PortalSearchResult[] });

  const pattern = `%${term}%`;

  const [studentIds, parentIds] = await Promise.all([
    listStudioMemberProfileIds(supabase, studioId, "student"),
    listStudioMemberProfileIds(supabase, studioId, "parent"),
  ]);

  const [studentsRes, staffRes, parentsRes, classesRes, leadsRes] = await Promise.all([
    studentIds.length === 0
      ? Promise.resolve({ data: [] as { id: string; full_name: string | null; email: string | null; phone: string | null }[] })
      : supabase
          .from("profiles")
          .select("id, full_name, email, phone")
          .in("id", studentIds)
          .eq("role", "student")
          .or(`full_name.ilike.${pattern},email.ilike.${pattern},phone.ilike.${pattern}`)
          .order("full_name")
          .limit(5),

    supabase
      .from("profiles")
      .select("id, full_name, email, phone")
      .eq("studio_id", studioId)
      .in("role", ["teacher", "office"])
      .or(`full_name.ilike.${pattern},email.ilike.${pattern},phone.ilike.${pattern}`)
      .order("full_name")
      .limit(5),

    parentIds.length === 0
      ? Promise.resolve({ data: [] as { id: string; full_name: string | null; email: string | null; phone: string | null }[] })
      : supabase
          .from("profiles")
          .select("id, full_name, email, phone")
          .in("id", parentIds)
          .eq("role", "parent")
          .or(`full_name.ilike.${pattern},email.ilike.${pattern},phone.ilike.${pattern}`)
          .order("full_name")
          .limit(5),

    supabase
      .from("classes")
      .select("id, name, discipline, level")
      .eq("studio_id", studioId)
      .or(`name.ilike.${pattern},discipline.ilike.${pattern},level.ilike.${pattern}`)
      .order("name")
      .limit(5),

    supabase
      .from("leads")
      .select("id, first_name, last_name, email, phone")
      .eq("studio_id", studioId)
      .or(`first_name.ilike.${pattern},last_name.ilike.${pattern},email.ilike.${pattern},phone.ilike.${pattern}`)
      .order("updated_at", { ascending: false })
      .limit(5),
  ]);

  const results: PortalSearchResult[] = [
    ...(studentsRes.data ?? []).map((r) => ({
      type: "student" as const,
      id: r.id,
      label: r.full_name ?? r.email ?? "Unnamed student",
      sublabel: r.email ?? r.phone ?? null,
      href: `/portal/admin/students/${r.id}`,
    })),
    ...(staffRes.data ?? []).map((r) => ({
      type: "staff" as const,
      id: r.id,
      label: r.full_name ?? r.email ?? "Unnamed staff",
      sublabel: r.email ?? r.phone ?? null,
      href: `/portal/admin/staff/${r.id}`,
    })),
    ...(parentsRes.data ?? []).map((r) => ({
      type: "parent" as const,
      id: r.id,
      label: r.full_name ?? r.email ?? "Unnamed parent",
      sublabel: r.email ?? r.phone ?? null,
      href: `/portal/admin/parents/${r.id}`,
    })),
    ...(classesRes.data ?? []).map((r) => ({
      type: "class" as const,
      id: r.id,
      label: r.name,
      sublabel: r.discipline ?? r.level ?? null,
      href: `/portal/admin/classes`,
    })),
    ...(leadsRes.data ?? []).map((r) => ({
      type: "lead" as const,
      id: r.id,
      label: [r.first_name, r.last_name].filter(Boolean).join(" ") || r.email || "Unnamed lead",
      sublabel: r.email ?? r.phone ?? null,
      href: `/portal/admin/leads`,
    })),
  ];

  return NextResponse.json({ results });
}
