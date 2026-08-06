import { NextRequest, NextResponse } from "next/server";
import { getAdminAdvertisingContext } from "@/lib/advertising/admin-context";
import { isTiktokConfigured, tiktokRedirectUri } from "@/lib/advertising/config";
import { signAdvertisingOAuthState } from "@/lib/advertising/oauth-state";
import { buildTiktokOAuthUrl } from "@/lib/advertising/publish";
import { CONNECTIONS_PATH } from "@/lib/integrations/routes";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const ctx = await getAdminAdvertisingContext();
  if (ctx.error || !ctx.studioId || !ctx.userId) {
    return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(CONNECTIONS_PATH)}`, req.url));
  }

  const { studioId, userId } = ctx;

  if (!isTiktokConfigured()) {
    return NextResponse.redirect(
      new URL(`${CONNECTIONS_PATH}?error=TikTok+OAuth+is+not+configured`, req.url),
    );
  }

  try {
    const redirectUri = tiktokRedirectUri(req.nextUrl.origin);
    const state = signAdvertisingOAuthState({
      studioId,
      userId,
      platform: "tiktok",
      exp: Date.now() + 10 * 60 * 1000,
    });
    const url = buildTiktokOAuthUrl(redirectUri, state);
    return NextResponse.redirect(url);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "OAuth not configured";
    return NextResponse.redirect(
      new URL(`${CONNECTIONS_PATH}?error=${encodeURIComponent(msg)}`, req.url),
    );
  }
}
