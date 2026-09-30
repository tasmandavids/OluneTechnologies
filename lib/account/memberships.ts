import type { Role } from "@/lib/types";
import type { AccountKind } from "@/lib/account/kinds";

export type StudioMembership = {
  id: string;
  studioId: string;
  studioName: string;
  studioSlug: string;
  studioKind: string;
  role: Role;
  status: string;
  isPrimary: boolean;
  linkedVia: string | null;
  linkedAt: string;
};

export type MembershipRow = {
  id: string;
  studio_id: string;
  role: Role;
  status: string;
  is_primary: boolean;
  linked_via: string | null;
  linked_at: string;
  studios: { name: string; slug: string; kind: string } | null;
};

/** Map a Supabase membership join row to the app shape. */
export function mapMembershipRow(row: MembershipRow): StudioMembership {
  return {
    id: row.id,
    studioId: row.studio_id,
    studioName: row.studios?.name ?? "Studio",
    studioSlug: row.studios?.slug ?? "",
    studioKind: row.studios?.kind ?? "studio",
    role: row.role,
    status: row.status,
    isPrimary: row.is_primary,
    linkedVia: row.linked_via,
    linkedAt: row.linked_at,
  };
}

/** Resolve the role a user holds at a specific studio. */
export function roleForStudio(
  memberships: StudioMembership[],
  studioId: string,
  fallbackRole: Role,
): Role {
  return memberships.find((m) => m.studioId === studioId && m.status === "active")?.role ?? fallbackRole;
}

/** Primary (home) membership for an account. */
export function primaryMembership(memberships: StudioMembership[]): StudioMembership | null {
  return memberships.find((m) => m.isPrimary) ?? memberships[0] ?? null;
}

/** Affiliated studio memberships excluding the instructor home workspace. */
export function affiliatedStudios(memberships: StudioMembership[]): StudioMembership[] {
  return memberships.filter((m) => m.studioKind !== "instructor" && m.status === "active");
}

/** Portal home path based on account kind. */
export function portalHomeForAccount(accountKind: AccountKind | null, role: Role): string {
  if (accountKind === "instructor" && role === "teacher") return "/portal/teacher";
  const homes: Record<Role, string> = {
    admin: "/portal/admin",
    teacher: "/portal/teacher",
    office: "/portal/office",
    parent: "/portal/parent",
    student: "/portal/student",
  };
  return homes[role];
}

/** Whether the teacher nav should show the affiliations link. */
export function showAffiliationsNav(
  accountKind: AccountKind | null,
  membershipCount: number,
): boolean {
  return accountKind === "instructor" || membershipCount > 1;
}
