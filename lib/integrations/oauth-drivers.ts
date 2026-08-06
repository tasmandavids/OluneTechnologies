import "server-only";

// ============================================================================
//  Generic OAuth2 drivers for integrations that don't have (and don't need) a
//  bespoke SDK the way Xero and Stripe do.
//
//  A driver knows four things: where to send the studio, how to swap the code
//  for tokens, what to call the resulting account, and which env vars it needs.
//  Adding another authorization-code provider is one entry in DRIVERS plus a
//  catalog row — the connect/callback routes are already generic.
//
//  Scope note: QuickBooks and MYOB currently *connect* only. Tokens are stored
//  encrypted against the studio; no ledger sync reads them yet. The catalog
//  marks both `beta` and their cards say so.
// ============================================================================

import { canonicalAppUrl } from "@/lib/app-url";

export type OAuthTokenSet = {
  accessToken: string;
  refreshToken: string | null;
  /** Epoch millis, or null when the provider doesn't say. */
  expiresAt: number | null;
  tokenType: string | null;
  scope: string | null;
};

export type ResolvedAccount = {
  externalId: string | null;
  label: string;
};

export type OAuthDriver = {
  id: string;
  authorizeUrl: string;
  tokenUrl: string;
  scopes: string[];
  clientIdEnv: string;
  clientSecretEnv: string;
  /** Extra query params on the authorize request. */
  extraAuthorizeParams?: Record<string, string>;
  /**
   * Name the connection from the callback query and token response. Kept
   * synchronous and cheap — a friendly label, not a full account fetch.
   */
  resolveAccount: (callbackParams: URLSearchParams, tokens: OAuthTokenSet) => ResolvedAccount;
};

export const DRIVERS: Record<string, OAuthDriver> = {
  quickbooks: {
    id: "quickbooks",
    authorizeUrl: "https://appcenter.intuit.com/connect/oauth2",
    tokenUrl: "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
    scopes: ["com.intuit.quickbooks.accounting"],
    clientIdEnv: "QUICKBOOKS_CLIENT_ID",
    clientSecretEnv: "QUICKBOOKS_CLIENT_SECRET",
    resolveAccount: (params) => {
      // Intuit returns the company id as `realmId` on the callback.
      const realmId = params.get("realmId");
      return {
        externalId: realmId,
        label: realmId ? `QuickBooks company ${realmId}` : "QuickBooks company",
      };
    },
  },
  myob: {
    id: "myob",
    authorizeUrl: "https://secure.myob.com/oauth2/account/authorize",
    tokenUrl: "https://secure.myob.com/oauth2/v1/authorize",
    scopes: ["CompanyFile"],
    clientIdEnv: "MYOB_CLIENT_ID",
    clientSecretEnv: "MYOB_CLIENT_SECRET",
    resolveAccount: () => ({
      // MYOB doesn't identify the company file until you list them with the
      // access token; the sync work will fill this in.
      externalId: null,
      label: "MYOB company file",
    }),
  },
};

export function getDriver(providerId: string): OAuthDriver | null {
  return DRIVERS[providerId] ?? null;
}

export function driverClientId(driver: OAuthDriver): string | null {
  return process.env[driver.clientIdEnv] ?? null;
}

export function driverClientSecret(driver: OAuthDriver): string | null {
  return process.env[driver.clientSecretEnv] ?? null;
}

export function isDriverConfigured(driver: OAuthDriver): boolean {
  return Boolean(driverClientId(driver) && driverClientSecret(driver));
}

export function driverRedirectUri(driver: OAuthDriver, origin?: string): string {
  const base =
    process.env.NODE_ENV === "development" && origin
      ? origin.replace(/\/$/, "")
      : canonicalAppUrl();
  return `${base}/api/integrations/${driver.id}/callback`;
}

export function buildAuthorizeUrl(
  driver: OAuthDriver,
  redirectUri: string,
  state: string,
): string {
  const url = new URL(driver.authorizeUrl);
  url.searchParams.set("client_id", driverClientId(driver) ?? "");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", driver.scopes.join(" "));
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  for (const [key, value] of Object.entries(driver.extraAuthorizeParams ?? {})) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

export async function exchangeCodeForTokens(
  driver: OAuthDriver,
  code: string,
  redirectUri: string,
): Promise<OAuthTokenSet> {
  const clientId = driverClientId(driver);
  const clientSecret = driverClientSecret(driver);
  if (!clientId || !clientSecret) {
    throw new Error(`${driver.clientIdEnv} and ${driver.clientSecretEnv} are required`);
  }

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    // MYOB wants the credentials in the body; Intuit accepts either but
    // documents Basic auth. Sending both is safe for these two.
    client_id: clientId,
    client_secret: clientSecret,
    scope: driver.scopes.join(" "),
  });

  const res = await fetch(driver.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: body.toString(),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${driver.id} token exchange failed (${res.status}): ${text.slice(0, 200)}`);
  }

  let json: Record<string, unknown>;
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(`${driver.id} returned a non-JSON token response`);
  }

  const accessToken = json.access_token as string | undefined;
  if (!accessToken) throw new Error(`${driver.id} token response had no access_token`);

  const expiresIn = Number(json.expires_in);
  return {
    accessToken,
    refreshToken: (json.refresh_token as string | undefined) ?? null,
    expiresAt: Number.isFinite(expiresIn) ? Date.now() + expiresIn * 1000 : null,
    tokenType: (json.token_type as string | undefined) ?? null,
    scope: (json.scope as string | undefined) ?? null,
  };
}
