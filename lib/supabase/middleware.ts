// Supabase client for Next.js middleware — keeps the session fresh for SSR
// without stampeding the refresh-token endpoint (see refreshSession below).

import { createServerClient } from "@supabase/ssr";
import { stringFromBase64URL } from "@supabase/ssr/dist/module/utils";
import { NextResponse, type NextRequest } from "next/server";
import { purgeAuthCookies, requestHasAuthCookies } from "@/lib/supabase/auth-cookies";

/** The only bits of the user the routing layer in middleware.ts needs. */
export type SessionUser = { id: string; email: string | null };

// Refresh the access token this many seconds before it actually expires. Must
// stay comfortably above @supabase/auth-js's own internal expiry margin so that
// a token we consider "fresh" here is never one that getSession() (called later
// in middleware.ts) would decide to rotate behind our back. Access tokens live
// 3600s by default, so refreshing in the last ~2 min is cheap and races-free.
const REFRESH_MARGIN_SECONDS = 120;

// Best-effort, per-isolate single-flight lock keyed by the *incoming* refresh
// token. When a burst of parallel requests (RSC payloads, prefetches, the nav
// itself) all land on the same edge isolate at the expiry boundary, only the
// first actually rotates the token; the rest await its result and adopt the
// rotated pair. Across isolates, Supabase's refresh-token reuse interval is the
// backstop that lets the same old token resolve to the same new one.
const inflightRefresh = new Map<string, Promise<RefreshOutcome>>();

type RefreshOutcome =
  | { ok: true; accessToken: string; refreshToken: string }
  | { ok: false };

export function createMiddlewareClient(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  return { supabase, getResponse: () => response };
}

/**
 * Establish the session for this request without stampeding the token endpoint.
 *
 * The old approach called `supabase.auth.getUser()` on every matched request,
 * which forces a network round-trip AND rotates the refresh token whenever the
 * access token is expired. A single page load fires several requests in
 * parallel (RSC payloads, prefetches, the navigation itself); at the hourly
 * expiry boundary each one independently presented the SAME refresh token.
 * Supabase rotates on first use, so the losers got `refresh_token_not_found`
 * (400) and repeated reuse tripped abuse detection, which revokes the whole
 * session family and force-logs-out otherwise-valid users. We fix that here:
 *
 *   1. While the access token is comfortably valid, trust its (locally decoded)
 *      claims for routing and make NO network call — no getUser, no refresh.
 *      This is the vast majority of requests, and it cannot race.
 *   2. Only within REFRESH_MARGIN_SECONDS of expiry do we rotate, and then
 *      exactly once per isolate via `inflightRefresh`; concurrent siblings
 *      adopt the winner's rotated pair via setSession() instead of re-rotating.
 *
 * As with the previous fix we NEVER call `signOut()` here: a failed refresh is
 * treated as unauthenticated for this request only (no server-side revocation,
 * no cross-device cascade). A genuinely dead session resolves to logged-out on
 * the next navigation; a page's own getUser() still enforces real auth, and RLS
 * still governs all data access.
 */
