// Supabase client for Route Handlers that mutate auth cookies and redirect.
//
// Next.js 15+ does not propagate cookies().set() onto a separately returned
// NextResponse.redirect() — mirror every write onto the outgoing response.

import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import {
  purgeAuthCookies,
  stripSessionFromRequest,
} from "@/lib/supabase/auth-cookies";
import { mergeSessionCookies } from "@/lib/supabase/middleware";

function createRedirectClient(request: NextRequest, redirectUrl: string) {
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
 * Google OAuth initiation — purge every stale auth cookie before starting PKCE.
 */
export function createOAuthSignInClient(request: NextRequest, redirectUrl: string) {
  const { supabase, getResponse } = createRedirectClient(request, redirectUrl);
  purgeAuthCookies(getResponse(), request);
  return { supabase, getResponse };
}

/**
 * OAuth callback — strip stale session from the request, purge orphaned chunks
 * on the response, then run the PKCE exchange with a normal getAll/setAll so
 * applyServerStorage can remove old chunks before writing the new session.
 */
export function createOAuthCallbackClient(request: NextRequest, redirectUrl: string) {
  stripSessionFromRequest(request);
  const { supabase, getResponse } = createRedirectClient(request, redirectUrl);
  purgeAuthCookies(getResponse(), request, { keepVerifier: true });
  return { supabase, getResponse };
}

/** Copy session cookies from the exchange response onto the final redirect. */
export function finalizeOAuthRedirect(
  targetUrl: string,
  sessionResponse: NextResponse,
): NextResponse {
  return mergeSessionCookies(NextResponse.redirect(targetUrl), sessionResponse);
}
