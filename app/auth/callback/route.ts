import { NextRequest, NextResponse } from "next/server";
import { sanitizeNextPath } from "@/lib/auth/oauth";
import {
  buildSessionCompleteResponse,
  purgeAuthCookies,
} from "@/lib/supabase/auth-cookies";
import { createOAuthCallbackClient } from "@/lib/supabase/route-handler";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const next = sanitizeNextPath(url.searchParams.get("next"));
  const redirectUrl = `${url.origin}${next}`;

  const loginOnError = `${url.origin}/login?error=auth_callback_error&next=${encodeURIComponent(next)}`;

  if (!code) {
    return NextResponse.redirect(loginOnError);
  }

  const supabase = createOAuthCallbackClient(request);
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.session) {
    const reason = error?.code ?? "no_session";
    const fail = NextResponse.redirect(
      `${loginOnError}&reason=${encodeURIComponent(reason)}`,
    );
    purgeAuthCookies(fail, request);
    return fail;
  }

  return buildSessionCompleteResponse(request, redirectUrl, data.session);
}
