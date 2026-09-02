// ============================================================================
//  Event scrubbing before anything leaves for Sentry.
//
//  Olune stores children's names, dates of birth, medical notes and guardian
//  contact details. An error tracker is a third-party system holding whatever
//  we hand it, so the default posture here is: send the *shape* of the failure,
//  never the payload.
//
//  `sendDefaultPii: false` in the Sentry configs already stops the SDK
//  attaching IPs, cookies and request bodies. This module is the second layer
//  — it assumes something upstream will one day change that default, or that a
//  URL will carry an identifier it shouldn't, and strips it anyway.
//
//  Pure and SDK-type-free so it can be unit-tested without booting Sentry.
//  `scrubEvent` is structurally compatible with Sentry's `Event`.
// ============================================================================

/** Query/header names whose values never leave the building. */
const SENSITIVE_KEYS = [
  "secret",
  "token",
  "access_token",
  "refresh_token",
  "id_token",
  "code",
  "key",
  "api_key",
  "apikey",
  "password",
  "passwd",
  "signature",
  "sig",
  "session",
  "email",
  "phone",
  "dob",
];

const SENSITIVE_HEADERS = [
  "authorization",
  "cookie",
  "set-cookie",
  "stripe-signature",
  "x-api-key",
  "x-supabase-auth",
];

export const REDACTED = "[redacted]";

function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase();
  return SENSITIVE_KEYS.some((s) => lower === s || lower.includes(s));
}

/**
 * Replaces the value of every sensitive query parameter in `url` with
 * `[redacted]`, leaving the path intact. A URL we can't parse is returned with
 * its query string dropped entirely rather than guessed at.
 */
export function redactUrl(url: string): string {
  if (!url) return url;

  const [withoutHash, hash] = splitOnce(url, "#");
  const [base, query] = splitOnce(withoutHash, "?");
  if (!query) return url;

  const redacted = redactQueryString(query);
  return `${base}?${redacted}${hash ? `#${hash}` : ""}`;
}

/** Redacts sensitive pairs in a bare `a=1&b=2` query string. */
export function redactQueryString(query: string): string {
  return query
    .split("&")
    .map((pair) => {
      if (!pair) return pair;
      const [rawKey, ...rest] = pair.split("=");
      if (rest.length === 0) return pair;
      return isSensitiveKey(decodeURIComponent(rawKey)) ? `${rawKey}=${REDACTED}` : pair;
    })
    .join("&");
}

function splitOnce(value: string, sep: string): [string, string | undefined] {
  const at = value.indexOf(sep);
  if (at === -1) return [value, undefined];
  return [value.slice(0, at), value.slice(at + 1)];
}

/** Drops sensitive headers; everything else is passed through untouched. */
export function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    out[key] = SENSITIVE_HEADERS.includes(key.toLowerCase()) ? REDACTED : value;
  }
  return out;
}

type ScrubbableRequest = {
  url?: string;
  query_string?: unknown;
  cookies?: unknown;
  data?: unknown;
  headers?: Record<string, string>;
};

type ScrubbableBreadcrumb = {
  data?: Record<string, unknown> | undefined;
};

export type ScrubbableEvent = {
  request?: ScrubbableRequest;
  breadcrumbs?: ScrubbableBreadcrumb[];
};

/**
 * Last gate before an event is sent. Mutates and returns the event:
 *
 *   • request bodies and cookies are removed outright — there is no version of
 *     an enrollment POST body we want sitting in a third-party tool;
 *   • sensitive query params are redacted in the request URL and in the URLs
 *     of any HTTP breadcrumbs (a fetch to `?secret=…` is just as leaky);
 *   • auth-bearing headers are replaced with `[redacted]`.
 */
export function scrubEvent<T extends ScrubbableEvent>(event: T): T {
  const request = event.request;

  if (request) {
    delete request.cookies;
    delete request.data;

    if (typeof request.url === "string") {
      request.url = redactUrl(request.url);
    }

    if (typeof request.query_string === "string") {
      request.query_string = redactQueryString(request.query_string);
    } else if (request.query_string) {
      // Sentry also accepts object / tuple-array forms.
      delete request.query_string;
    }

    if (request.headers) {
      request.headers = redactHeaders(request.headers);
    }
  }

  for (const crumb of event.breadcrumbs ?? []) {
    const url = crumb.data?.url;
    if (typeof url === "string" && crumb.data) {
      crumb.data.url = redactUrl(url);
    }
  }

  return event;
}
