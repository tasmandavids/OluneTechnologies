// ============================================================================
//  app/team/page.tsx — Server Component wrapper. Team story UI is a
//  client component (in-view animations), which can't export metadata
//  itself, so this file owns generateMetadata + Organization structured data.
// ============================================================================

import type { Metadata } from "next";
import { TeamPageClient } from "@/components/marketing/landing/TeamPageClient";
import { JsonLd } from "@/components/seo/JsonLd";
import { organizationJsonLd, originForHost, rootUrl } from "@/lib/seo";
import { headers } from "next/headers";

export const metadata: Metadata = {
  title: "Meet the team",
  description:
    "Olune is built hands-on by a small team who lived the studio-admin problem it solves — the story behind the product.",
  alternates: { canonical: rootUrl("/team") },
};

export default async function TeamPage() {
  const origin = originForHost((await headers()).get("host"));

  return (
    <>
      <JsonLd data={organizationJsonLd(origin)} />
      <TeamPageClient />
    </>
  );
}
