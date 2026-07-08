// Supabase client for Client Components (browser). Persists the session in a
// cookie store compatible with the SSR server client + middleware.

import { createBrowserClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

/**
 * Password-reset-only client using the implicit flow instead of PKCE.
 *
 * @supabase/ssr's createBrowserClient hardcodes flowType: "pkce", which
 * breaks password recovery: resetPasswordForEmail stores a code_verifier in
 * the browser that *requests* the reset, but the emailed link is almost
 * always opened elsewhere (a phone's Mail app, a different browser) with no
 * access to that storage — the code exchange then fails silently and the
 * user just lands back on a plain, logged-out page. The implicit flow embeds
 * the session directly in the URL fragment instead, so it works from any
 * device/browser that opens the link. Deliberately NOT cookie-backed (no
 * persistSession) — this client only lives long enough to call updateUser();
 * the user signs in fresh afterwards through the normal cookie-based client.
 */
export function createImplicitClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        flowType: "implicit",
        detectSessionInUrl: true,
        persistSession: false,
      },
    },
  );
}
