import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { encryptSocialCredentials } from "@/lib/advertising/crypto";
import { tiktokRedirectUri } from "@/lib/advertising/config";
import { verifyAdvertisingOAuthState } from "@/lib/advertising/oauth-state";
import { exchangeTiktokCode } from "@/lib/advertising/publish";
import { verifyAdminOAuthCallback } from "@/lib/oauth/verify-admin-callback";
import { resolveAppOrigin } from "@/lib/email/app-origin";
import { CONNECTIONS_PATH } from "@/lib/integrations/routes";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const oauthError = req.nextUrl.searchParams.get("error");
  const origin = resolveAppOrigin(req);
  const base = `${origin}${CONNECTIONS_PATH}`;

  if (oauthError || !code || !state) {
    return NextResponse.redirect(
      new URL(`${base}?error=${encodeURIComponent(oauthError ?? "Authorization cancelled")}`, req.url),
    );
  }

  const payload = verifyAdvertisingOAuthState(state);
  if (!payload || payload.platform !== "tiktok") {
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
    const redirectUri = tiktokRedirectUri(req.nextUrl.origin);
    const tokens = await exchangeTiktokCode(code, redirectUri);

    const { error } = await supabase.from("social_connections").upsert(
      {
        studio_id: payload.studioId,
        platform: "tiktok",
        account_id: tokens.openId,
        account_name: "TikTok Account",
        credentials_encrypted: encryptSocialCredentials({
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresAt: Date.now() + tokens.expiresIn * 1000,
        }),
        connected_by: user.id,
        sync_error: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "studio_id,platform" },
    );

    if (error) throw new Error(error.message);
    return NextResponse.redirect(new URL(`${base}?connected=tiktok`, req.url));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to connect TikTok";
    return NextResponse.redirect(new URL(`${base}?error=${encodeURIComponent(msg)}`, req.url));
  }
}
