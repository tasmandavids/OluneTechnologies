// ============================================================================
//  Pure host classification — no Supabase/React imports so it is safe in Edge
//  middleware and client components alike. DB-backed resolution lives in
//  lib/tenant.ts.
// ============================================================================

const ROOT = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "olune.app";

/** Extract the studio slug from a host, or null if this is a custom/root domain. */
export function slugFromHost(host: string | null): string | null {
  if (!host) return null;
  const hostname = host.split(":")[0]; // drop port

  const onRoot = hostname === ROOT || hostname.endsWith(`.${ROOT}`);
  const onLocal = hostname === "localhost" || hostname.endsWith(".localhost");
  if (!onRoot && !onLocal) return null; // custom domain → resolve by domain instead

  const sub = hostname.replace(`.${ROOT}`, "").replace(".localhost", "");
  if (!sub || sub === ROOT || sub === "localhost" || sub === "www" || sub === "app") {
    return null;
  }
  return sub;
}

export function isPlatformHost(hostname: string): boolean {
  return (
    hostname === ROOT ||
    hostname.endsWith(`.${ROOT}`) ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost")
  );
}

/**
 * True when the host serves a studio site (slug subdomain or custom domain)
 * rather than the Olune platform/marketing site. Unknown hosts (e.g. Vercel
 * previews) count as tenant hosts — never the marketing site — and pages like
 * /join degrade gracefully when no studio resolves for them.
 */
export function isTenantHost(host: string | null): boolean {
  if (!host) return false;
  const hostname = host.split(":")[0];
  if (isPlatformHost(hostname)) return slugFromHost(host) !== null;
  return true;
}
