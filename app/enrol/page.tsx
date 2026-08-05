// ============================================================================
//  /enrol — Public trial booking: class picker + CRM lead capture.
// ============================================================================

import { headers } from "next/headers";
import { resolveStudio } from "@/lib/tenant";
import { getBrandingCached, DEFAULT_BRANDING } from "@/lib/branding";
import { getSiteScheduleClasses } from "@/lib/public-classes";
import EnrolPage, { EnrolNoStudio, type EnrolClassOption } from "@/components/marketing/EnrolPage";

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
