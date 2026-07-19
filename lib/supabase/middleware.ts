// Supabase client for Next.js middleware — refreshes the session once per
// request and clears stale auth cookies when the refresh token is invalid.

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { withAuthCookieDomain } from "@/lib/auth/cookie-domain";

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
            response.cookies.set(name, value, withAuthCookieDomain(options)),
          );
        },
      },
    },
  );

  return { supabase, getResponse: () => response };
}

/** Refresh session; on invalid refresh token, sign out so stale cookies are cleared. */
export async function refreshSession(request: NextRequest) {
  const { supabase, getResponse } = createMiddlewareClient(request);

  const { data: { user }, error } = await supabase.auth.getUser();

  if (error && isStaleRefreshError(error)) {
    await supabase.auth.signOut();
    return { supabase, response: getResponse(), user: null };
  }

  return { supabase, response: getResponse(), user: user ?? null };
}

function isStaleRefreshError(error: { message?: string; code?: string }): boolean {
  const msg = error.message?.toLowerCase() ?? "";
  return (
    msg.includes("refresh token") ||
    error.code === "refresh_token_not_found" ||
    error.code === "invalid_refresh_token"
  );
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
