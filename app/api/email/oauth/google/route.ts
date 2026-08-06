import { NextRequest, NextResponse } from "next/server";
import { getAdminEmailContext } from "@/lib/email/admin-context";
import { signOAuthState } from "@/lib/email/oauth-state";
import { resolveAppOrigin } from "@/lib/email/app-origin";
import { gmailAuthUrl } from "@/lib/email/providers/gmail";
import { CONNECTIONS_PATH } from "@/lib/integrations/routes";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const ctx = await getAdminEmailContext();
  if (ctx.error) {
    return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(CONNECTIONS_PATH)}`, req.url));
  }

  try {
    const redirectUri = `${resolveAppOrigin(req)}/api/email/oauth/google/callback`;
    const state = signOAuthState({
      studioId: ctx.studioId,
      userId: ctx.userId,
      provider: "gmail",
      exp: Date.now() + 10 * 60 * 1000,
    });
    const url = gmailAuthUrl(redirectUri, state);
    return NextResponse.redirect(url);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "OAuth not configured";
    return NextResponse.redirect(new URL(`${CONNECTIONS_PATH}?error=${encodeURIComponent(msg)}`, req.url));
  }
}
