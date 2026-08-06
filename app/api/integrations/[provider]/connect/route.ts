// ============================================================================
//  GET /api/integrations/[provider]/connect
//
//  Generic OAuth2 kick-off for catalog providers backed by a driver
//  (lib/integrations/oauth-drivers.ts) rather than a bespoke SDK. QuickBooks
//  and MYOB today; anything authorization-code shaped tomorrow.
//
//  Everything lands back on Settings → Connections, which is now the single
//  home for connection state.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { getAdminStudio } from "@/lib/portal/access";
import {
  buildAuthorizeUrl,
  driverRedirectUri,
  getDriver,
  isDriverConfigured,
} from "@/lib/integrations/oauth-drivers";
import { signIntegrationOAuthState } from "@/lib/integrations/oauth-state";
import { CONNECTIONS_PATH } from "@/lib/integrations/routes";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;
  const driver = getDriver(provider);

  if (!driver) {
    return NextResponse.redirect(
      new URL(`${CONNECTIONS_PATH}?error=Unknown+integration`, req.url),
    );
  }

  const ctx = await getAdminStudio();
  if (ctx.error || !ctx.studioId || !ctx.userId) {
    return NextResponse.redirect(
      new URL(`/login?next=${encodeURIComponent(CONNECTIONS_PATH)}`, req.url),
    );
  }

  if (!isDriverConfigured(driver)) {
    return NextResponse.redirect(
      new URL(
        `${CONNECTIONS_PATH}?error=${encodeURIComponent(
          `${driver.clientIdEnv} and ${driver.clientSecretEnv} are not set on this deployment`,
        )}`,
        req.url,
      ),
    );
  }

  const state = signIntegrationOAuthState({
    studioId: ctx.studioId,
    userId: ctx.userId,
    provider: driver.id,
    exp: Date.now() + 10 * 60 * 1000,
  });

  const redirectUri = driverRedirectUri(driver, req.nextUrl.origin);
  return NextResponse.redirect(buildAuthorizeUrl(driver, redirectUri, state));
}
