import "server-only";

// ============================================================================
//  Supabase Auth redirect allow-list — runtime reconciliation for custom
//  studio domains.
//
//  Studio sign-in starts OAuth with redirectTo=https://<host>/auth/callback,
//  and Supabase only honours that redirect if the URL matches an entry in the
//  project's uri_allow_list. Subdomains (*.olune.co.nz / *.olune.app) are
//  covered by wildcards, but CUSTOM domains (book.mystudio.co.nz, etc.) are
//  arbitrary — no shared suffix to wildcard — so each must be registered the
//  moment an admin connects it. Without this, Supabase rejects the redirect and
//  falls back to the Site URL (the Olune apex), stranding the client on the
//  marketing page, logged out. See scripts/setup-oauth.mjs for the same API
//  used at project-setup time.
//
//  Requires (server env): SUPABASE_ACCESS_TOKEN (a Supabase personal access
//  token). The project ref is derived from NEXT_PUBLIC_SUPABASE_URL, or set
//  SUPABASE_PROJECT_REF to override.
// ============================================================================

import { normalizeDomainInput } from "@/lib/domain-setup";

const MGMT_API = "https://api.supabase.com/v1";

export type ReconcileResult =
  | { ok: true; changed: boolean }
  | { ok: false; error: string };

/** Supabase project ref, from an explicit env var or the public Supabase URL. */
function projectRef(): string | null {
  const explicit = process.env.SUPABASE_PROJECT_REF?.trim();
  if (explicit) return explicit;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!url) return null;
  try {
    return new URL(url).hostname.split(".")[0] || null;
  } catch {
    return null;
  }
}

/**
 * The single allow-list entry we register for a custom domain. Supabase globs
 * the ENTIRE redirect URL — including the ?next=… query we send — so the entry
 * must end in "/**"; a bare "/auth/callback" would not match a request that
 * carries a query string.
 */
function redirectPattern(domain: string): string {
  return `https://${normalizeDomainInput(domain)}/**`;
}

/** Every allow-list variant that could exist for a domain — removed on cleanup. */
function redirectPatternsForRemoval(domain: string): string[] {
  const d = normalizeDomainInput(domain);
  return [`https://${d}/**`, `https://${d}/auth/callback`, `https://${d}`];
}

async function mgmt(path: string, token: string, init: RequestInit = {}) {
  const res = await fetch(`${MGMT_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    // Never cache auth-config reads/writes.
    cache: "no-store",
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      `${init.method ?? "GET"} ${path} → ${res.status}: ${JSON.stringify(body)}`,
    );
  }
  return body as { uri_allow_list?: string };
}

/**
 * Add and/or remove custom-domain entries in the project's redirect allow-list.
 * Reads the current list, applies the delta, and PATCHes only if it changed.
 * Never throws — returns a typed result so callers can keep the domain saved
 * and surface a warning if OAuth registration could not be completed.
 */
export async function reconcileCustomDomainRedirects(opts: {
  add?: string | null;
  remove?: string | null;
}): Promise<ReconcileResult> {
  const add = opts.add ? normalizeDomainInput(opts.add) : null;
  const remove = opts.remove ? normalizeDomainInput(opts.remove) : null;
  if (!add && !remove) return { ok: true, changed: false };
  if (add && add === remove) {
    // A no-op rename (same domain) — nothing to reconcile.
    return { ok: true, changed: false };
  }

  const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
  const ref = projectRef();
  if (!token || !ref) {
    return {
      ok: false,
      error:
        "OAuth redirect registration is not configured on the server (missing SUPABASE_ACCESS_TOKEN).",
    };
  }

  try {
    const current = await mgmt(`/projects/${ref}/config/auth`, token);
    const existing = (current.uri_allow_list ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const set = new Set(existing);

    if (remove) {
      for (const p of redirectPatternsForRemoval(remove)) set.delete(p);
    }
    if (add) {
      set.add(redirectPattern(add));
    }

    // Order-insensitive comparison so we skip a pointless PATCH.
    const next = [...set];
    const unchanged =
      next.length === existing.length && next.every((u) => existing.includes(u));
    if (unchanged) return { ok: true, changed: false };

    await mgmt(`/projects/${ref}/config/auth`, token, {
      method: "PATCH",
      body: JSON.stringify({ uri_allow_list: next.join(",") }),
    });

    return { ok: true, changed: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to update redirect allow-list.",
    };
  }
}
