// ============================================================================
//  Explicit error reporting for handlers that swallow their own failures.
//
//  Sentry's Next.js instrumentation reports errors that *propagate* out of a
//  route handler, server component or server action. Our webhook and cron
//  routes deliberately don't propagate: they catch, log, and return a 500 or a
//  partial-success JSON body so Stripe retries and Vercel's cron log stays
//  readable. Those are precisely the failures we most need to hear about —
//  a webhook that stops finalising invoices is silent revenue loss — so they
//  have to be reported by hand.
//
//  Two things this wrapper adds over calling Sentry.captureException directly:
//
//    • a `route` tag, so alert rules can key on "any failure in a cron route"
//      without matching on stack frames;
//    • an awaited flush. On Vercel the function can be frozen the moment the
//      response is returned, and an un-flushed event dies with it.
// ============================================================================

import * as Sentry from "@sentry/nextjs";

/** How long to wait for the event to reach Sentry before giving up (ms). */
const FLUSH_TIMEOUT_MS = 2_000;

export type ReportContext = {
  /** Stable identifier for the failing surface, e.g. "webhook.stripe". */
  route: string;
  /** Extra searchable tags — keep these low-cardinality. */
  tags?: Record<string, string>;
  /** Anything else useful for triage. Never put member PII in here. */
  extra?: Record<string, unknown>;
};

/**
 * Reports an error that the caller is handling itself, then flushes.
 *
 * Awaiting this before returning a response costs up to FLUSH_TIMEOUT_MS on the
 * error path only. Never throws: an observability failure must not turn a
 * handled 500 into an unhandled one.
 */
export async function reportHandledError(error: unknown, context: ReportContext): Promise<void> {
  try {
    Sentry.withScope((scope) => {
      scope.setTag("route", context.route);
      for (const [key, value] of Object.entries(context.tags ?? {})) {
        scope.setTag(key, value);
      }
      if (context.extra) scope.setContext("details", context.extra);
      Sentry.captureException(error);
    });
    await Sentry.flush(FLUSH_TIMEOUT_MS);
  } catch {
    /* reporting must never break the request it is reporting on */
  }
}

/**
 * Same, for a failure we detect without an Error object — a Supabase error
 * row, a provider returning `{ ok: false }`. Sentry groups messages far worse
 * than exceptions, so give it a stable `message` and put the variable part in
 * `extra`.
 */
export async function reportHandledMessage(message: string, context: ReportContext): Promise<void> {
  await reportHandledError(new Error(message), context);
}
