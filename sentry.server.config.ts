// ============================================================================
//  Sentry — Node.js server runtime (route handlers, server actions, RSC).
//  Loaded by instrumentation.ts when NEXT_RUNTIME === "nodejs".
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

  // Students are minors and their medical and contact details are in these
  // tables. Never let the SDK attach IPs, cookies or request bodies on its own
  // — see lib/observability/scrub.ts.
  sendDefaultPii: false,
  beforeSend: (event) => beforeSend(event),

  // Quiet in local dev; the SDK's own logs are noise next to the app's.
  debug: false,
});
