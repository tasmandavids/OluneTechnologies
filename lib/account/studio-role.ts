import type { SupabaseClient } from "@supabase/supabase-js";
import type { Role } from "@/lib/types";

/** A home role never grants privileges in another workspace. */
export async function userRoleForStudio(
  supabase: SupabaseClient,
  userId: string,
  profile: { studio_id: string | null; role?: Role | null },
  studioId: string,
): Promise<Role | null> {
  const { data: membership, error } = await supabase
    .from("studio_memberships")
    .select("role, status")
    .eq("user_id", userId)
    .eq("studio_id", studioId)
    .maybeSingle();
  if (error || (membership && membership.status !== "active")) return null;
  // Older home accounts can predate membership backfill. Profile role changes
  // remain authoritative at home; affiliates always require an active row.
  if (profile.studio_id === studioId) return profile.role ?? null;
  return (membership?.role as Role | undefined) ?? null;
}
