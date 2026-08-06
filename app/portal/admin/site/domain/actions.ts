"use server";

// ============================================================================
//  Domain setup — save custom domain + lightweight DNS check.
// ============================================================================

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { promises as dns } from "dns";
import { createClient } from "@/lib/supabase/server";
import { reconcileCustomDomainRedirects } from "@/lib/supabase/auth-redirects";
import {
  addProjectDomain,
  getProjectDomainStatus,
  isVercelDomainsConfigured,
  removeProjectDomain,
} from "@/lib/vercel/domains";
import {
  buildDnsRecords,
  domainTargets,
  normalizeDomainInput,
  validateCustomDomain,
  type DomainKind,
} from "@/lib/domain-setup";
import { getAdminStudio as getAdminStudioAccess } from "@/lib/portal/access";

export type DomainActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const ROOT = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "olune.app";

async function getAdminStudioId(): Promise<{ studioId: string } | { error: string }> {
  const ctx = await getAdminStudioAccess();
  if (ctx.error || !ctx.studioId) return { error: ctx.error ?? "Admin only." };
  return { studioId: ctx.studioId };
}


const SaveSchema = z.object({
  domain: z.string().min(3).max(253),
  kind: z.enum(["subdomain", "apex", "www"]),
});

export async function saveCustomDomain(
  input: unknown,
): Promise<DomainActionResult<{ domain: string; warning?: string }>> {
  const parsed = SaveSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const domain = normalizeDomainInput(parsed.data.domain);
  const validationError = validateCustomDomain(domain, ROOT);
  if (validationError) return { ok: false, error: validationError };

  const auth = await getAdminStudioId();
  if ("error" in auth) return { ok: false, error: auth.error };

  const supabase = await createClient();

  const { data: taken } = await supabase
    .from("studios")
    .select("id")
    .eq("custom_domain", domain)
    .neq("id", auth.studioId)
    .maybeSingle();

  if (taken) return { ok: false, error: "That domain is already connected to another studio." };

  // Capture the previous domain so we can drop its stale allow-list entry on a rename.
  const { data: prev } = await supabase
    .from("studios")
    .select("custom_domain")
    .eq("id", auth.studioId)
    .maybeSingle();
  const previousDomain = (prev?.custom_domain as string | null) ?? null;

  const { error } = await supabase
    .from("studios")
    .update({ custom_domain: domain })
    .eq("id", auth.studioId);

  if (error) return { ok: false, error: error.message };

  const staleDomain = previousDomain && previousDomain !== domain ? previousDomain : null;

  // Two external registrations, both non-fatal — the domain stays saved either
  // way and the admin gets a warning naming what didn't finish.
  //
  //  1. Supabase allow-list, so Google sign-in from this host returns here
  //     rather than the Olune apex.
  //  2. The Vercel project, so Vercel actually routes the hostname and issues
  //     a TLS certificate for it. Without this the studio's DNS can be
  //     perfect and the domain still serves a cert error or a 404.
  const [redirect, vercel] = await Promise.all([
    reconcileCustomDomainRedirects({ add: domain, remove: staleDomain }),
    addProjectDomain(domain),
  ]);

  // Release the old hostname so it stops resolving to this studio. Best-effort:
  // a stale claim is untidy, not broken, and must not fail the rename.
  if (staleDomain) {
    const released = await removeProjectDomain(staleDomain);
    if (!released.ok) {
      console.error(`[domain] vercel release failed for ${staleDomain}: ${released.error}`);
    }
  }

  const warnings: string[] = [];

  if (!redirect.ok) {
    console.error(`[domain] allow-list registration failed for ${domain}: ${redirect.error}`);
    warnings.push(
      "Google sign-in on this domain isn't set up yet — families can still sign in with email and password.",
    );
  }

  if (!vercel.ok) {
    console.error(`[domain] vercel registration failed for ${domain}: ${vercel.error}`);
    warnings.push(
      isVercelDomainsConfigured()
        ? `We couldn't register ${domain} with our hosting yet, so it won't load until that's done: ${vercel.error}`
        : `${domain} still needs to be added to Olune's hosting before it will load. Contact support and we'll finish it.`,
    );
  }

  revalidatePath("/", "layout");
  revalidatePath("/portal/admin/site/domain");
  revalidatePath("/portal/admin/settings");
  return {
    ok: true,
    data: {
      domain,
      warning: warnings.length ? `Domain saved. ${warnings.join(" ")}` : undefined,
    },
  };
}

export async function removeCustomDomain(): Promise<DomainActionResult> {
  const auth = await getAdminStudioId();
  if ("error" in auth) return { ok: false, error: auth.error };

  const supabase = await createClient();

  const { data: prev } = await supabase
    .from("studios")
    .select("custom_domain")
    .eq("id", auth.studioId)
    .maybeSingle();
  const previousDomain = (prev?.custom_domain as string | null) ?? null;

  const { error } = await supabase
    .from("studios")
    .update({ custom_domain: null })
    .eq("id", auth.studioId);

  if (error) return { ok: false, error: error.message };

  // Drop both external registrations. Non-fatal — a stale allow-list entry is
  // harmless, and a stale Vercel claim only matters if the studio reconnects
  // the same hostname, which `addProjectDomain` handles idempotently.
  if (previousDomain) {
    const [redirect, released] = await Promise.all([
      reconcileCustomDomainRedirects({ remove: previousDomain }),
      removeProjectDomain(previousDomain),
    ]);
    if (!redirect.ok) {
      console.error(
        `[domain] allow-list cleanup failed for ${previousDomain}: ${redirect.error}`,
      );
    }
    if (!released.ok) {
      console.error(`[domain] vercel release failed for ${previousDomain}: ${released.error}`);
    }
  }

  revalidatePath("/", "layout");
  revalidatePath("/portal/admin/site/domain");
  revalidatePath("/portal/admin/settings");
  return { ok: true, data: null };
}

