import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { encryptCredentials } from "@/lib/email/crypto";
import { verifyOAuthState } from "@/lib/email/oauth-state";
import { verifyAdminOAuthCallback } from "@/lib/oauth/verify-admin-callback";
import { resolveAppOrigin } from "@/lib/email/app-origin";
import { exchangeGmailCode } from "@/lib/email/providers/gmail";
import { CONNECTIONS_PATH } from "@/lib/integrations/routes";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const oauthError = req.nextUrl.searchParams.get("error");
  const origin = resolveAppOrigin(req);
  const base = `${origin}${CONNECTIONS_PATH}`;

  if (oauthError || !code || !state) {
    return NextResponse.redirect(new URL(`${base}?error=${encodeURIComponent(oauthError ?? "Authorization cancelled")}`, req.url));
  }

  const payload = verifyOAuthState(state);
  if (!payload || payload.provider !== "gmail") {
    return NextResponse.redirect(new URL(`${base}?error=Invalid+OAuth+state`, req.url));
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.id !== payload.userId) {
    return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(CONNECTIONS_PATH)}`, req.url));
  }

  const authz = await verifyAdminOAuthCallback(supabase, user, payload);
  if (!authz.ok) {
    return NextResponse.redirect(
      new URL(`${base}?error=${encodeURIComponent(authz.reason)}`, req.url),
    );
  }

  try {
    const redirectUri = `${origin}/api/email/oauth/google/callback`;
    const result = await exchangeGmailCode(code, redirectUri);
    const { email, displayName, ...creds } = result;

    const { error } = await supabase.from("email_accounts").upsert(
      {
        studio_id: payload.studioId,
        provider: "gmail",
        email_address: email.toLowerCase(),
        display_name: displayName,
        credentials_encrypted: encryptCredentials(creds),
        connected_by: user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "studio_id,email_address" },
    );

    if (error) throw new Error(error.message);
    return NextResponse.redirect(new URL(`${base}?connected=gmail`, req.url));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to connect Gmail";
    return NextResponse.redirect(new URL(`${base}?error=${encodeURIComponent(msg)}`, req.url));
  }
}
