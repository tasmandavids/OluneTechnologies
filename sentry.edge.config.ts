// ============================================================================
//  Sentry — Edge runtime (middleware.ts and any edge route handlers).
//  Loaded by instrumentation.ts when NEXT_RUNTIME === "edge".
//
//  middleware.ts resolves the tenant from the hostname and refreshes the
//  Supabase session on every request, so a failure here logs every user out
//  rather than breaking one page. It is worth watching in its own right.
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
