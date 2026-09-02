// ============================================================================
//  Next.js instrumentation hook.
//
//  `register()` runs once per runtime as the server boots and is where the
//  Sentry SDK is installed for Node and Edge. `onRequestError` is Next's hook
//  for errors thrown out of server components, route handlers and server
//  actions — without it those are logged to the Vercel console and nowhere
//  else. The browser half lives in instrumentation-client.ts.
// ============================================================================

import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
