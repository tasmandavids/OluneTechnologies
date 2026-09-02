// ============================================================================
//  Sentry DSN parsing — pure, shared between next.config.ts and the runtime.
//
//  next.config.ts needs the DSN's *origin* at build time so the CSP's
//  connect-src can allow it. A DSN looks like:
//
//      https://<publicKey>@o123456.ingest.us.sentry.io/4509
//
//  so the origin is just the URL's origin with the credentials dropped.
//  Without this the browser SDK is silently blocked by our own CSP and the
//  only errors we'd ever see are the server-side ones — the exact failure
//  mode that makes people think Sentry "isn't working".
//
//  Kept dependency-free (no @sentry/* import) so next.config.ts can import it
//  during config load, where the module graph is bare.
// ============================================================================

/**
 * The origin a Sentry DSN posts events to, or `null` if the DSN is unset or
 * unparseable. Never throws — a malformed DSN degrades to "no Sentry host in
 * the CSP", which is the same as not configuring Sentry at all.
 */
export function sentryIngestOrigin(dsn: string | undefined | null): string | null {
  if (!dsn) return null;
  try {
    const url = new URL(dsn);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (!url.hostname) return null;
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}
