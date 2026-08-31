import { NextRequest, NextResponse } from "next/server";
import { getAdminEmailContext } from "@/lib/email/admin-context";
import { signOAuthState } from "@/lib/email/oauth-state";
import { resolveAppOrigin } from "@/lib/email/app-origin";
import { microsoftAuthUrl } from "@/lib/email/providers/microsoft";
import { CONNECTIONS_PATH } from "@/lib/integrations/routes";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const ctx = await getAdminEmailContext();
  if (ctx.error !== null) {
    return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(CONNECTIONS_PATH)}`, req.url));
  }

  try {
    const redirectUri = `${resolveAppOrigin(req)}/api/email/oauth/microsoft/callback`;
    const state = signOAuthState({
      studioId: ctx.studioId,
      userId: ctx.userId,
      provider: "microsoft",
      exp: Date.now() + 10 * 60 * 1000,
    });
    return NextResponse.redirect(microsoftAuthUrl(redirectUri, state));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "OAuth not configured";
    return NextResponse.redirect(new URL(`${CONNECTIONS_PATH}?error=${encodeURIComponent(msg)}`, req.url));
  }
}
