// ============================================================================
//  GET /api/integrations/[provider]/callback
//
//  Generic OAuth2 callback: verify the signed state, re-check admin role
//  (state alone is not authorisation), swap the code for tokens, and store the
//  encrypted token set in studio_integrations.
//
//  Storing tokens is as far as this goes for QuickBooks and MYOB — their sync
//  code doesn't exist yet, which is why both are `beta` in the catalog and the
//  hub says so on the card. Connecting is still worth doing: it proves the app
//  registration and gets studios queued up ahead of the sync work.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifyAdminOAuthCallback } from "@/lib/oauth/verify-admin-callback";
import { resolveAppOrigin } from "@/lib/email/app-origin";
import {
  driverRedirectUri,
  exchangeCodeForTokens,
  getDriver,
} from "@/lib/integrations/oauth-drivers";
import { verifyIntegrationOAuthState } from "@/lib/integrations/oauth-state";
import { encryptIntegrationSecrets } from "@/lib/integrations/crypto";
import { CONNECTIONS_PATH } from "@/lib/integrations/routes";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;
  const origin = resolveAppOrigin(req);
  const base = `${origin}${CONNECTIONS_PATH}`;
  const fail = (message: string) =>
    NextResponse.redirect(new URL(`${base}?error=${encodeURIComponent(message)}`, req.url));

  const driver = getDriver(provider);
  if (!driver) return fail("Unknown integration");

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const oauthError = req.nextUrl.searchParams.get("error");

  if (oauthError || !code || !state) {
    return fail(oauthError ?? "Authorization cancelled");
  }

  const payload = verifyIntegrationOAuthState(state);
  if (!payload || payload.provider !== driver.id) return fail("Invalid OAuth state");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.id !== payload.userId) {
    return NextResponse.redirect(
      new URL(`/login?next=${encodeURIComponent(CONNECTIONS_PATH)}`, req.url),
    );
  }

  const authz = await verifyAdminOAuthCallback(supabase, user, payload);
  if (!authz.ok) return fail(authz.reason);

  try {
    const redirectUri = driverRedirectUri(driver, req.nextUrl.origin);
    const tokens = await exchangeCodeForTokens(driver, code, redirectUri);
    const account = driver.resolveAccount(req.nextUrl.searchParams, tokens);

    const { error } = await supabase.from("studio_integrations").upsert(
      {
        studio_id: payload.studioId,
        provider: driver.id,
        status: "connected",
        display_name: account.label,
        external_account_id: account.externalId,
        credentials_encrypted: encryptIntegrationSecrets({
          kind: "oauth",
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken ?? "",
          expiresAt: tokens.expiresAt ? String(tokens.expiresAt) : "",
          tokenType: tokens.tokenType ?? "",
        }),
        scopes: tokens.scope ? tokens.scope.split(/[\s,]+/).filter(Boolean) : driver.scopes,
        metadata: {},
        last_verified_at: new Date().toISOString(),
        last_error: null,
        connected_by: user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "studio_id,provider" },
    );

    if (error) throw new Error(error.message);
    return NextResponse.redirect(new URL(`${base}?connected=${driver.id}`, req.url));
  } catch (err) {
    return fail(err instanceof Error ? err.message : `Failed to connect ${driver.id}`);
  }
}
