// Supabase client for Server Components, Route Handlers, and Server Actions.
// Uses the request cookies so RLS runs as the signed-in user.

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { withAuthCookieDomain } from "@/lib/auth/cookie-domain";

export async function createClient() {
  const cookieStore = await cookies(); // async in Next.js 15

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          // In pure Server Components cookies are read-only; the middleware
          // refreshes the session, so swallowing this write is safe.
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, withAuthCookieDomain(options)),
            );
          } catch {
            /* called from a Server Component — ignore */
          }
        },
      },
      auth: {
        // Middleware owns token refresh — avoid duplicate refresh races in RSC.
        autoRefreshToken: false,
      },
    },
  );
}
