// Supabase client for Route Handlers that mutate auth cookies and redirect.

import { createServerClient } from "@supabase/ssr";
import { NextRequest } from "next/server";
import { purgeAuthCookies, stripSessionFromRequest } from "@/lib/supabase/auth-cookies";

function createOAuthClient(request: NextRequest) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        // OAuth routes return buildSessionRedirect() — we only need reads here
        // for the PKCE verifier during exchangeCodeForSession.
        setAll() {},
      },
      auth: {
        autoRefreshToken: false,
      },
    },
  );

  return supabase;
}

/** Google OAuth initiation — purge stale auth cookies; verifier set via setAll in caller. */
export function createOAuthSignInClient(request: NextRequest) {
  return createOAuthClient(request);
}

/**
 * OAuth callback — hide stale session from auth-js, keep PKCE verifier only.
 * Session cookies are written explicitly by buildSessionRedirect() after exchange.
 */
export function createOAuthCallbackClient(request: NextRequest) {
  stripSessionFromRequest(request);
  const storageKey = (() => {
    const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split(".")[0];
    return `sb-${ref}-auth-token`;
  })();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies
            .getAll()
            .filter((c) => c.name === `${storageKey}-code-verifier`);
        },
        setAll() {},
      },
      auth: {
        autoRefreshToken: false,
      },
    },
  );

  return supabase;
}

export { purgeAuthCookies };
