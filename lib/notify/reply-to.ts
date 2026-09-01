// ============================================================================
//  lib/notify/reply-to.ts
//
//  Who a recipient reaches when they hit Reply.
//
//  Olune sends two very different kinds of mail from one address. Most of it is
//  a STUDIO talking to its own families — invoices, class reminders, invites,
//  the mass email that literally signs off "— {studioName}". A little of it is
//  Olune talking to its own customers. A single global RESEND_REPLY_TO cannot
//  serve both: point it at support@olune.co.nz and every "can Ruby skip
//  Tuesday?" lands in Olune's helpdesk instead of at the studio that asked, and
//  the parent never reaches the person they meant.
//
//  So studio-branded mail resolves its reply-to from the studio, and only
//  Olune's own correspondence falls through to the global default.
//
//  Server-only.
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import { isNonRoutableEmail } from "@/lib/parents/mass-email";

function usable(email: unknown): string | undefined {
  if (typeof email !== "string") return undefined;
  const trimmed = email.trim();
  if (!trimmed || isNonRoutableEmail(trimmed)) return undefined;
  return trimmed;
}

/**
 * The best reply-to for mail a studio sends to its families.
 *
 * Prefers the address the studio chose to publish (Settings → Branding, the
 * same one on its public site), because that is the one it already tells
 * families to use. Falls back to the owner's login address, which always
 * exists — at the time of writing only 1 of 7 studios had set a contact email,
 * so without the fallback this would resolve to nothing for almost everyone
 * and quietly hand parent replies back to the global default.
 *
 * `undefined` means "no better answer than the platform default" — callers
 * pass it straight through and let RESEND_REPLY_TO apply.
 */
export async function resolveStudioReplyTo(
  client: SupabaseClient,
  studioId: string,
): Promise<string | undefined> {
  const { data: branding } = await client
    .from("studio_branding")
    .select("site_settings")
    .eq("studio_id", studioId)
    .maybeSingle();

  const published = usable(
    (branding?.site_settings as { contactEmail?: unknown } | null)?.contactEmail,
  );
  if (published) return published;

  // Oldest admin — the founding owner, not whoever was added most recently.
  const { data: owner } = await client
    .from("profiles")
    .select("email")
    .eq("studio_id", studioId)
    .eq("role", "admin")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return usable(owner?.email);
}

/**
 * A memoised resolver for callers that send to many recipients in one pass.
 *
 * The delivery cron walks every due notification across every studio, so
 * resolving per message would add two queries per email. Caching the promise
 * rather than the value also collapses concurrent lookups for the same studio
 * into one round trip. Scope one of these per request — it must not outlive a
 * studio's own settings changes.
 */
export function createStudioReplyToResolver(
  client: SupabaseClient,
): (studioId: string | null | undefined) => Promise<string | undefined> {
  const cache = new Map<string, Promise<string | undefined>>();
  return (studioId) => {
    if (!studioId) return Promise.resolve(undefined);
    let hit = cache.get(studioId);
    if (!hit) {
      hit = resolveStudioReplyTo(client, studioId);
      cache.set(studioId, hit);
    }
    return hit;
  };
}
