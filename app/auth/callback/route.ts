import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sanitizeNextPath } from "@/lib/auth/oauth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = sanitizeNextPath(url.searchParams.get("next"));
  const origin = url.origin;

  // Errors go back to the login page on the SAME origin the callback landed on
  // (the studio subdomain the user signed in from), keeping ?next so a retry
  // resumes the flow — never the platform-site login.
  const loginOnError = `${origin}/login?error=auth_callback_error&next=${encodeURIComponent(next)}`;

  if (!code) {
    return NextResponse.redirect(loginOnError);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(loginOnError);
  }

  // Redirect to the same origin the user started from and preserve ?next=...
  return NextResponse.redirect(`${origin}${next}`);
}
