// ============================================================================
//  lib/api/caller.ts
//
//  Resolves who is calling a Route Handler, from either of the two clients we
//  now have:
//
//    • the web app — a Supabase session in cookies, refreshed by middleware.
//    • the native app — `Authorization: Bearer <access_token>`, because a
//      React Native client keeps its session in the keychain (expo-secure-store)
//      and has no cookie jar to put it in.
//
//  Both paths end in a Supabase client whose RLS runs as that user, so a route
//  written against this helper is identical for both callers and no policy has
//  to learn about the app.
//
//  ── Why the bearer token is verified, not decoded
//  `getUser(token)` asks GoTrue to validate the signature and expiry. Reading
//  the `sub` claim out of the JWT locally would be faster and would accept any
//  token a caller cared to forge. The round trip is the point.
//
//  ── Why an invalid bearer token never falls back to cookies
//  A request that presents credentials is asserting an identity. Quietly
//  serving it as whoever the cookies say instead would let a stale app token
//  return another user's data on a shared browser, and would make "my token
//  expired" look like "it works sometimes".
//
//  Server-only.
// ============================================================================

import type { NextRequest } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient as createCookieClient } from "@/lib/supabase/server";

export type Caller = {
  supabase: SupabaseClient;
  user: User;
  /** Which credential the caller presented. Useful in logs, not in policy. */
  via: "cookie" | "bearer";
};

/** The bearer token on a request, or null when the header is absent/malformed. */
export function bearerToken(req: NextRequest): string | null {
  const header = req.headers.get("authorization");
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) return null;
  const token = match[1].trim();
  return token.length > 0 ? token : null;
}

/**
 * A Supabase client that acts as the holder of `accessToken`.
 *
 * The token rides on every PostgREST request, so RLS sees the same
 * `auth.uid()` the cookie client would. `persistSession` is off because there
 * is nowhere to persist to and nothing to refresh — the app owns its own
 * refresh cycle and sends whatever is current.
 */
function createBearerClient(accessToken: string): SupabaseClient {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}

/**
 * Resolve the signed-in caller, or null when there isn't one.
 *
 * Routes should treat null as 401 — see `unauthorized()` in ./responses.
 */
export async function resolveCaller(req: NextRequest): Promise<Caller | null> {
  const token = bearerToken(req);

  if (token) {
    const supabase = createBearerClient(token);
    // Explicit argument: with no cookie jar there is no session for a bare
    // getUser() to read, so it would return null for a perfectly good token.
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) return null;
    return { supabase, user: data.user, via: "bearer" };
  }

  const supabase = await createCookieClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return { supabase, user, via: "cookie" };
}