const CheckSchema = z.object({
  domain: z.string().min(3).max(253),
  kind: z.enum(["subdomain", "apex", "www"]),
});

export type DnsCheckResult = {
  /** True only when the domain will actually serve the studio's site. */
  ok: boolean;
  message: string;
  records: ReturnType<typeof buildDnsRecords>;
  /** The studio's DNS resolves to our target. */
  dnsOk: boolean;
  /** Our hosting claims the hostname, so it can route it and issue a cert. */
  registered: boolean;
  /** Ownership verified — an unverified domain is never served. */
  verified: boolean;
  /** No hosting credentials on this deployment, so registration is unknowable. */
  registrationUnknown: boolean;
  /** Extra records the host wants for ownership verification. Usually empty. */
  verification: { type: string; domain: string; value: string }[];
};

/** Resolve the studio's DNS and say whether it matches what we asked for. */
async function resolveDnsState(
  domain: string,
  record: ReturnType<typeof buildDnsRecords>[number],
): Promise<{ ok: boolean; detail: string }> {
  try {
    if (record.type === "A") {
      const ips = await dns.resolve4(domain);
      const match = ips.includes(record.value);
      return {
        ok: match,
        detail: match
          ? "Your DNS points to Olune."
          : `We found A records (${ips.join(", ")}) but expected ${record.value}. Check your DNS settings.`,
      };
    }

    const cnames = await dns.resolveCname(domain);
    const normalized = cnames.map((c) => c.replace(/\.$/, "").toLowerCase());
    const target = record.value.replace(/\.$/, "").toLowerCase();
    const match = normalized.some((c) => c === target || c.endsWith(`.${target}`));
    return {
      ok: match,
      detail: match
        ? "Your DNS points to Olune."
        : cnames.length
          ? `We found CNAME → ${cnames.join(", ")} but expected ${record.value}. It may still be updating.`
          : "No CNAME record found yet. Add the record below and check again in a few minutes.",
    };
  } catch {
    return {
      ok: false,
      detail:
        "We couldn't find your DNS record yet. That's normal right after adding it — try again in 15–30 minutes.",
    };
  }
}

/**
 * Is this domain actually going to work?
 *
 * DNS is only half the answer, and reporting it alone was actively misleading:
 * the wizard would go green while the domain served a certificate error,
 * because our hosting had never been told the hostname exists. This checks
 * both halves and only says "live" when both are true.
 *
 * It also self-heals. Any domain connected before registration was wired is
 * saved but unclaimed, and re-running the check is the natural thing an admin
 * does when their site doesn't load — so an unregistered domain is registered
 * here rather than requiring a disconnect/reconnect cycle.
 */
export async function checkDomainDns(input: unknown): Promise<DomainActionResult<DnsCheckResult>> {
  const parsed = CheckSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const domain = normalizeDomainInput(parsed.data.domain);
  const validationError = validateCustomDomain(domain, ROOT);
  if (validationError) return { ok: false, error: validationError };

  const targets = domainTargets();
  const expected = buildDnsRecords(domain, parsed.data.kind as DomainKind, targets);

  const dnsState = await resolveDnsState(domain, expected[0]);

  const base = {
    records: expected,
    dnsOk: dnsState.ok,
    verification: [] as DnsCheckResult["verification"],
  };

  // No hosting credentials — report DNS honestly and don't imply more.
  if (!isVercelDomainsConfigured()) {
    return {
      ok: true,
      data: {
        ...base,
        ok: false,
        registered: false,
        verified: false,
        registrationUnknown: true,
        message: dnsState.ok
          ? `${dnsState.detail} The last step has to be finished by Olune — contact support and we'll switch ${domain} on.`
          : dnsState.detail,
      },
    };
  }

  let status = await getProjectDomainStatus(domain);

  // Saved but never claimed (or claimed then lost) — claim it now and re-read.
  if (status.ok && !status.data.registered) {
    const added = await addProjectDomain(domain);
    if (!added.ok) {
      return {
        ok: true,
        data: {
          ...base,
          ok: false,
          registered: false,
          verified: false,
          registrationUnknown: false,
          message: `${domain} couldn't be connected to our hosting: ${added.error}`,
        },
      };
    }
    status = await getProjectDomainStatus(domain);
  }

  if (!status.ok) {
    return {
      ok: true,
      data: {
        ...base,
        ok: false,
        registered: false,
        verified: false,
        registrationUnknown: true,
        message: `${dnsState.detail} We couldn't confirm the hosting side just now — try again shortly.`,
      },
    };
  }

  const { registered, verified, misconfigured, verification } = status.data;
  const live = registered && verified && !misconfigured && dnsState.ok;

  let message: string;
  if (live) {
    message = `${domain} is live — your DNS is correct and the secure certificate is issued.`;
  } else if (!verified && verification.length) {
    message =
      "Almost there — one extra DNS record is needed to prove you own this domain. Add the verification record below, then check again.";
  } else if (!dnsState.ok) {
    message = dnsState.detail;
  } else {
    // DNS resolves from here but the host hasn't caught up. Genuinely common
    // in the first few minutes, so say so rather than implying a mistake.
    message =
      "Your DNS looks right and we're waiting on the secure certificate. This usually takes a few minutes — check again shortly.";
  }

  return {
    ok: true,
    data: {
      ...base,
      ok: live,
      registered,
      verified,
      registrationUnknown: false,
      verification,
      message,
    },
  };
}
