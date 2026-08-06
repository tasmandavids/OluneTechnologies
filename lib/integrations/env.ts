import "server-only";

// ============================================================================
//  "Is this provider available on this deployment?" — a provider can be in the
//  catalog and still be unusable because the operator hasn't set its platform
//  credentials. The hub shows those cards greyed with an honest reason rather
//  than a Connect button that dead-ends in an error redirect.
//
//  API-key providers need nothing from the platform: the studio supplies the
//  credential, so they're always available.
// ============================================================================

import type { IntegrationProvider } from "./types";

/** Some env vars have a legacy alias; accept either. */
const ENV_ALIASES: Record<string, string[]> = {
  GOOGLE_MAIL_CLIENT_ID: ["GOOGLE_OAUTH_CLIENT_ID"],
  GOOGLE_MAIL_CLIENT_SECRET: ["GOOGLE_OAUTH_CLIENT_SECRET"],
};

function hasEnv(name: string): boolean {
  if (process.env[name]) return true;
  return (ENV_ALIASES[name] ?? []).some((alias) => Boolean(process.env[alias]));
}

export function isProviderConfigured(provider: IntegrationProvider): boolean {
  if (provider.auth.kind === "api_key" || provider.auth.kind === "credentials") return true;
  if (provider.auth.kind === "none") return false;
  const required = provider.requiredEnv ?? [];
  if (required.length === 0) return true;
  return required.every(hasEnv);
}

/** Which env vars are missing — surfaced to admins so they know what to ask for. */
export function missingProviderEnv(provider: IntegrationProvider): string[] {
  if (provider.auth.kind !== "oauth") return [];
  return (provider.requiredEnv ?? []).filter((name) => !hasEnv(name));
}
