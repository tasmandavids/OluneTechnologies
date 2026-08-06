import type { SupabaseClient } from "@supabase/supabase-js";
import type { Role } from "@/lib/types";

export type ContactMatch = {
  email: string;
  type: Role | "lead";
  label: string;
  href: string | null;
  id: string;
};

const ROLE_LABEL: Record<Role, string> = {
  admin: "Admin",
  teacher: "Teacher",
  office: "Office",
  parent: "Parent",
  student: "Student",
};

function profileHref(role: Role, id: string): string | null {
  switch (role) {
    case "student":
      return `/portal/admin/students/${id}`;
    case "parent":
      return `/portal/admin/people?tab=families`;
    case "teacher":
    case "office":
      return `/portal/admin/staff/${id}`;
    case "admin":
      return null;
    default:
      return null;
  }
}

export async function identifyContactsByEmail(
  supabase: SupabaseClient,
  studioId: string,
  emails: string[],
): Promise<Record<string, ContactMatch>> {
  const normalized = [...new Set(emails.map((e) => e.toLowerCase().trim()).filter(Boolean))];
  if (!normalized.length) return {};

  const [profilesRes, leadsRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, email, full_name, role")
      .eq("studio_id", studioId)
      .in("email", normalized),
    supabase
      .from("leads")
      .select("id, email, first_name, last_name")
      .eq("studio_id", studioId)
      .in("email", normalized),
  ]);

  const out: Record<string, ContactMatch> = {};

  for (const p of profilesRes.data ?? []) {
    if (!p.email) continue;
    const key = p.email.toLowerCase();
    const role = p.role as Role;
    out[key] = {
      email: key,
      type: role,
      label: p.full_name?.trim() || p.email,
      href: profileHref(role, p.id),
      id: p.id,
    };
  }

  for (const l of leadsRes.data ?? []) {
    if (!l.email) continue;
    const key = l.email.toLowerCase();
    if (out[key]) continue;
    const label = [l.first_name, l.last_name].filter(Boolean).join(" ").trim() || l.email;
    out[key] = {
      email: key,
      type: "lead",
      label,
      href: "/portal/admin/leads",
      id: l.id,
    };
  }

  return out;
}

export function contactTypeLabel(type: ContactMatch["type"]): string {
  if (type === "lead") return "Lead";
  return ROLE_LABEL[type];
}
