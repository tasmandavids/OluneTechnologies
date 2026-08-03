import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { encryptTokenSet } from "@/lib/xero/crypto";
import { exchangeXeroCallback } from "@/lib/xero/client";
import { xeroRedirectUri } from "@/lib/xero/config";
import { verifyXeroOAuthState } from "@/lib/xero/oauth-state";
import { verifyAdminOAuthCallback } from "@/lib/oauth/verify-admin-callback";
import { resolveAppOrigin } from "@/lib/email/app-origin";
import { DEFAULT_XERO_SETTINGS } from "@/lib/xero/types";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const oauthError = req.nextUrl.searchParams.get("error");
  const origin = resolveAppOrigin(req);
  const base = `${origin}/portal/admin/money?tab=reports`;

  if (oauthError || !code || !state) {
    return NextResponse.redirect(
      new URL(`${base}&error=${encodeURIComponent(oauthError ?? "Authorization cancelled")}`, req.url),
    );
  }

  const payload = verifyXeroOAuthState(state);
  if (!payload) {
    return NextResponse.redirect(new URL(`${base}&error=Invalid+OAuth+state`, req.url));
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.id !== payload.userId) {
    return NextResponse.redirect(
      new URL(`/login?next=${encodeURIComponent("/portal/admin/money?tab=reports")}`, req.url),
    );
  }

  const authz = await verifyAdminOAuthCallback(supabase, user, payload);
  if (!authz.ok) {
    return NextResponse.redirect(
      new URL(`${base}&error=${encodeURIComponent(authz.reason)}`, req.url),
    );
  }

  try {
    const redirectUri = xeroRedirectUri(req.nextUrl.origin);
    const result = await exchangeXeroCallback(req.url, redirectUri, state);

    const { error } = await supabase.from("xero_connections").upsert(
      {
        studio_id: payload.studioId,
        tenant_id: result.tenantId,
        tenant_name: result.tenantName,
        org_short_code: result.orgShortCode,
        credentials_encrypted: encryptTokenSet(result.tokens),
        connected_by: user.id,
        sync_error: null,
        settings: DEFAULT_XERO_SETTINGS,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "studio_id" },
    );

    if (error) throw new Error(error.message);
    return NextResponse.redirect(new URL(`${base}&connected=1`, req.url));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to connect Xero";
    return NextResponse.redirect(new URL(`${base}&error=${encodeURIComponent(msg)}`, req.url));
  }
}
