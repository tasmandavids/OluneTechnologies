// Marketing landing — studio-aware.
// Root domain (localhost:3000 / olune.app) → Olune platform marketing page.
// Studio subdomain (nzad.localhost:3000) → that studio's branded cinematic hero.

import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { resolveStudio } from "@/lib/tenant";
import { getTranslations } from "@/lib/i18n/server";
import { getBrandingCached } from "@/lib/branding";
import { getPublishedWebsiteConfigCached } from "@/lib/website/cache";
import { SiteRenderer } from "@/components/website/SiteRenderer";
import { googleFontsStylesheetUrl } from "@/lib/fonts";
import { PoweredByOlune } from "@/components/brand/PoweredByOlune";
import Hero from "@/components/marketing/Hero";
import { ClientParticleBackground } from "@/components/landing/ClientParticleBackground";
import { JsonLd } from "@/components/seo/JsonLd";
import { originForHost, organizationJsonLd, studioLocalBusinessJsonLd } from "@/lib/seo";

const OluneLanding = dynamic(() => import("@/components/marketing/OluneLanding"));

export async function generateMetadata(): Promise<Metadata> {
  const host = (await headers()).get("host");
  const origin = originForHost(host);
  const studio = await resolveStudio(host);

  if (!studio) {
    const t = await getTranslations("meta");
    const title = t("title");
    return {
      // Root layout applies a "%s · Olune" template to child titles; this
      // phrase is already the complete brand line, so bypass it.
      title: { absolute: title },
      description: t("description"),
      alternates: { canonical: origin },
      openGraph: { url: origin },
    };
  }

  const config = await getPublishedWebsiteConfigCached(studio.id);
  const branding = await getBrandingCached(studio.id);
  const title = config?.studioNameOverride || studio.name;
  const description = config?.tagline || branding.tagline || undefined;

  return {
    // A tenant's storefront is their own brand, not Olune's — never let the
    // root layout's "· Olune" title template leak onto a studio's site.
    title: { absolute: title },
    description,
    alternates: { canonical: origin },
    openGraph: { title, description, url: origin, ...(branding.logoUrl ? { images: [branding.logoUrl] } : {}) },
  };
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; next?: string }>;
}) {
  const host = (await headers()).get("host");
  const origin = originForHost(host);
  const studio = await resolveStudio(host);

  // Safety net: if Supabase ever lands an OAuth redirect on the home page
  // (e.g. a host not yet in the redirect allow-list falls back to the Site
  // URL with ?code=…), hand it to the callback route so the code is actually
  // exchanged instead of silently rendering the marketing page.
  const { code, next } = await searchParams;
  if (code) {
    const params = new URLSearchParams({ code });
    if (next) params.set("next", next);
    redirect(`/auth/callback?${params.toString()}`);
  }

  if (!studio) {
    // Root / apex domain — show the Olune platform page.
    return (
      <>
        <JsonLd data={organizationJsonLd(origin)} />
        <OluneLanding />
      </>
    );
  }

  // If the studio has published a website (template + customization), render it.
  const config = await getPublishedWebsiteConfigCached(studio.id);
  const branding = await getBrandingCached(studio.id);
  const studioJsonLd = studioLocalBusinessJsonLd({
    origin,
    studioName: studio.name,
    tagline: branding.tagline,
    logoUrl: branding.logoUrl,
    contactEmail: branding.siteSettings.contactEmail,
    contactPhone: branding.siteSettings.contactPhone,
    regionLabel: branding.siteSettings.regionLabel,
  });

  if (config) {
    const fontsUrl = googleFontsStylesheetUrl(config.fontDisplay, config.fontBody);
    return (
      <>
        <JsonLd data={studioJsonLd} />
        {fontsUrl && <link rel="stylesheet" href={fontsUrl} />}
        <SiteRenderer
          kind={config.kind}
          accent={config.accentColor}
          paper={config.paperColor}
          ink={config.inkColor}
          fontDisplay={config.fontDisplay}
          fontBody={config.fontBody}
          studioName={config.studioNameOverride || studio.name}
          headline={config.headline}
          tagline={config.tagline}
          eyebrow={config.eyebrow}
          sections={config.sections}
          density={config.density}
          logoUrl={config.logoUrl}
          heroImages={config.heroImages}
        />
      </>
    );
  }

  // Fallback — studio hasn't published a homepage yet: branded hero.
  return (
    <div className="relative min-h-screen">
      <JsonLd data={studioJsonLd} />
      <ClientParticleBackground variant="light" />
      <Hero studioName={studio.name} tagline={branding.tagline} />
      <div className="pointer-events-none absolute bottom-[4.75rem] left-[clamp(1.25rem,4vw,4rem)] z-20">
        <PoweredByOlune />
      </div>
    </div>
  );
}
