// ============================================================================
//  Admin context for the shared email inbox.
//
//  A thin adapter over getAdminStudio() rather than its own auth check. It used
//  to re-implement one (getUser → profiles → role === "admin"), which quietly
//  diverged from the canonical path in three ways:
//
//    • it read profile.studio_id and ignored active_studio_id, so an admin of
//      more than one studio who had switched workspace read and replied to the
//      OTHER studio's mail;
//    • it skipped resolveTenantStudioId(), so the studio was never checked
//      against the tenant host the request arrived on;
//    • it predated the plan gate (0119) and so never consulted it, leaving a
//      locked studio with full inbox access through /api/email/*.
//
//  Anything that needs "this caller is a studio admin" belongs in
//  lib/portal/access.ts. This file only reshapes the result for the callers
//  that expect { supabase, studioId, userId }.
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import { getAdminStudio } from "@/lib/portal/access";

/**
 * Explicitly annotated rather than inferred. Inference widens the failure arm's
 * `error` to `string`, and `string` is a useless discriminant because `""` is
 * falsy — `if (ctx.error) return` then fails to narrow and every `ctx.supabase`
 * downstream is possibly-undefined.
 */
export type AdminEmailContext =
  | { error: string; supabase?: undefined; studioId?: undefined; userId?: undefined }
  | { error: null; supabase: SupabaseClient; studioId: string; userId: string };

export async function getAdminEmailContext(): Promise<AdminEmailContext> {
  const access = await getAdminStudio();
  if (access.error || !access.studioId || !access.userId) {
    return { error: access.error ?? "No studio." };
  }

  return {
    error: null,
    supabase: access.supabase,
    studioId: access.studioId,
    userId: access.userId,
  };
}
