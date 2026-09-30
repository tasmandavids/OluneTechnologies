import type { SupabaseClient } from "@supabase/supabase-js";
import { headers } from "next/headers";
import { resolveStudio } from "@/lib/tenant";
import { isTenantHost } from "@/lib/tenant-host";
import { isStudioOpsRole, resolveEffectiveStudioId } from "@/lib/portal/access";
import type { Role } from "@/lib/types";
import { userRoleForStudio } from "@/lib/account/studio-role";
export { userRoleForStudio } from "@/lib/account/studio-role";

/** Whether the user may manage (admin/office) the given studio. */
export async function userHasOpsAccessToStudio(
  supabase: SupabaseClient,
  userId: string,
  profile: {
    studio_id: string | null;
    active_studio_id?: string | null;
    role?: Role | null;
  },
  studioId: string,
): Promise<boolean> {
  return isStudioOpsRole(await userRoleForStudio(supabase, userId, profile, studioId));
}

/** Whether the user belongs to the studio (home profile or active membership). */
export async function userBelongsToStudio(
  supabase: SupabaseClient,
  userId: string,
  profile: {
    studio_id: string | null;
    active_studio_id?: string | null;
  },
  studioId: string,
): Promise<boolean> {
  const { data: membership, error } = await supabase
    .from("studio_memberships")
    .select("id, status")
    .eq("user_id", userId)
    .eq("studio_id", studioId)
    .maybeSingle();

  if (error) return false;
  return membership ? membership.status === "active" : profile.studio_id === studioId;
}

/**
 * Resolve the studio scope for the current request.
 * On a tenant host (subdomain / custom domain), queries are pinned to that studio.
 * On the platform root, falls back to the user's active workspace.
 */
export async function resolveTenantStudioId(
  supabase: SupabaseClient,
  userId: string,
  profile: {
    studio_id: string | null;
    active_studio_id?: string | null;
    role?: Role | null;
  },
  options?: { requireOpsAccess?: boolean },
): Promise<{ studioId: string | null; error: string | null }> {
  const host = (await headers()).get("host");
  const tenant = await resolveStudio(host);
  const profileStudioId = resolveEffectiveStudioId(profile);

  if (!tenant && isTenantHost(host)) return { studioId: null, error: "Studio not found." };
  const studioId = tenant?.id ?? profileStudioId;
  if (!studioId) return { studioId: null, error: "No studio found." };
  // Database policies use the active workspace, not the request hostname.
  // Refuse a host/workspace mismatch instead of querying under another scope.
  if (studioId !== profileStudioId) {
    return { studioId: null, error: "Switch to this studio before using its portal." };
  }

  const belongs = await userBelongsToStudio(supabase, userId, profile, studioId);
  if (!belongs) {
    return {
      studioId: null,
      error: "You don't have access to this studio.",
    };
  }

  if (options?.requireOpsAccess) {
    const hasOps = await userHasOpsAccessToStudio(supabase, userId, profile, studioId);
    if (!hasOps) {
      return {
        studioId: null,
        error: "You don't have access to manage this studio.",
      };
    }
  }

  return { studioId, error: null };
}
