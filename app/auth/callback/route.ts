import { NextRequest, NextResponse } from "next/server";
import { sanitizeNextPath } from "@/lib/auth/oauth";
import {
  createAuthRouteClient,
  finalizeOAuthSession,
} from "@/lib/supabase/route-handler";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const next = sanitizeNextPath(url.searchParams.get("next"));
  const redirectUrl = `${url.origin}${next}`;

  // Errors go back to the login page on the SAME origin the callback landed on
  // (the studio subdomain the user signed in from), keeping ?next so a retry
  // resumes the flow — never the platform-site login.
  const loginOnError = `${url.origin}/login?error=auth_callback_error&next=${encodeURIComponent(next)}`;

  if (!code) {
    return NextResponse.redirect(loginOnError);
  }

  const { supabase, getResponse } = createAuthRouteClient(request, redirectUrl);
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.session) {
    return NextResponse.redirect(loginOnError);
  }

  const response = await finalizeOAuthSession(request, getResponse(), data.session);
  return response;
}
