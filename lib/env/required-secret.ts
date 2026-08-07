/** Resolve a required secret. In production, only the dedicated env var is accepted. */
export function requireSecret(name: string, devFallback?: string): string {
  const value = process.env[name];
  if (value) return value;

  if (process.env.NODE_ENV !== "production" && devFallback) {
    return devFallback;
  }

  throw new Error(`${name} is required${devFallback ? ` (dev may set ${devFallback.split("=")[0]})` : ""}`);
}

/**
 * Every secret `requireSecret` demands in production.
 *
 * Each of these has a development fallback (usually EMAIL_*_SECRET or
 * CRON_SECRET), so a missing var is invisible locally and throws only once
 * deployed — from deep inside a crypto helper, at request time, on a code path
 * a studio owner triggers rather than a health check. That asymmetry is the
 * whole reason this list exists: it is the only place the production
 * requirement is written down, and `tests/env-required-secrets.test.ts` fails
 * if a `requireSecret` call site is added without an entry here.
 *
 * `breaks` is user-facing in the sense that it tells whoever reads a
 * /api/health/secrets response what is actually down, not just which string is
 * absent.
 */
export type RequiredSecret = {
  name: string;
  /** What stops working in production when this is unset. */
  breaks: string;
};

export const PRODUCTION_REQUIRED_SECRETS: readonly RequiredSecret[] = [
  {
    name: "EMAIL_TOKEN_ENCRYPTION_KEY",
    breaks: "Reading or storing connected mailbox tokens",
  },
  {
    name: "EMAIL_OAUTH_STATE_SECRET",
    breaks: "Connecting a mailbox (OAuth state signing)",
  },
  {
    name: "XERO_TOKEN_ENCRYPTION_KEY",
    breaks: "Reading or storing Xero tokens — all ledger sync",
  },
  {
    name: "XERO_OAUTH_STATE_SECRET",
    breaks: "Connecting Xero (OAuth state signing)",
  },
  {
    name: "ADVERTISING_TOKEN_ENCRYPTION_KEY",
    breaks: "Reading or storing social/ad platform credentials",
  },
  {
    name: "ADVERTISING_OAUTH_STATE_SECRET",
    breaks: "Connecting a social/ad platform (OAuth state signing)",
  },
  {
    name: "STRIPE_CONNECT_STATE_SECRET",
    breaks: "Stripe Connect onboarding — a studio cannot take payments",
  },
  {
    name: "INTEGRATIONS_TOKEN_ENCRYPTION_KEY",
    breaks: "Every API-key connection in Settings → Connections",
  },
  {
    name: "INTEGRATIONS_OAUTH_STATE_SECRET",
    breaks: "Connections-hub OAuth (Mailchimp and friends)",
  },
] as const;

/**
 * Which required secrets have no value in this environment.
 *
 * Returns entries, not just names, so callers can report the consequence.
 * Never returns or logs a secret's value.
 */
export function missingProductionSecrets(
  env: Record<string, string | undefined> = process.env,
): RequiredSecret[] {
  return PRODUCTION_REQUIRED_SECRETS.filter(
    (secret) => !env[secret.name]?.trim(),
  );
}
