// Edge-safe platform operator check for middleware (no service role).
// Operator status comes only from the platform_operators table, read under the
// caller's own token, so a forged or stale cookie cannot grant it. There is no
// email allow-list: the middleware decodes the session cookie without verifying
// it, so an email claim there is not evidence of anything.

import type { SupabaseClient } from "@supabase/supabase-js";

export async function checkPlatformOperator(
  supabase: SupabaseClient,
  userId: string,
  _email?: string | null,
): Promise<boolean> {
  const { data } = await supabase
    .from("platform_operators")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  return !!data;
}
