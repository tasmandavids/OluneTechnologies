// ============================================================================
//  Sentry — browser runtime.
//
//  Next 15 loads this file automatically on the client (it replaces the old
//  sentry.client.config.ts). Two deliberate omissions:
//
//    • No Session Replay. It records the DOM, and our DOM is a roll-call sheet
//      with children's names on it. Not without a privacy review and a studio-
//      facing disclosure.
//    • No profiling. Errors first; the quota is better spent on them.
//
//  The browser SDK posts to the DSN's ingest host, which our CSP has to allow
//  — next.config.ts derives that host from the DSN so the two can't drift.
// ============================================================================

import * as Sentry from "@sentry/nextjs";
import {
  SENTRY_DSN,
  SENTRY_ENABLED,
  SENTRY_ENVIRONMENT,
  SENTRY_RELEASE,
  beforeSend,
  tracesSampleRate,
} from "@/lib/observability/config";

Sentry.init({
  dsn: SENTRY_DSN,
  enabled: SENTRY_ENABLED,
  environment: SENTRY_ENVIRONMENT,
  release: SENTRY_RELEASE,
  tracesSampleRate: tracesSampleRate(),
  sendDefaultPii: false,
  beforeSend: (event) => beforeSend(event),
  debug: false,
});

// Feeds App Router navigations into Sentry's tracing so a client-side route
// change shows up as a transaction rather than vanishing.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
