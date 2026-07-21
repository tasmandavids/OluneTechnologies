// Supabase client for Next.js middleware — refreshes the session once per
// request and clears stale auth cookies when the refresh token is invalid.

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

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
 * Validate the session for this request, letting Supabase rotate an expired
 * access token (the happy path writes fresh cookies via setAll).
 *
 * On a refresh error we deliberately do NOT sign out. A page load fires several
 * requests in parallel, each running this middleware and each refreshing the
 * SAME refresh token; rotation + the 10s reuse grace lets one win while an
 * unlucky sibling gets a transient `refresh_token_not_found`. The old code
 * reacted by calling `supabase.auth.signOut()` — which defaults to
 * `scope: 'global'` and revokes EVERY session the user has on every device.
 * One racing request then cascaded into a cross-device mass logout (visible in
 * the auth logs as floods of `refresh_token_not_found` plus
 * `Possible abuse attempt` family revocations). Instead we simply treat this
 * request as unauthenticated: the winning request's rotated cookie stands, and
 * a genuinely dead session resolves to logged-out on the next navigation with
 * no server-side revocation.
 */
export async function refreshSession(request: NextRequest) {
  const { supabase, getResponse } = createMiddlewareClient(request);

  const { data: { user } } = await supabase.auth.getUser();

  return { supabase, response: getResponse(), user: user ?? null };
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
