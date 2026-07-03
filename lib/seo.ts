// ============================================================================
//  lib/seo.ts — canonical URL + structured-data helpers shared by every
//  metadata/robots/sitemap entry point. Multi-tenant, so nothing here is
//  static: origin is always derived from the incoming request host.
// ============================================================================

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "olune.app";

/** Absolute origin (protocol + host) for the incoming request host header. */
export function originForHost(host: string | null): string {
  if (!host) return `https://${ROOT_DOMAIN}`;
  const hostname = host.split(":")[0];
  const isLocal = hostname === "localhost" || hostname.endsWith(".localhost");
  return `${isLocal ? "http" : "https"}://${host}`;
}

/** JSON-LD SoftwareApplication schema for the root Olune marketing site. */
export function organizationJsonLd(origin: string) {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Olune",
    url: origin,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    description:
      "The studio management system for projects, finances, and live client websites — all in real time.",
    offers: {
      "@type": "Offer",
      price: "19",
      priceCurrency: "USD",
    },
  } as const;
}

/** JSON-LD LocalBusiness (ExerciseGym) schema for a studio's public site. */
export function studioLocalBusinessJsonLd(params: {
  origin: string;
  studioName: string;
  tagline?: string | null;
  logoUrl?: string | null;
  contactEmail?: string;
  contactPhone?: string;
  regionLabel?: string;
}) {
  const { origin, studioName, tagline, logoUrl, contactEmail, contactPhone, regionLabel } = params;
  return {
    "@context": "https://schema.org",
    "@type": "ExerciseGym",
    name: studioName,
    url: origin,
    ...(logoUrl ? { logo: logoUrl, image: logoUrl } : {}),
    ...(tagline ? { description: tagline } : {}),
    ...(contactEmail ? { email: contactEmail } : {}),
    ...(contactPhone ? { telephone: contactPhone } : {}),
    ...(regionLabel
      ? { address: { "@type": "PostalAddress", addressLocality: regionLabel } }
      : {}),
  } as const;
}

/** JSON-LD FAQPage schema — feeds Google's FAQ rich-result snippet. */
export function faqPageJsonLd(items: { q: string; a: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map(({ q, a }) => ({
      "@type": "Question",
      name: q,
      acceptedAnswer: { "@type": "Answer", text: a },
    })),
  } as const;
}

/** JSON-LD Person schema for a founder / team bio page. */
export function personJsonLd(params: {
  origin: string;
  name: string;
  jobTitle: string;
  description: string;
  worksFor: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    name: params.name,
    jobTitle: params.jobTitle,
    description: params.description,
    url: params.origin,
    worksFor: { "@type": "Organization", name: params.worksFor, url: params.origin },
  } as const;
}
