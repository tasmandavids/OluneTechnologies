import { XeroClient, type TokenSetParameters } from "xero-node";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptTokenSet, encryptTokenSet } from "./crypto";
import { xeroClientId, xeroClientSecret, xeroRedirectUri, XERO_SCOPES } from "./config";
import type { XeroConnectionRow, XeroTokenSet } from "./types";

export type LoadedXeroClient = {
  client: XeroClient;
  connection: XeroConnectionRow;
  tenantId: string;
};

function tokenSetFromStored(stored: XeroTokenSet): TokenSetParameters {
  return {
    access_token: stored.access_token,
    refresh_token: stored.refresh_token,
    token_type: stored.token_type ?? "Bearer",
    expires_at: stored.expires_at,
    scope: Array.isArray(stored.scope) ? stored.scope.join(" ") : stored.scope,
    id_token: stored.id_token,
  };
}

function storedFromTokenSet(tokenSet: {
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
  token_type?: string;
  scope?: string | string[];
  id_token?: string;
}): XeroTokenSet {
  return {
    access_token: tokenSet.access_token ?? "",
    refresh_token: tokenSet.refresh_token,
    expires_at: tokenSet.expires_at,
    token_type: tokenSet.token_type,
    scope: tokenSet.scope,
    id_token: tokenSet.id_token,
  };
}

export function createBareXeroClient(redirectUri: string, state?: string): XeroClient {
  return new XeroClient({
    clientId: xeroClientId(),
    clientSecret: xeroClientSecret(),
    redirectUris: [redirectUri],
    scopes: XERO_SCOPES,
    state,
  });
}

export async function persistConnectionTokens(
  supabase: SupabaseClient,
  connectionId: string,
  tokens: XeroTokenSet,
) {
  await supabase
    .from("xero_connections")
    .update({
      credentials_encrypted: encryptTokenSet(tokens),
      updated_at: new Date().toISOString(),
    })
    .eq("id", connectionId);
}

export async function loadStudioXeroClient(
  supabase: SupabaseClient,
  studioId: string,
  redirectUri: string,
): Promise<LoadedXeroClient | null> {
  const { data: connection } = await supabase
    .from("xero_connections")
    .select("*")
    .eq("studio_id", studioId)
    .maybeSingle();

  if (!connection) return null;

  const row = connection as XeroConnectionRow;
  const stored = decryptTokenSet(row.credentials_encrypted);
  const client = createBareXeroClient(redirectUri);
  // Avoid Issuer.discover on read paths — openid-client triggers Node DEP0169 (url.parse).
  client.setTokenSet(tokenSetFromStored(stored));

  const expiresAt = stored.expires_at ?? 0;
  const needsRefresh = !expiresAt || expiresAt * 1000 < Date.now() + 60_000;
  if (needsRefresh && stored.refresh_token) {
    const refreshed = await client.refreshWithRefreshToken(
      xeroClientId(),
      xeroClientSecret(),
      stored.refresh_token,
    );
    const next = storedFromTokenSet(refreshed);
    await persistConnectionTokens(supabase, row.id, next);
    client.setTokenSet(refreshed);
  }

  return {
    client,
    connection: row,
    tenantId: row.tenant_id,
  };
}

export async function exchangeXeroCallback(
  callbackUrl: string,
  redirectUri: string,
  state: string,
): Promise<{
  tokens: XeroTokenSet;
  tenantId: string;
  tenantName: string;
  orgShortCode: string | null;
}> {
  const client = createBareXeroClient(redirectUri, state);
  await client.initialize();
  const tokenSet = await client.apiCallback(callbackUrl);
  const tokens = storedFromTokenSet(tokenSet);
  await client.updateTenants(true);
  const tenant = client.tenants[0];
  if (!tenant) throw new Error("No Xero organisation was authorised");

  return {
    tokens,
    tenantId: tenant.tenantId as string,
    tenantName: (tenant.tenantName as string) ?? "Xero organisation",
    orgShortCode: (tenant.orgData?.shortCode as string | undefined) ?? null,
  };
}

export async function revokeXeroConnection(
  supabase: SupabaseClient,
  studioId: string,
  redirectUri: string,
): Promise<void> {
  const loaded = await loadStudioXeroClient(supabase, studioId, redirectUri);
  if (loaded) {
    try {
      await loaded.client.initialize();
      await loaded.client.revokeToken();
    } catch {
      /* token may already be invalid */
    }
  }
  const { error } = await supabase.from("xero_connections").delete().eq("studio_id", studioId);
  if (error) throw new Error(error.message);
}

export { xeroRedirectUri };
