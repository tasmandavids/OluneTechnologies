const LOCAL_APP_URL = "http://localhost:3000";

function shouldUseWww(hostname: string): boolean {
  if (hostname === "localhost" || hostname.endsWith(".localhost")) return false;
  if (hostname.startsWith("www.")) return false;
  // Apex like olune.co.nz (3) or olune.app (2); studio subdomains like nzad.olune.co.nz (4+).
  return hostname.split(".").length < 4;
}

/** Ensure a full origin with protocol; apex domains use www for stable OAuth callbacks. */
function normalizeOrigin(url: string): string {
  let raw = url.trim().replace(/\/$/, "");
  if (!raw) return LOCAL_APP_URL;

  if (!/^https?:\/\//i.test(raw)) {
    raw = `https://${raw}`;
  }

  try {
    const parsed = new URL(raw);
    const { protocol, hostname, port } = parsed;

    if (hostname === "localhost" || hostname.endsWith(".localhost")) {
      return port ? `${protocol}//${hostname}:${port}` : `${protocol}//${hostname}`;
    }

    const host = shouldUseWww(hostname) ? `www.${hostname}` : hostname;
    const defaultPort = protocol === "https:" ? "443" : "80";
    const portSuffix = port && port !== defaultPort ? `:${port}` : "";
    return `${protocol}//${host}${portSuffix}`;
  } catch {
    return raw;
  }
}

/**
 * Canonical app origin for OAuth callbacks, token refresh, cron jobs, and
 * notification links. OAuth providers require a single stable URL — not studio
 * subdomains like nzad.olune.co.nz.
 */
export function canonicalAppUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (explicit) return normalizeOrigin(explicit);

  const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN?.replace(/^www\./, "").trim();
  if (root && root !== "localhost") {
    return normalizeOrigin(root);
  }

  return LOCAL_APP_URL;
}

/**
 * Where a Supabase invite / magic link drops the recipient.
 *
 * Built from canonicalAppUrl() rather than NEXT_PUBLIC_APP_URL directly, and
 * exported so no caller has to remember that. The production value of that env
 * var is stored WITHOUT a scheme (`olune.co.nz`), so interpolating it raw
 * yields `olune.co.nz/auth/callback?next=/welcome` — not a URL. Supabase
 * rejects it and silently falls back to the project's Site URL, which sends a
 * family somewhere other than the page the invite promised. normalizeOrigin()
 * is what puts the `https://` and the `www.` back.
 *
 * `next` is percent-encoded; /auth/callback reads it through
 * searchParams.get() + sanitizeNextPath(), which decodes and re-validates.
 */
export function inviteRedirectUrl(next = "/welcome"): string {
  return `${canonicalAppUrl()}/auth/callback?next=${encodeURIComponent(next)}`;
}

export function emailGoogleOAuthCallbackUrl(): string {
  return `${canonicalAppUrl()}/api/email/oauth/google/callback`;
}

export function emailMicrosoftOAuthCallbackUrl(): string {
  return `${canonicalAppUrl()}/api/email/oauth/microsoft/callback`;
}

export function xeroOAuthCallbackUrl(): string {
  const explicit = process.env.XERO_REDIRECT_URI?.trim();
  if (explicit) return normalizeOrigin(explicit);
  return `${canonicalAppUrl()}/api/xero/oauth/callback`;
}
