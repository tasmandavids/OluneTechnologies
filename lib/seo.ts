// ============================================================================
//  lib/seo.ts — canonical URL + structured-data helpers shared by every
//  metadata/robots/sitemap entry point. Multi-tenant, so nothing here is
//  static: origin is always derived from the incoming request host.
// ============================================================================

import { CURRENCY_CODE } from "@/lib/currency";

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "olune.app";

/**
 * The origin Olune-brand pages actually serve a 200 on — the one URL Google
 * should index. Deliberately NOT derived from ROOT_DOMAIN: in production the
 * apex (olune.co.nz) 308-redirects to www, and a canonical pointing at a
 * redirect is a canonical Google has to second-guess. NEXT_PUBLIC_APP_URL is
 * already normalized to that host for OAuth, so reuse it.
 */
export const CANONICAL_ORIGIN = (() => {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "");
  if (appUrl) return appUrl;
  const isLocal = ROOT_DOMAIN === "localhost" || ROOT_DOMAIN.endsWith(".localhost");
  return isLocal ? "http://localhost:3000" : `https://${ROOT_DOMAIN}`;
})();

/**
 * Absolute URL on the canonical marketing origin, ignoring the request host.
 *
 * Olune-brand pages (/faq, /team, /privacy…) are served on every studio
 * subdomain and custom domain too, so their canonical has to point at the one
 * authoritative copy rather than at whatever host the request arrived on.
 */
export function rootUrl(path = "/"): string {
  return `${CANONICAL_ORIGIN}${path === "/" ? "" : path}`;
}

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
    // Must match the entry-tier price rendered in the pricing section — Google
    // rejects structured data that contradicts the visible page.
    offers: {
      "@type": "Offer",
      price: "19",
      priceCurrency: CURRENCY_CODE,
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

/** JSON-LD Person schema for a public instructor profile or team bio page. */
export function personJsonLd(params: {
  /** Canonical URL of the page describing this person. */
  url: string;
  name: string;
  jobTitle?: string | null;
  description?: string | null;
  image?: string | null;
  /** City or region the person teaches in. */
  areaServed?: string | null;
  /** Disciplines, certifications — anything they're credentialed in. */
  knowsAbout?: string[];
  worksFor?: { name: string; url: string } | null;
}) {
  const { url, name, jobTitle, description, image, areaServed, knowsAbout, worksFor } = params;
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    name,
    url,
    ...(jobTitle ? { jobTitle } : {}),
    ...(description ? { description } : {}),
    ...(image ? { image } : {}),
    ...(areaServed ? { areaServed } : {}),
    ...(knowsAbout?.length ? { knowsAbout } : {}),
    ...(worksFor
      ? { worksFor: { "@type": "Organization", name: worksFor.name, url: worksFor.url } }
      : {}),
  } as const;
}
