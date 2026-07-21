import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sanitizeNextPath } from "@/lib/auth/oauth";

export const dynamic = "force-dynamic";

// Server-initiated Google OAuth.
//
// Initiating the PKCE flow here (rather than in the browser via
// signInWithOAuth) is what makes Google sign-in work in Safari. When the
// browser client starts the flow it writes the `sb-*-auth-token-code-verifier`
// via document.cookie; Safari's "Prevent Cross-Site Tracking" (ITP, on by
// default) drops/partitions that script-set cookie across the
// Google → Supabase → /auth/callback redirect chain, so the callback has no
// verifier and exchangeCodeForSession fails — the user just bounces back to
// /login. Chrome keeps the cookie, which is why it only breaks in Safari.
//
// Running the same call server-side with skipBrowserRedirect makes Supabase
// persist the verifier through this route handler's `Set-Cookie` response
// header — a first-party HTTP cookie Safari does not subject to ITP's
// script-cookie handling — then we redirect the browser to the provider URL.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;
  const next = sanitizeNextPath(url.searchParams.get("next"));

  const loginOnError = `${origin}/login?error=auth_callback_error&next=${encodeURIComponent(next)}`;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
      queryParams: { prompt: "select_account" },
      // Return the provider URL instead of throwing a redirect from inside the
      // SDK, so the verifier cookie lands on THIS response before we navigate.
      skipBrowserRedirect: true,
    },
  });

  if (error || !data?.url) {
    return NextResponse.redirect(loginOnError);
  }

  return NextResponse.redirect(data.url);
}