export async function refreshSession(request: NextRequest) {
  const { supabase, getResponse } = createMiddlewareClient(request);
  const stored = readStoredSession(request);

  // No stored session (logged out) or an unrecognised cookie shape → fall back
  // to getUser(). If auth cookies are present but unreadable (orphaned chunks
  // from a partial OAuth write), purge them locally instead of calling getUser()
  // — that would present a dead refresh token and spam refresh_token_not_found.
  if (!stored?.accessToken || !stored.refreshToken || stored.expiresAt == null) {
    const response = getResponse();
    if (requestHasAuthCookies(request)) {
      purgeAuthCookies(response, request);
      return { supabase, response, user: null };
    }
    const { data: { user }, error } = await supabase.auth.getUser();
    if (!user && error) purgeAuthCookies(response, request);
    return { supabase, response, user: toSessionUser(user) };
  }

  const secondsLeft = stored.expiresAt - Math.floor(Date.now() / 1000);

  // Token still valid with headroom → route from claims, skip the network.
  if (secondsLeft > REFRESH_MARGIN_SECONDS) {
    const user = userFromAccessToken(stored.accessToken);
    if (user) return { supabase, response: getResponse(), user };
    // Claims failed to decode unexpectedly — degrade to a validated read.
    const { data: { user: fetched } } = await supabase.auth.getUser();
    return { supabase, response: getResponse(), user: toSessionUser(fetched) };
  }

  // At/near expiry → rotate exactly once across concurrent requests.
  const key = stored.refreshToken;
  let flight = inflightRefresh.get(key);
  const isLeader = !flight;
  if (!flight) {
    flight = rotateRefreshToken(supabase);
    inflightRefresh.set(key, flight);
    // Drop the entry once settled so a later request with a *newer* token can
    // start its own flight; stragglers still holding this token are covered by
    // Supabase's reuse interval.
    void flight.finally(() => {
      if (inflightRefresh.get(key) === flight) inflightRefresh.delete(key);
    });
  }

  const outcome = await flight;
  if (!outcome.ok) {
    const response = getResponse();
    purgeAuthCookies(response, request);
    return { supabase, response, user: null };
  }

  if (!isLeader) {
    // A sibling won the rotation. Adopt its tokens on this client so setAll
    // writes the fresh cookies onto THIS response (otherwise the browser would
    // keep the stale token and refresh again next request).
    const { error } = await supabase.auth.setSession({
      access_token: outcome.accessToken,
      refresh_token: outcome.refreshToken,
    });
    if (error) return { supabase, response: getResponse(), user: null };
  }

  return {
    supabase,
    response: getResponse(),
    user: userFromAccessToken(outcome.accessToken),
  };
}

/** Rotate the refresh token once; the shared promise fans out to siblings. */
async function rotateRefreshToken(
  supabase: ReturnType<typeof createMiddlewareClient>["supabase"],
): Promise<RefreshOutcome> {
  try {
    const { data, error } = await supabase.auth.refreshSession();
    if (error || !data.session) return { ok: false };
    return {
      ok: true,
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
    };
  } catch {
    return { ok: false };
  }
}

type StoredSession = {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number | null;
};

/**
 * Read the Supabase session straight from the request cookies WITHOUT touching
 * the network or triggering a refresh — the one thing the auth-js client can't
 * do for us here. @supabase/ssr stores the session as one or more
 * `sb-<ref>-auth-token[.<n>]` cookies whose concatenated value is either raw
 * JSON or a `base64-`-prefixed base64 of that JSON.
 */
function readStoredSession(request: NextRequest): StoredSession | null {
  const parts = request.cookies
    .getAll()
    .filter((c) => /^sb-.+-auth-token(\.\d+)?$/.test(c.name))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  if (parts.length === 0) return null;

  try {
    let raw = parts.map((c) => c.value).join("");
    if (raw.startsWith("base64-")) {
      raw = stringFromBase64URL(raw.slice("base64-".length));
    }
    const parsed = JSON.parse(raw);
    const session = Array.isArray(parsed) ? parsed[0] : parsed;
    if (!session || typeof session !== "object") return null;
    return {
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
      expiresAt: typeof session.expires_at === "number" ? session.expires_at : null,
    };
  } catch {
    return null;
  }
}

/** Decode a Supabase access-token JWT's claims into the minimal routing user. */
function userFromAccessToken(accessToken: string): SessionUser | null {
  try {
    const payload = JSON.parse(utf8FromBase64(base64UrlToBase64(accessToken.split(".")[1])));
    if (!payload?.sub) return null;
    return { id: payload.sub as string, email: (payload.email as string | null) ?? null };
  } catch {
    return null;
  }
}

function toSessionUser(user: { id: string; email?: string | null } | null): SessionUser | null {
  return user ? { id: user.id, email: user.email ?? null } : null;
}

function base64UrlToBase64(input: string): string {
  const padded = input + "=".repeat((4 - (input.length % 4)) % 4);
  return padded.replace(/-/g, "+").replace(/_/g, "/");
}

function utf8FromBase64(b64: string): string {
  const binary = atob(b64);
  const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Copy refreshed auth cookies onto redirects so the browser keeps the session. */
export function mergeSessionCookies(target: NextResponse, source: NextResponse) {
  source.cookies.getAll().forEach((cookie) => {
    target.cookies.set(cookie);
  });
  return target;
}

export function redirectWithSession(
  request: NextRequest,
  pathname: string,
  sessionResponse: NextResponse,
  searchParams?: Record<string, string>,
) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      url.searchParams.set(key, value);
    }
  }
  return mergeSessionCookies(NextResponse.redirect(url), sessionResponse);
}
