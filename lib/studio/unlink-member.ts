// Removing a person from one studio must never reach into another.
//
// profiles are global accounts: ~50 tables cascade from them, including other
// studios' tickets, orders, subscriptions, signed waivers and attendance. So
// "remove from this studio" unlinks the person from this studio, and only
// erases the account when this was the last studio they belonged to.

import type { SupabaseClient } from "@supabase/supabase-js";

export type UnlinkResult =
  | { ok: true; erased: boolean }
  | { ok: false; error: string };

export async function unlinkOrEraseMember(
  admin: SupabaseClient,
  userId: string,
  studioId: string,
): Promise<UnlinkResult> {
  const { data: others, error: othersErr } = await admin
    .from("studio_memberships")
    .select("studio_id, role, status, is_primary")
    .eq("user_id", userId)
    .neq("studio_id", studioId)
    .order("is_primary", { ascending: false });
  if (othersErr) return { ok: false, error: othersErr.message };

  const { data: profile, error: profileErr } = await admin
    .from("profiles")
    .select("studio_id, active_studio_id")
    .eq("id", userId)
    .maybeSingle();
  if (profileErr) return { ok: false, error: profileErr.message };

  // A legacy account whose profile sits at another studio with no membership
  // row there still belongs to that studio.
  const belongsElsewhere =
    (others?.length ?? 0) > 0 ||
    (!!profile?.studio_id && profile.studio_id !== studioId);

  if (!belongsElsewhere) {
    await admin.from("events").update({ created_by: null }).eq("created_by", userId);
    const { error } = await admin.auth.admin.deleteUser(userId);
    return error ? { ok: false, error: error.message } : { ok: true, erased: true };
  }

  const steps = [
    admin.from("guardianships").delete().eq("studio_id", studioId).eq("guardian_id", userId),
    admin.from("staff_members").delete().eq("studio_id", studioId).eq("profile_id", userId),
    admin.from("classes").update({ teacher_id: null }).eq("studio_id", studioId).eq("teacher_id", userId),
    admin.from("studio_memberships").delete().eq("studio_id", studioId).eq("user_id", userId),
  ];
  for (const step of steps) {
    const { error } = await step;
    if (error) return { ok: false, error: error.message };
  }

  // Point the account at a studio it still belongs to.
  if (profile && (profile.studio_id === studioId || profile.active_studio_id === studioId)) {
    const next = others?.find((m) => m.status === "active") ?? others?.[0];
    const patch: Record<string, unknown> =
      profile.studio_id === studioId && next
        ? { studio_id: next.studio_id, active_studio_id: next.studio_id, role: next.role }
        : { active_studio_id: profile.studio_id === studioId ? null : profile.studio_id };
    const { error } = await admin.from("profiles").update(patch).eq("id", userId);
    if (error) return { ok: false, error: error.message };
  }

  return { ok: true, erased: false };
}
