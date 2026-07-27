// ============================================================================
//  requireModule — the module gate for pages and server actions.
//
//  Three guard layers exist, each answering a different question:
//
//    1. Nav config     "don't show dead links"      → buildAdminNav et al.
//    2. Page           "don't render a module you   → requireModule() here
//                       don't have"
//    3. Server action  "don't let a crafted POST    → assertModule() here
//                       bill me"
//
//  This is not redundancy. An over-permissive nav is a UX bug; an
//  over-permissive server action is a revenue bug — layer 3 is the real
//  boundary and must never be skipped because layer 1 already hides the link.
//
//  Guarding is deliberately NOT done in middleware.ts: that runs on Edge with
//  only JWT claims, and module sets are per-studio mutable data that cannot
//  live in a token we do not re-mint on change.
// ============================================================================

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getEntitlementsCached, type Entitlements } from "./entitlements";
import { resolveEffectiveStudioId } from "./access";
import type { ModuleKey } from "@/lib/verticals/types";
import type { Role } from "@/lib/types";

const ROLE_HOME: Record<Role, string> = {
  admin: "/portal/admin",
  office: "/portal/office",
  teacher: "/portal/teacher",
  parent: "/portal/parent",
  student: "/portal/student",
};

export class ModuleUnavailableError extends Error {
  readonly module: ModuleKey;
  constructor(module: ModuleKey) {
    super(`Module "${module}" is not enabled for this studio.`);
    this.name = "ModuleUnavailableError";
    this.module = module;
  }
}

type Resolved = { entitlements: Entitlements; role: Role | null };

async function resolveCurrent(): Promise<Resolved | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, studio_id, active_studio_id")
    .eq("id", user.id)
    .single();

  const studioId = profile ? resolveEffectiveStudioId(profile) : null;
  if (!studioId) return null;

  return {
    entitlements: await getEntitlementsCached(studioId),
    role: (profile?.role as Role | undefined) ?? null,
  };
}

/**
 * Page guard. Redirects to the role's home when the module is off.
 * Call at the top of the module's page.tsx.
 */
export async function requireModule(key: ModuleKey): Promise<Entitlements> {
  const resolved = await resolveCurrent();
  if (!resolved) redirect("/login");

  if (!resolved.entitlements.modules.has(key)) {
    redirect(resolved.role ? ROLE_HOME[resolved.role] : "/portal");
  }
  return resolved.entitlements;
}

/**
 * Server-action guard. Throws rather than redirecting — a redirect inside a
 * mutation would look like success to the caller.
 */
export async function assertModule(key: ModuleKey): Promise<Entitlements> {
  const resolved = await resolveCurrent();
  if (!resolved) throw new Error("Not signed in.");

  if (!resolved.entitlements.modules.has(key)) {
    throw new ModuleUnavailableError(key);
  }
  return resolved.entitlements;
}
