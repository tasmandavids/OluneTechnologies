import type { EmailOtpType } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { sanitizeNextPath } from "@/lib/auth/oauth";
import {
  buildSessionCompleteResponse,
  purgeAuthCookies,
} from "@/lib/supabase/auth-cookies";
import { createOAuthCallbackClient } from "@/lib/supabase/route-handler";

const OTP_TYPES = new Set(["invite", "recovery", "magiclink", "signup", "email"]);

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const next = sanitizeNextPath(url.searchParams.get("next"));
  const redirectUrl = `${url.origin}${next}`;

  const loginOnError = `${url.origin}/login?error=auth_callback_error&next=${encodeURIComponent(next)}`;

  const tokenHash = url.searchParams.get("token_hash");
  const otpType = url.searchParams.get("type");

  if (!code && !(tokenHash && otpType && OTP_TYPES.has(otpType))) {
    return NextResponse.redirect(loginOnError);
  }

  const supabase = createOAuthCallbackClient(request);
  // Invite / recovery links carry a token_hash redeemed server-side (audit A-04);
  // OAuth and PKCE flows carry a code.
  const { data, error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : await supabase.auth.verifyOtp({ token_hash: tokenHash!, type: otpType as EmailOtpType });

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
