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

  // Register the domain in Supabase's OAuth redirect allow-list so Google
  // sign-in from this host returns here instead of the Olune apex. Non-fatal:
  // the domain is saved regardless, but warn the admin if it couldn't be done.
  const redirect = await reconcileCustomDomainRedirects({
    add: domain,
    remove: previousDomain && previousDomain !== domain ? previousDomain : null,
  });
  const warning = redirect.ok
    ? undefined
    : "Domain saved, but automatic sign-in setup didn't complete. Google login on this domain may not work yet — contact support.";
  if (!redirect.ok) {
    console.error(`[domain] allow-list registration failed for ${domain}: ${redirect.error}`);
  }

  revalidatePath("/", "layout");
  revalidatePath("/portal/admin/site/domain");
  revalidatePath("/portal/admin/settings");
  return { ok: true, data: { domain, warning } };
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

  // Drop the domain's allow-list entry. Non-fatal — a stale entry is harmless.
  if (previousDomain) {
    const redirect = await reconcileCustomDomainRedirects({ remove: previousDomain });
    if (!redirect.ok) {
      console.error(
        `[domain] allow-list cleanup failed for ${previousDomain}: ${redirect.error}`,
      );
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
  ok: boolean;
  message: string;
  records: ReturnType<typeof buildDnsRecords>;
};

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
  const record = expected[0];

  try {
    if (record.type === "A") {
      const ips = await dns.resolve4(domain);
      const match = ips.includes(record.value);
      return {
        ok: true,
        data: {
          ok: match,
          message: match
            ? "DNS looks good — your domain points to Olune."
            : `We found A records (${ips.join(", ")}) but expected ${record.value}. Check your DNS settings.`,
          records: expected,
        },
      };
    }

    const cnames = await dns.resolveCname(domain);
    const normalized = cnames.map((c) => c.replace(/\.$/, "").toLowerCase());
    const target = record.value.replace(/\.$/, "").toLowerCase();
    const match = normalized.some((c) => c === target || c.endsWith(`.${target}`));
    return {
      ok: true,
      data: {
        ok: match,
        message: match
          ? "DNS looks good — your domain points to Olune."
          : cnames.length
            ? `We found CNAME → ${cnames.join(", ")} but expected ${record.value}. It may still be updating.`
            : "No CNAME record found yet. Add the record below and check again in a few minutes.",
        records: expected,
      },
    };
  } catch {
    return {
      ok: true,
      data: {
        ok: false,
        message:
          "We couldn't find your DNS record yet. That's normal right after adding it — try again in 15–30 minutes.",
        records: expected,
      },
    };
  }
}
