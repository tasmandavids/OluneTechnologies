// Supabase client for Route Handlers that mutate auth cookies and redirect.
//
// Next.js 15+ does not propagate cookies().set() onto a separately returned
// NextResponse.redirect() — mirror every write onto the outgoing response.
// OAuth callbacks must also persist the session explicitly: relying only on
// onAuthStateChange → applyServerStorage can leave the redirect with no
// Set-Cookie headers (notably in Safari), so middleware treats the user as
// logged out on the very next navigation.

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createChunks, stringToBase64URL } from "@supabase/ssr/dist/module/utils";
import type { Session } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const BASE64_PREFIX = "base64-";

/** `sb-<project-ref>-auth-token` — matches @supabase/ssr / auth-js defaults. */
export function supabaseAuthStorageKey(): string {
  const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split(".")[0];
  return `sb-${ref}-auth-token`;
}

function cookieOptions(request: NextRequest, maxAge: number): CookieOptions {
  return {
    path: "/",
    sameSite: "lax",
    httpOnly: false,
    maxAge,
    ...(request.nextUrl.protocol === "https:" ? { secure: true } : {}),
  };
}

function isAuthCookie(name: string, storageKey: string): boolean {
  return (
    name === storageKey ||
    name.startsWith(`${storageKey}.`) ||
    name === `${storageKey}-code-verifier`
  );
}

/** Clear every Supabase auth cookie present on the request. */
export function clearSupabaseAuthCookies(
  response: NextResponse,
  request: NextRequest,
): NextResponse {
  const storageKey = supabaseAuthStorageKey();
  const clear = cookieOptions(request, 0);
  for (const cookie of request.cookies.getAll()) {
    if (isAuthCookie(cookie.name, storageKey)) {
      response.cookies.set(cookie.name, "", clear);
    }
  }
  return response;
}

/**
 * Bind Supabase to the incoming request and an outgoing redirect. Uses the same
 * request/response cookie pattern as lib/supabase/middleware.ts.
 */
export function createAuthRouteClient(request: NextRequest, redirectUrl: string) {
  let response = NextResponse.redirect(redirectUrl);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, cacheHeaders) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.redirect(redirectUrl);
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
          if (cacheHeaders) {
            for (const [key, value] of Object.entries(cacheHeaders)) {
              response.headers.set(key, value);
            }
          }
        },
      },
      auth: {
        autoRefreshToken: false,
      },
    },
  );

  return { supabase, getResponse: () => response };
}

/**
 * Google OAuth initiation — ignore any existing session cookies so a stale
 * refresh token cannot interfere with the new PKCE flow.
 */
export function createOAuthSignInClient(request: NextRequest, redirectUrl: string) {
  let response = NextResponse.redirect(redirectUrl);
  clearSupabaseAuthCookies(response, request);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return [];
        },
        setAll(cookiesToSet, cacheHeaders) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.redirect(redirectUrl);
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
          if (cacheHeaders) {
            for (const [key, value] of Object.entries(cacheHeaders)) {
              response.headers.set(key, value);
            }
          }
        },
      },
      auth: {
        autoRefreshToken: false,
      },
    },
  );

  return { supabase, getResponse: () => response };
}

/**
 * OAuth callback client — strips stale session cookies before the PKCE exchange.
 *
 * Returning users often arrive with an expired session still in the browser.
 * auth-js then tries to refresh that dead refresh token during
 * exchangeCodeForSession, which produces `refresh_token_not_found` in prod
 * logs and can prevent the new session from being written.
 */
export function createOAuthCallbackClient(request: NextRequest, redirectUrl: string) {
  let response = NextResponse.redirect(redirectUrl);
  const storageKey = supabaseAuthStorageKey();

  // Drop stale session cookies on the outgoing response before touching auth-js.
  clearSupabaseAuthCookies(response, request);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          // Only the PKCE verifier is needed for the code exchange.
          return request.cookies
            .getAll()
            .filter((c) => c.name === `${storageKey}-code-verifier`);
        },
        setAll(cookiesToSet, cacheHeaders) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.redirect(redirectUrl);
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
          if (cacheHeaders) {
            for (const [key, value] of Object.entries(cacheHeaders)) {
              response.headers.set(key, value);
            }
          }
        },
      },
      auth: {
        autoRefreshToken: false,
      },
    },
  );

  return { supabase, getResponse: () => response };
}

/** Write session cookies onto a redirect response (same encoding as @supabase/ssr). */
export function persistSessionOnResponse(
  response: NextResponse,
  request: NextRequest,
  session: Session,
): NextResponse {
  const storageKey = supabaseAuthStorageKey();
  const encoded = BASE64_PREFIX + stringToBase64URL(JSON.stringify(session));
  const chunks = createChunks(storageKey, encoded);
  const setOpts = cookieOptions(request, 400 * 24 * 60 * 60);
  const clearOpts = cookieOptions(request, 0);

  clearSupabaseAuthCookies(response, request);

  for (const chunk of chunks) {
    response.cookies.set(chunk.name, chunk.value, setOpts);
  }

  response.headers.set("Cache-Control", "private, no-cache, no-store, must-revalidate, max-age=0");
  response.headers.set("Expires", "0");
  response.headers.set("Pragma", "no-cache");

  return response;
}

/** After a successful code exchange, guarantee session cookies on the redirect. */
export function finalizeOAuthSession(
  request: NextRequest,
  response: NextResponse,
  session: Session,
): NextResponse {
  return persistSessionOnResponse(response, request, session);
}
