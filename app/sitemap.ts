// ============================================================================
//  app/sitemap.ts — dynamic per-host sitemap.xml.
//  Root/marketing host → curated static marketing routes.
//  Studio host (slug subdomain or custom domain) → that studio's single
//  published website (one page, in-page sections — no more sub-page slugs).
// ============================================================================

import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { resolveStudio } from "@/lib/tenant";
import { originForHost } from "@/lib/seo";

const MARKETING_ROUTES: { path: string; priority: number }[] = [
  { path: "", priority: 1 },
  { path: "/mobile", priority: 0.7 },
  { path: "/faq", priority: 0.6 },
  { path: "/team", priority: 0.5 },
  { path: "/instructors", priority: 0.5 },
  { path: "/privacy", priority: 0.3 },
  { path: "/data-deletion", priority: 0.3 },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const host = (await headers()).get("host");
  const origin = originForHost(host);
  const studio = await resolveStudio(host);

  if (!studio) {
    return MARKETING_ROUTES.map(({ path, priority }) => ({
      url: `${origin}${path}`,
      changeFrequency: "weekly",
      priority,
    }));
  }

  return [{ url: origin, changeFrequency: "weekly", priority: 1 }];
}
