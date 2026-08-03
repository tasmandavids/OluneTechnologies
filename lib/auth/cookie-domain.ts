// ============================================================================
//  Shared cookie Domain for auth across apex + studio subdomains.
//  Without this, sessions set on www.example.com are invisible on
//  studio.example.com (and vice versa).
// ============================================================================

/**
 * Returns a leading-dot cookie domain for the configured root host, or
 * undefined when unset / localhost (browsers reject Domain=localhost).
 */
export function authCookieDomain(): string | undefined {
  const raw = (process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "").trim().toLowerCase();
  if (!raw) return undefined;

  const host = raw.replace(/^https?:\/\//, "").split("/")[0]?.split(":")[0] ?? "";
  if (!host || host === "localhost" || host.endsWith(".localhost")) return undefined;
  // IPv4 / bare IP — Domain attribute not useful
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return undefined;

  return host.startsWith(".") ? host : `.${host}`;
}

/** Merge Domain into cookie options when a shared root domain is configured. */
export function withAuthCookieDomain<T extends Record<string, unknown>>(
  options: T | undefined,
): T & { domain?: string } {
  const domain = authCookieDomain();
  if (!domain) return { ...(options ?? {}) } as T & { domain?: string };
  return { ...(options ?? {}), domain } as T & { domain?: string };
}
