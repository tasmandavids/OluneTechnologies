// ============================================================================
//  lib/domain-setup.ts — domain wizard helpers (client + server safe).
//  Relocated from lib/site/domain-setup.ts — this is custom-domain setup for
//  the studio account, unrelated to the (deleted) v1/v2 page/block editors.
// ============================================================================

export type DomainKind = "subdomain" | "apex" | "www";

export type DomainWizardStep =
  | "intro"
  | "decide"
  | "kind"
  | "domain"
  | "dns"
  | "connect"
  | "done";

export const DOMAIN_WIZARD_STEPS: DomainWizardStep[] = [
  "intro",
  "decide",
  "kind",
  "domain",
  "dns",
  "connect",
  "done",
];

export const DOMAIN_KIND_OPTIONS: Array<{
  id: DomainKind;
  label: string;
  example: string;
  hint: string;
}> = [
  {
    id: "www",
    label: "www address",
    example: "www.mystudio.co.nz",
    hint: "Most common — families type www.yoursite.com",
  },
  {
    id: "subdomain",
    label: "Sub-address",
    example: "book.mystudio.co.nz",
    hint: "Good for a dedicated booking or info page",
  },
  {
    id: "apex",
    label: "Root domain",
    example: "mystudio.co.nz",
    hint: "No www — just yoursite.com",
  },
];

const HOSTNAME_RE =
  /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

export function normalizeDomainInput(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/\.$/, "");
}

export function validateCustomDomain(domain: string, rootDomain: string): string | null {
  const d = normalizeDomainInput(domain);
  if (!d) return "Enter your domain.";
  if (d.includes(" ")) return "Domains can't contain spaces.";
  if (!HOSTNAME_RE.test(d)) return "That doesn't look like a valid domain (e.g. www.mystudio.co.nz).";
  if (d.endsWith(`.${rootDomain}`) || d === rootDomain) {
    return `You already have a free address on ${rootDomain}. Enter your own domain instead.`;
  }
  if (d.includes("localhost")) return "Use a real domain — not localhost.";
  return null;
}

export type DnsRecord = {
  type: "CNAME" | "A";
  host: string;
  value: string;
  note: string;
};

export function buildDnsRecords(
  domain: string,
  kind: DomainKind,
  targets: { cname: string; apexIp: string },
): DnsRecord[] {
  const d = normalizeDomainInput(domain);

  if (kind === "apex") {
    return [
      {
        type: "A",
        host: "@",
        value: targets.apexIp,
        note: "Points your root domain (no www) to Olune.",
      },
    ];
  }

  const labels = d.split(".");
  const host =
    kind === "www" || d.startsWith("www.")
      ? "www"
      : labels[0] ?? "www";

  return [
    {
      type: "CNAME",
      host,
      value: targets.cname,
      note: "Points your domain to Olune. DNS changes can take up to 48 hours.",
    },
  ];
}

export function domainTargets() {
  return {
    cname: process.env.NEXT_PUBLIC_DOMAIN_CNAME_TARGET ?? "cname.vercel-dns.com",
    apexIp: process.env.NEXT_PUBLIC_DOMAIN_APEX_IP ?? "216.198.79.1",
  };
}

export function publicSubdomainUrl(slug: string, rootDomain: string, port?: string): string {
  const isLocal = rootDomain === "localhost";
  const host = isLocal ? `${slug}.localhost` : `${slug}.${rootDomain}`;
  if (isLocal) {
    return `http://${host}:${port ?? "3000"}`;
  }
  return `https://${host}`;
}

/** Full public URL for a studio page (homepage or sub-page). */
export function publicPageUrl(
  studioSlug: string,
  opts: { isHome?: boolean; pageSlug?: string; rootDomain?: string; port?: string } = {},
): string {
  const root = opts.rootDomain ?? process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "localhost";
  const port = opts.port ?? process.env.PORT ?? "3000";
  const base = publicSubdomainUrl(studioSlug, root, port);
  if (opts.isHome || !opts.pageSlug) return `${base}/`;
  return `${base}/${opts.pageSlug.replace(/^\//, "")}`;
}

export function publicCustomDomainUrl(domain: string): string {
  const d = normalizeDomainInput(domain);
  return `https://${d}`;
}
