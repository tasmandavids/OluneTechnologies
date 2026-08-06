import { NextRequest, NextResponse } from "next/server";
import { getAdminAdvertisingContext } from "@/lib/advertising/admin-context";
import { isMetaConfigured, metaRedirectUri } from "@/lib/advertising/config";
import { signAdvertisingOAuthState } from "@/lib/advertising/oauth-state";
import { buildMetaOAuthUrl } from "@/lib/advertising/publish";
import { CONNECTIONS_PATH } from "@/lib/integrations/routes";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const ctx = await getAdminAdvertisingContext();
  if (ctx.error || !ctx.studioId || !ctx.userId) {
    return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(CONNECTIONS_PATH)}`, req.url));
  }

  const { studioId, userId } = ctx;

  if (!isMetaConfigured()) {
    return NextResponse.redirect(
      new URL(`${CONNECTIONS_PATH}?error=Meta+OAuth+is+not+configured`, req.url),
    );
  }

  try {
    const redirectUri = metaRedirectUri(req.nextUrl.origin);
    const state = signAdvertisingOAuthState({
      studioId,
      userId,
      platform: "facebook",
      exp: Date.now() + 10 * 60 * 1000,
    });
    const url = buildMetaOAuthUrl(redirectUri, state);
    return NextResponse.redirect(url);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "OAuth not configured";
    return NextResponse.redirect(
      new URL(`${CONNECTIONS_PATH}?error=${encodeURIComponent(msg)}`, req.url),
    );
  }
}
