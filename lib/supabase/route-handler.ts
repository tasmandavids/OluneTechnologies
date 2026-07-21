// Supabase client for Route Handlers that mutate auth cookies and redirect.
//
// Next.js 15+ does not propagate cookies().set() onto a separately returned
// NextResponse.redirect() — the browser never receives Set-Cookie headers.
// OAuth callbacks then "succeed" server-side but the next request has no
// session, so middleware sends the user back to /login. Safari is especially
// strict here; Chrome can appear to work intermittently.
//
// Bind the outgoing response up front and mirror every cookie write onto it.

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";

export async function createAuthRouteClient(response: NextResponse) {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet, cacheHeaders) {
          cookiesToSet.forEach(({ name, value, options }) => {
            try {
              cookieStore.set(name, value, options);
            } catch {
              /* read-only context — still write to the outgoing response */
            }
            response.cookies.set(name, value, options);
          });
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
}
