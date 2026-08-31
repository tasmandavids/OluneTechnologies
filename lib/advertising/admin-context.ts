// ============================================================================
//  Admin context for ad-platform connections (Meta, TikTok).
//
//  A thin adapter over getAdminStudio() rather than its own auth check — see
//  lib/email/admin-context.ts for the full account. Here the divergence would
//  have linked an ad account to whichever studio happened to be in
//  profile.studio_id rather than the workspace the admin was actually in.
// ============================================================================

import { getAdminStudio } from "@/lib/portal/access";

export async function getAdminAdvertisingContext(): Promise<
  | { error: string; userId: null; studioId: null }
  | { error: null; userId: string; studioId: string }
> {
  const access = await getAdminStudio();
  if (access.error || !access.studioId || !access.userId) {
    return { error: access.error ?? "No studio.", userId: null, studioId: null };
  }

  return { error: null, userId: access.userId, studioId: access.studioId };
}
