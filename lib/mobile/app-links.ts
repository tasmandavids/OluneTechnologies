// ============================================================================
//  lib/mobile/app-links.ts
//
//  Universal Links (iOS) and App Links (Android) for a multi-tenant app.
//
//  ── The problem slugs create
//  Every studio is a different origin: aurora.olune.app, book.mystudio.co.nz.
//  A parent tapping a link in a studio's newsletter must open the app, and both
//  platforms decide that by fetching an association file *from the origin of
//  the link* — not from a central one. So the files have to be served from
//  every tenant host, which is exactly what a Next.js route does for free and a
//  static file in public/ does not.
//
//  The payload is identical on every host: one app, many studios. The host is
//  what varies, and neither platform puts the host inside the file.
//
//  ── Why this is env-driven and 404s when unset
//  The Apple app id is `<TeamID>.<BundleID>` and the Android fingerprint comes
//  out of the upload key — neither exists until the developer accounts do.
//  Serving a file with placeholder ids is worse than serving none: iOS caches
//  a bad association through its CDN and the link silently stops opening the
//  app for as long as that cache lives. Missing credentials are a deployment
//  state, not an error — same contract as lib/apple-wallet/config.ts.
// ============================================================================

/** `<TeamID>.<BundleID>`, e.g. `A1B2C3D4E5.nz.co.olune.parent`. */
const APPLE_APP_ID_RE = /^[A-Z0-9]{10}\.[A-Za-z0-9.-]+$/;

/** Uppercase hex pairs joined by colons — what `keytool`/EAS prints. */
const SHA256_FINGERPRINT_RE = /^(?:[A-F0-9]{2}:){31}[A-F0-9]{2}$/;

export type AppleAppSiteAssociation = {
  applinks: {
    apps: string[];
    details: { appID: string; paths: string[] }[];
  };
  // Declared so an Olune pass can be updated by the app later; harmless now.
  webcredentials: { apps: string[] };
};

export type AssetLinkStatement = {
  relation: string[];
  target: { namespace: string; package_name: string; sha256_cert_fingerprints: string[] };
};

/** Paths the app claims. Everything a parent can be linked to, nothing else. */
export const APP_LINK_PATHS = [
  "/portal/parent/*",
  "/portal/student/*",
  "/login",
  "/join/*",
  "/enrol/*",
] as const;

/**
 * Paths that must stay in the browser even though they sit under a claimed
 * prefix. Order matters to iOS: a `NOT ` entry only wins if it comes first.
 *
 * `/portal/parent/billing/*` is deliberately NOT excluded — paying in-app is
 * the point. These are the flows that hand off to a third party mid-journey
 * (Stripe Connect onboarding, OAuth) and would strand the user in a webview.
 */
export const APP_LINK_EXCLUSIONS = ["NOT /auth/*", "NOT /api/*"] as const;

export function getAppleAppId(): string | null {
  const value = process.env.APPLE_APP_ID?.trim();
  if (!value || !APPLE_APP_ID_RE.test(value)) return null;
  return value;
}

export function getAndroidPackageName(): string | null {
  const value = process.env.ANDROID_PACKAGE_NAME?.trim();
  // A package name is dotted lowercase reverse-DNS; anything else is a typo we
  // should not bake into a cached association file.
  if (!value || !/^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/.test(value)) return null;
  return value;
}

/**
 * SHA-256 signing certificate fingerprints, comma-separated in env.
 *
 * Plural because there are normally two live at once: the upload key you sign
 * with locally and the app-signing key Google re-signs with. Publishing only
 * one is the classic reason App Links verify in internal testing and fail in
 * production.
 */
export function getAndroidFingerprints(): string[] {
  const raw = process.env.ANDROID_SHA256_FINGERPRINTS?.trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((f) => f.trim().toUpperCase())
    .filter((f) => SHA256_FINGERPRINT_RE.test(f));
}

/** Null when the Apple app id isn't configured — the route then 404s. */
export function buildAppleAppSiteAssociation(): AppleAppSiteAssociation | null {
  const appID = getAppleAppId();
  if (!appID) return null;

  return {
    applinks: {
      // Required by the schema and required to be empty.
      apps: [],
      details: [{ appID, paths: [...APP_LINK_EXCLUSIONS, ...APP_LINK_PATHS] }],
    },
    webcredentials: { apps: [appID] },
  };
}

/** Empty when Android isn't configured — the route then 404s. */
export function buildAssetLinks(): AssetLinkStatement[] {
  const packageName = getAndroidPackageName();
  const fingerprints = getAndroidFingerprints();
  if (!packageName || fingerprints.length === 0) return [];

  return [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: packageName,
        sha256_cert_fingerprints: fingerprints,
      },
    },
  ];
}
