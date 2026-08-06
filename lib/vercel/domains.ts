import "server-only";

// ============================================================================
//  Vercel Domains API — register studio custom domains with the project.
//
//  Pointing DNS at Olune is only half of connecting a custom domain. Vercel
//  serves nothing for a hostname the project doesn't claim: no routing, and no
//  TLS certificate, so the studio gets a certificate error or a 404 even
//  though their DNS is perfect. The domain must be added to the project via
//  the API, and then Vercel issues the cert once it sees the DNS record.
//
//  Mirrors lib/supabase/auth-redirects.ts deliberately: these calls NEVER
//  throw. A domain is saved to the studio row regardless, and a failure here
//  becomes a warning the admin can act on rather than a lost save.
//
//  Requires (server env):
//    VERCEL_API_TOKEN   — personal or team token with project write scope
//    VERCEL_PROJECT_ID  — the prj_… id (Project Settings → General)
//    VERCEL_TEAM_ID     — optional; required when the project is team-owned
// ============================================================================

import { normalizeDomainInput } from "@/lib/domain-setup";

const API = "https://api.vercel.com";

export type VercelResult<T = null> = { ok: true; data: T } | { ok: false; error: string };

/** A DNS record Vercel wants added to prove ownership. Rare — usually empty. */
export type DomainVerification = { type: string; domain: string; value: string };

export type ProjectDomainStatus = {
  /** The project claims this hostname. */
  registered: boolean;
  /** Vercel has verified ownership. Unverified domains are never served. */
  verified: boolean;
  /** Vercel cannot see correct DNS for it yet. */
  misconfigured: boolean;
  /** Records to add when `verified` is false and Vercel asked for a challenge. */
  verification: DomainVerification[];
};

type VercelConfig = { token: string; projectId: string; teamId: string | null };

function config(): VercelConfig | null {
  const token = process.env.VERCEL_API_TOKEN?.trim();
  const projectId = process.env.VERCEL_PROJECT_ID?.trim();
  if (!token || !projectId) return null;
  return { token, projectId, teamId: process.env.VERCEL_TEAM_ID?.trim() || null };
}

/**
 * Whether this deployment can manage domains at all. The wizard uses it to
 * avoid claiming a domain is live when we have no way to know.
 */
export function isVercelDomainsConfigured(): boolean {
  return config() !== null;
}

const MISSING_ENV =
  "Domain registration is not configured on the server (missing VERCEL_API_TOKEN / VERCEL_PROJECT_ID).";

type ApiResponse = {
  status: number;
  body: Record<string, unknown>;
};

async function call(
  cfg: VercelConfig,
  path: string,
  init: RequestInit = {},
): Promise<ApiResponse> {
  const url = new URL(`${API}${path}`);
  if (cfg.teamId) url.searchParams.set("teamId", cfg.teamId);

  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    // Domain state changes while the admin watches the wizard — never cache it.
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });

  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, body };
}

/** Pull Vercel's human-readable message out of an error envelope. */
function apiError(res: ApiResponse, fallback: string): string {
  const err = res.body.error as { message?: string; code?: string } | undefined;
  return err?.message ?? err?.code ?? `${fallback} (HTTP ${res.status})`;
}

/**
 * Claim a hostname for the project.
 *
 * Idempotent: a domain already on THIS project resolves ok. A domain held by
 * a different Vercel project returns a clear error — that's a real conflict an
 * admin has to resolve, not something to paper over.
 */
export async function addProjectDomain(
  rawDomain: string,
): Promise<VercelResult<{ alreadyRegistered: boolean; verified: boolean }>> {
  const cfg = config();
  if (!cfg) return { ok: false, error: MISSING_ENV };

  const domain = normalizeDomainInput(rawDomain);
  if (!domain) return { ok: false, error: "No domain given." };

  try {
    const res = await call(cfg, `/v10/projects/${cfg.projectId}/domains`, {
      method: "POST",
      body: JSON.stringify({ name: domain }),
    });

    if (res.status >= 200 && res.status < 300) {
      return {
        ok: true,
        data: { alreadyRegistered: false, verified: Boolean(res.body.verified) },
      };
    }

    // Vercel answers 409 for BOTH "this project already has it" (success) and
    // "another project has it" (a hard conflict). The status code alone can't
    // tell them apart, so the code is checked first — testing status first
    // silently swallows the conflict an admin actually needs to see.
    const code = (res.body.error as { code?: string } | undefined)?.code;

    if (code === "domain_already_in_use") {
      return {
        ok: false,
        error: `${domain} is already connected to a different Vercel project. Remove it there first.`,
      };
    }

    if (res.status === 409 || code === "domain_already_in_use_by_this_project") {
      const status = await getProjectDomainStatus(domain);
      return {
        ok: true,
        data: {
          alreadyRegistered: true,
          verified: status.ok ? status.data.verified : false,
        },
      };
    }

    return { ok: false, error: apiError(res, "Could not register the domain") };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not reach Vercel to register the domain.",
    };
  }
}

/**
 * Release a hostname from the project. A domain that isn't there resolves ok —
 * removal should be idempotent so a retried disconnect doesn't error.
 */
export async function removeProjectDomain(rawDomain: string): Promise<VercelResult> {
  const cfg = config();
  if (!cfg) return { ok: false, error: MISSING_ENV };

  const domain = normalizeDomainInput(rawDomain);
  if (!domain) return { ok: true, data: null };

  try {
    const res = await call(
      cfg,
      `/v9/projects/${cfg.projectId}/domains/${encodeURIComponent(domain)}`,
      { method: "DELETE" },
    );

    if ((res.status >= 200 && res.status < 300) || res.status === 404) {
      return { ok: true, data: null };
    }
    return { ok: false, error: apiError(res, "Could not remove the domain") };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not reach Vercel to remove the domain.",
    };
  }
}

/**
 * What Vercel currently thinks of this hostname.
 *
 * Two calls: the domain record carries ownership/verification, and the config
 * endpoint carries whether Vercel can actually see the DNS. Both are needed —
 * a domain can be verified and still misconfigured, and vice versa.
 */
export async function getProjectDomainStatus(
  rawDomain: string,
): Promise<VercelResult<ProjectDomainStatus>> {
  const cfg = config();
  if (!cfg) return { ok: false, error: MISSING_ENV };

  const domain = normalizeDomainInput(rawDomain);
  if (!domain) return { ok: false, error: "No domain given." };
  const encoded = encodeURIComponent(domain);

  try {
    const [record, conf] = await Promise.all([
      call(cfg, `/v9/projects/${cfg.projectId}/domains/${encoded}`),
      call(cfg, `/v9/projects/${cfg.projectId}/domains/${encoded}/config`),
    ]);

    if (record.status === 404) {
      return {
        ok: true,
        data: { registered: false, verified: false, misconfigured: true, verification: [] },
      };
    }
    if (record.status < 200 || record.status >= 300) {
      return { ok: false, error: apiError(record, "Could not read the domain status") };
    }

    // If the config call failed we'd rather report "not confirmed yet" than
    // claim the domain is live, so an unreadable config counts as misconfigured.
    const misconfigured =
      conf.status >= 200 && conf.status < 300 ? Boolean(conf.body.misconfigured) : true;

    const verification = Array.isArray(record.body.verification)
      ? (record.body.verification as DomainVerification[])
      : [];

    return {
      ok: true,
      data: {
        registered: true,
        verified: Boolean(record.body.verified),
        misconfigured,
        verification,
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not reach Vercel to check the domain.",
    };
  }
}
