import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { resolveTenantStudioId } from "@/lib/portal/tenant-studio";
import type { Role } from "@/lib/types";

export type StudioAccess = {
  error: string | null;
  supabase: SupabaseClient;
  studioId: string | null;
  userId: string | null;
  role: Role | null;
};

export function isStudioOpsRole(role: Role | null | undefined): boolean {
  return role === "admin" || role === "office";
}

/** Active workspace for RLS + portal queries (falls back to primary studio). */
export function resolveEffectiveStudioId(profile: {
  studio_id: string | null;
  active_studio_id?: string | null;
}): string | null {
  return (profile.active_studio_id as string | null) ?? profile.studio_id;
}

async function getStudioAccess(allowed: (role: Role) => boolean): Promise<StudioAccess> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Not signed in.", supabase, studioId: null, userId: null, role: null };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("studio_id, active_studio_id, role")
    .eq("id", user.id)
    .single();

  const role = (profile?.role as Role | undefined) ?? null;
  if (!role || !allowed(role)) {
    return { error: "Not authorized.", supabase, studioId: null, userId: user.id, role };
  }

  const tenantScope = profile
    ? await resolveTenantStudioId(supabase, user.id, profile, { requireOpsAccess: true })
    : { studioId: null, error: "No studio found." as string | null };

  if (tenantScope.error) {
    return {
      error: tenantScope.error,
      supabase,
      studioId: null,
      userId: user.id,
      role,
    };
  }

  const studioId = tenantScope.studioId ?? (profile ? resolveEffectiveStudioId(profile) : null);
  if (!studioId) {
    return {
      error: "No studio found.",
      supabase,
      studioId: null,
      userId: user.id,
      role,
    };
  }

  return {
    error: null,
    supabase,
    studioId,
    userId: user.id,
    role,
  };
}

/** Studio admin only — billing, staff HR, settings, etc. */
export async function getAdminStudio(): Promise<StudioAccess> {
  return getStudioAccess((role) => role === "admin");
}

/** Front-desk + studio admin — parents, students, leads, messages, classes. */
export async function getStudioOpsStudio(): Promise<StudioAccess> {
  return getStudioAccess(isStudioOpsRole);
}

/**
 * Parent (or self-managed student) portal context — respects active_studio_id
 * and tenant host the same way admin helpers do.
 */
export async function getParentStudio(): Promise<
  StudioAccess & { mode: "parent" | "self" | null }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      error: "Not signed in.",
      supabase,
      studioId: null,
      userId: null,
      role: null,
      mode: null,
    };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("studio_id, active_studio_id, role, self_managed")
    .eq("id", user.id)
    .single();

  const role = (profile?.role as Role | undefined) ?? null;
  const selfManaged = Boolean(profile?.self_managed);

  if (role === "parent") {
    const tenantScope = await resolveTenantStudioId(supabase, user.id, profile!, {
      requireOpsAccess: false,
    });
    const studioId =
      tenantScope.studioId ?? (profile ? resolveEffectiveStudioId(profile) : null);
    if (tenantScope.error || !studioId) {
      return {
        error: tenantScope.error ?? "No studio found.",
        supabase,
        studioId: null,
        userId: user.id,
        role,
        mode: null,
      };
    }
    return {
      error: null,
      supabase,
      studioId,
      userId: user.id,
      role,
      mode: "parent",
    };
  }

  if (role === "student" && selfManaged) {
    const studioId = profile ? resolveEffectiveStudioId(profile) : null;
    if (!studioId) {
      return {
        error: "No studio found.",
        supabase,
        studioId: null,
        userId: user.id,
        role,
        mode: null,
      };
    }
    return {
      error: null,
      supabase,
      studioId,
      userId: user.id,
      role,
      mode: "self",
    };
  }

  return {
    error: "Parent access required.",
    supabase,
    studioId: null,
    userId: user.id,
    role,
    mode: null,
  };
}
