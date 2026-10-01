import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { encryptTokenSet } from "@/lib/xero/crypto";
import { exchangeXeroCallback } from "@/lib/xero/client";
import { xeroRedirectUri } from "@/lib/xero/config";
import { verifyXeroOAuthState } from "@/lib/xero/oauth-state";
import { verifyAdminOAuthCallback } from "@/lib/oauth/verify-admin-callback";
import { resolveAppOrigin } from "@/lib/email/app-origin";
import { DEFAULT_XERO_SETTINGS } from "@/lib/xero/types";
import { ACCOUNTING_PATH, accountingPath } from "@/lib/integrations/routes";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const oauthError = req.nextUrl.searchParams.get("error");
  const origin = resolveAppOrigin(req);
  const back = (banner: { connected?: string; error?: string }) =>
    NextResponse.redirect(new URL(`${origin}${accountingPath(banner)}`, req.url));

  if (oauthError || !code || !state) {
    return back({ error: oauthError ?? "Authorization cancelled" });
  }

  const payload = verifyXeroOAuthState(state);
  if (!payload) return back({ error: "invalidState" });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.id !== payload.userId) {
    return NextResponse.redirect(
      new URL(`/login?next=${encodeURIComponent(ACCOUNTING_PATH)}`, req.url),
    );
  }

  const authz = await verifyAdminOAuthCallback(supabase, user, payload);
  if (!authz.ok) return back({ error: authz.reason });

  // Re-checked here, not just at /connect: Books could have been set up in
  // another tab while the studio was on Xero's consent screen.
  const { data: studio } = await supabase
    .from("studios")
    .select("accounting_provider")
    .eq("id", payload.studioId)
    .maybeSingle();
  if (studio?.accounting_provider === "olune") {
    return back({ error: "booksChosen" });
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

    // Connecting Xero *is* choosing it.
    const { error: choiceError } = await supabase
      .from("studios")
      .update({ accounting_provider: "xero" })
      .eq("id", payload.studioId);
    if (choiceError) throw new Error(choiceError.message);

    return back({ connected: "xero" });
  } catch (err) {
    return back({ error: err instanceof Error ? err.message : "Failed to connect Xero" });
  }
}
