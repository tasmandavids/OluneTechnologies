// ============================================================================
//  /enrol — Public trial booking: class picker + CRM lead capture.
// ============================================================================

import type { Metadata } from "next";
import { headers } from "next/headers";
import { getTranslations } from "@/lib/i18n/server";
import { resolveStudio } from "@/lib/tenant";
import { getBrandingCached, DEFAULT_BRANDING } from "@/lib/branding";
import { getSiteScheduleClasses } from "@/lib/public-classes";
import { originForHost } from "@/lib/seo";
import EnrolPage, { EnrolNoStudio, type EnrolClassOption } from "@/components/marketing/EnrolPage";

export async function generateMetadata(): Promise<Metadata> {
  const host = (await headers()).get("host");
  const studio = await resolveStudio(host);
  // On the root domain this route only ever renders the "pick a studio"
  // notice — real content for nobody, so keep it out of the index.
  if (!studio) return { robots: { index: false, follow: false } };

  const t = await getTranslations("enrol");
  const title = `${t("title")} — ${studio.name}`;
  const description = t("subtitle");
  const url = `${originForHost(host)}/enrol`;

  return {
    title: { absolute: title },
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url },
  };
}

export default async function EnrolRoute() {
  const host = (await headers()).get("host");
  const studio = await resolveStudio(host);

  if (!studio) {
    return <EnrolNoStudio />;
  }

  const branding = await getBrandingCached(studio.id);
  const siteClasses = await getSiteScheduleClasses(studio.id);

  const classes: EnrolClassOption[] = siteClasses.map((c) => ({
    id: c.id,
    name: c.name,
    discipline: c.discipline,
    level: c.level,
    dayOfWeek: c.dayOfWeek,
    startTime: c.startTime,
    priceCents: c.priceCents,
  }));

  return (
    <EnrolPage
      studioId={studio.id}
      studioName={studio.name}
      tagline={branding.tagline ?? DEFAULT_BRANDING.tagline}
      logoUrl={branding.logoUrl}
      classes={classes}
    />
  );
}
