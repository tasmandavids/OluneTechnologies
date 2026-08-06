import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { encryptSocialCredentials } from "@/lib/advertising/crypto";
import { metaRedirectUri } from "@/lib/advertising/config";
import { verifyAdvertisingOAuthState } from "@/lib/advertising/oauth-state";
import { exchangeMetaCode, fetchMetaPages, fetchMetaPageAccessToken } from "@/lib/advertising/publish";
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
  if (!payload) {
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
    const redirectUri = metaRedirectUri(req.nextUrl.origin);
    const tokens = await exchangeMetaCode(code, redirectUri);
    const pages = await fetchMetaPages(tokens.accessToken);
    const primaryPage = pages[0];
    const pageAccessToken =
      primaryPage?.accessToken ??
      (primaryPage ? await fetchMetaPageAccessToken(tokens.accessToken, primaryPage.id) : tokens.accessToken);

    const credentials = encryptSocialCredentials({
      accessToken: pageAccessToken,
      refreshToken: tokens.accessToken,
      expiresAt: Date.now() + tokens.expiresIn * 1000,
      meta: { userAccessToken: tokens.accessToken, pageId: primaryPage?.id ?? "" },
    });

    const now = new Date().toISOString();

    await supabase.from("social_connections").upsert(
      {
        studio_id: payload.studioId,
        platform: "facebook",
        account_id: primaryPage?.id ?? null,
        account_name: primaryPage?.name ?? "Facebook Page",
        credentials_encrypted: credentials,
        settings: { pageId: primaryPage?.id ?? "", pages: JSON.stringify(pages) },
        connected_by: user.id,
        sync_error: null,
        updated_at: now,
      },
      { onConflict: "studio_id,platform" },
    );

    if (primaryPage?.igUserId) {
      await supabase.from("social_connections").upsert(
        {
          studio_id: payload.studioId,
          platform: "instagram",
          account_id: primaryPage.igUserId,
          account_name: `${primaryPage.name} (Instagram)`,
          credentials_encrypted: credentials,
          settings: { igUserId: primaryPage.igUserId, pageId: primaryPage.id },
          connected_by: user.id,
          sync_error: null,
          updated_at: now,
        },
        { onConflict: "studio_id,platform" },
      );
    }

    return NextResponse.redirect(new URL(`${base}?connected=meta`, req.url));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to connect Meta";
    return NextResponse.redirect(new URL(`${base}?error=${encodeURIComponent(msg)}`, req.url));
  }
}
