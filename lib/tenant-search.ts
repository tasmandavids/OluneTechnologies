// ============================================================================
//  lib/tenant-search.ts
//
//  PURE input handling for studio lookup — no Supabase import, so it is
//  testable without a database and safe anywhere lib/tenant-host.ts is.
//
//  This exists because of the native app. On the web a studio is implied by the
//  host; in an app there is no host, so the very first screen has to ask "which
//  studio are you with?" and search on whatever the parent types — usually the
//  studio's name, sometimes the code on their welcome email (which is the slug).
// ============================================================================

/** Below this a search matches most of the table and helps nobody. */
export const MIN_STUDIO_QUERY = 2;

/** Never return more than this from a lookup, however broad the query. */
export const STUDIO_QUERY_LIMIT = 10;

/**
 * Strip a user's search term down to what is safe to interpolate into a
 * PostgREST filter.
 *
 * PostgREST parses `or=(...)` as a grammar: commas separate terms, dots
 * separate column/operator/value, and parentheses group. A studio name
 * containing any of those — or a parent pasting one — does not just fail to
 * match, it changes which filter runs. Rather than escape a grammar we do not
 * own, the term is reduced to characters that cannot mean anything in it.
 *
 * Letters (including accented ones), digits, spaces, hyphens, apostrophes and
 * ampersands survive, which covers real studio names like "Ré's Dance & Co".
 */
export function sanitizeStudioQuery(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw
    .normalize("NFC")
    .replace(/[^\p{L}\p{N}\s'&-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length < MIN_STUDIO_QUERY) return null;
  // Long enough to be a paste accident rather than a studio name.
  return cleaned.slice(0, 60);
}

/**
 * A studio slug is a subdomain label, so it is far narrower than a name: this
 * is what lets an exact code match be ranked above a fuzzy name match.
 */
export function isStudioSlug(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(value.trim());
}
