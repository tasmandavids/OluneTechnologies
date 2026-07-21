import { NextRequest, NextResponse } from "next/server";
import { sanitizeNextPath } from "@/lib/auth/oauth";
import { mergeSessionCookies } from "@/lib/supabase/middleware";
import { createAuthRouteClient } from "@/lib/supabase/route-handler";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const origin = url.origin;
  const next = sanitizeNextPath(url.searchParams.get("next"));

  const loginOnError = `${origin}/login?error=auth_callback_error&next=${encodeURIComponent(next)}`;

  // Holder redirect collects PKCE verifier cookies during signInWithOAuth.
  const { supabase, getResponse } = createAuthRouteClient(request, origin);
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
      queryParams: { prompt: "select_account" },
      skipBrowserRedirect: true,
    },
  });

  if (error || !data?.url) {
    return NextResponse.redirect(loginOnError);
  }

  const providerRedirect = NextResponse.redirect(data.url);
  return mergeSessionCookies(providerRedirect, getResponse());
}
