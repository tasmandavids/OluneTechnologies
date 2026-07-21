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

const SESSION_COOKIE_OPTIONS: CookieOptions = {
  path: "/",
  sameSite: "lax",
  httpOnly: false,
  maxAge: 400 * 24 * 60 * 60,
};

const CLEAR_COOKIE_OPTIONS: CookieOptions = {
  path: "/",
  sameSite: "lax",
  httpOnly: false,
  maxAge: 0,
};

/** `sb-<project-ref>-auth-token` — matches @supabase/ssr / auth-js defaults. */
export function supabaseAuthStorageKey(): string {
  const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split(".")[0];
  return `sb-${ref}-auth-token`;
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

/** Write session cookies onto a redirect response (same encoding as @supabase/ssr). */
export function persistSessionOnResponse(
  response: NextResponse,
  request: NextRequest,
  session: Session,
): NextResponse {
  const storageKey = supabaseAuthStorageKey();
  const encoded = BASE64_PREFIX + stringToBase64URL(JSON.stringify(session));
  const chunks = createChunks(storageKey, encoded);

  // Clear any previous session / verifier chunks for this storage key.
  for (const cookie of request.cookies.getAll()) {
    if (
      cookie.name === `${storageKey}-code-verifier` ||
      cookie.name.startsWith(`${storageKey}.`) ||
      cookie.name === storageKey
    ) {
      response.cookies.set(cookie.name, "", CLEAR_COOKIE_OPTIONS);
    }
  }

  for (const chunk of chunks) {
    response.cookies.set(chunk.name, chunk.value, SESSION_COOKIE_OPTIONS);
  }

  response.headers.set("Cache-Control", "private, no-cache, no-store, must-revalidate, max-age=0");
  response.headers.set("Expires", "0");
  response.headers.set("Pragma", "no-cache");

  return response;
}

/** After a successful code exchange, guarantee session cookies on the redirect. */
export async function finalizeOAuthSession(
  request: NextRequest,
  response: NextResponse,
  session: Session,
): Promise<NextResponse> {
  // Let auth-js subscribers run first (clears verifier via applyServerStorage).
  await new Promise((resolve) => setTimeout(resolve, 0));
  return persistSessionOnResponse(response, request, session);
}
