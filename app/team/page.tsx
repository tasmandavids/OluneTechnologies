// ============================================================================
//  app/team/page.tsx — Server Component wrapper. Founder story UI is a
//  client component (in-view animations), which can't export metadata
//  itself, so this file owns generateMetadata + Person structured data.
// ============================================================================

import type { Metadata } from "next";
import { TeamPageClient } from "@/components/marketing/landing/TeamPageClient";
import { JsonLd } from "@/components/seo/JsonLd";
import { personJsonLd, originForHost } from "@/lib/seo";
import { headers } from "next/headers";

export const metadata: Metadata = {
  title: "Meet the team",
  description:
    "Olune is built hands-on by a founder who lived the studio-admin problem it solves — the story behind the product.",
};

export default async function TeamPage() {
  const origin = originForHost((await headers()).get("host"));

  return (
    <>
      <JsonLd
        data={personJsonLd({
          origin,
          name: "Tasman Davids",
          jobTitle: "Founder",
          description: "Founder of Olune, the studio management system for projects, finances, and live client websites.",
          worksFor: "Olune",
        })}
      />
      <TeamPageClient />
    </>
  );
}
