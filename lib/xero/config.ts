import { xeroOAuthCallbackUrl } from "@/lib/app-url";
import { XERO_SCOPES } from "./types";

export function xeroClientId(): string {
  const id = process.env.XERO_CLIENT_ID;
  if (!id) throw new Error("XERO_CLIENT_ID is not configured");
  return id;
}

export function xeroClientSecret(): string {
  const secret = process.env.XERO_CLIENT_SECRET;
  if (!secret) throw new Error("XERO_CLIENT_SECRET is not configured");
  return secret;
}

/**
 * Webhook signing key from the Xero developer portal (App → Webhooks →
 * "Signing key"). Used to verify the HMAC on every inbound webhook POST.
 */
export function xeroWebhookKey(): string {
  const key = process.env.XERO_WEBHOOK_KEY;
  if (!key) throw new Error("XERO_WEBHOOK_KEY is not configured");
  return key;
}

/** Canonical OAuth callback — never use tenant subdomains (e.g. slug.localhost). */
export function xeroRedirectUri(_origin?: string): string {
  if (process.env.NODE_ENV === "development" && _origin) {
    return `${_origin.replace(/\/$/, "")}/api/xero/oauth/callback`;
  }
  return xeroOAuthCallbackUrl();
}

/** Used by webhooks/cron where no request origin is available. */
export function xeroRedirectUriForJobs(): string {
  return xeroOAuthCallbackUrl();
}

export function isXeroConfigured(): boolean {
  return Boolean(process.env.XERO_CLIENT_ID && process.env.XERO_CLIENT_SECRET);
}

export { XERO_SCOPES };
