// ============================================================================
//  Shared Sentry init values — one source of truth for the client, server and
//  edge configs so they can't drift apart.
//
//  Everything here degrades to "Sentry off" when NEXT_PUBLIC_SENTRY_DSN is
//  unset: `enabled: false` means the SDK installs but never sends, so local
//  dev, CI builds and forks behave exactly as they did before this landed.
// ============================================================================

import { scrubEvent, type ScrubbableEvent } from "@/lib/observability/scrub";

export const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN ?? "";

/** Sentry only sends when a DSN is configured. */
export const SENTRY_ENABLED = SENTRY_DSN.length > 0;

/**
 * Which deployment an event came from. VERCEL_ENV is "production" | "preview" |
 * "development" and is the distinction that actually matters when triaging —
 * a preview deploy blowing up is not an incident.
 */
export const SENTRY_ENVIRONMENT =
  process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ||
  process.env.NEXT_PUBLIC_VERCEL_ENV ||
  process.env.VERCEL_ENV ||
  process.env.NODE_ENV ||
  "development";

/**
 * Ties an event to the commit that produced it. Vercel exposes the SHA at
 * build time; locally there is none, which is fine — local events are grouped
 * under no release.
 */
export const SENTRY_RELEASE =
  process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_GIT_COMMIT_SHA || undefined;

/**
 * Performance sampling. Tracing is the expensive half of Sentry's quota and we
 * are here for errors first, so production samples 10% of transactions unless
 * SENTRY_TRACES_SAMPLE_RATE says otherwise. Preview/dev sample everything so a
 * trace is actually there when you go looking during development.
 */
export function tracesSampleRate(): number {
  const override = Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE);
  if (Number.isFinite(override) && override >= 0 && override <= 1) return override;
  return SENTRY_ENVIRONMENT === "production" ? 0.1 : 1;
}

/**
 * beforeSend hook shared by all three runtimes. Typed structurally so this
 * module stays free of @sentry/* imports — see lib/observability/scrub.ts for
 * why the scrubbing exists at all.
 */
export function beforeSend<T extends ScrubbableEvent>(event: T): T {
  return scrubEvent(event);
}
