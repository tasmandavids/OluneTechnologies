// ============================================================================
//  Admin context for Xero accounting.
//
//  A thin adapter over getAdminStudio() rather than its own auth check — see
//  lib/email/admin-context.ts for the full account of what re-implementing it
//  cost. The short version: reading profile.studio_id directly ignores
//  active_studio_id, so a multi-studio admin could push invoices into the wrong
//  organisation's Xero ledger, and it bypassed the plan gate.
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import { getAdminStudio } from "@/lib/portal/access";

/** Annotated, not inferred — see the note in lib/email/admin-context.ts. */
export type AdminXeroContext =
  | { error: string; supabase?: undefined; studioId?: undefined; userId?: undefined }
  | { error: null; supabase: SupabaseClient; studioId: string; userId: string };

export async function getAdminXeroContext(): Promise<AdminXeroContext> {
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
