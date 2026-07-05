// ============================================================================
//  /[siteSlug] — public studio website sub-pages (e.g. /about, /classes).
//  Static routes (/portal, /login, /enrol, /onboarding, /programmes, /api)
//  take precedence over this dynamic segment, so only studio-defined page
//  slugs resolve here. The homepage lives at / (app/page.tsx).
// ============================================================================

import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { resolveStudio } from "@/lib/tenant";
import { getPublishedPageCached } from "@/lib/site/cached-queries";
import { PublicSite } from "@/components/site/PublicSite";
import { originForHost } from "@/lib/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ siteSlug: string }>;
}): Promise<Metadata> {
  const { siteSlug } = await params;
  const host = (await headers()).get("host");
  const studio = await resolveStudio(host);
  if (!studio) return {};

  const page = await getPublishedPageCached(studio.id, siteSlug);
  if (!page) return {};

  const origin = originForHost(host);
  const title = page.seoTitle || `${page.title} · ${studio.name}`;

  return {
    // Bypass the root layout's "· Olune" title template — this is the
    // tenant's own storefront page, not an Olune platform page.
    title: { absolute: title },
    description: page.seoDescription || undefined,
    alternates: { canonical: `${origin}/${siteSlug}` },
    openGraph: { title, description: page.seoDescription || undefined, url: `${origin}/${siteSlug}` },
  };
}

export default async function SitePage({
  params,
}: {
  params: Promise<{ siteSlug: string }>;
}) {
  const { siteSlug } = await params;
  const host = (await headers()).get("host");
  const studio = await resolveStudio(host);
  if (!studio) notFound();

  const page = await getPublishedPageCached(studio.id, siteSlug);
  if (!page) notFound();

  return <PublicSite studio={{ id: studio.id, name: studio.name }} page={page} />;
}
