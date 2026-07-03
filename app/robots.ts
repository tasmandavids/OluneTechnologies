// ============================================================================
//  app/robots.ts — dynamic per-host robots.txt.
//  Served on every host (root marketing + every studio subdomain/custom
//  domain), since the same route tree answers all of them. App-only paths
//  (auth-gated portals, admin tooling, internal preview routes) are blocked
//  everywhere; everything else — marketing pages and a studio's public site
//  — is crawlable.
// ============================================================================

import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { originForHost } from "@/lib/seo";

const DISALLOWED_PATHS = [
  "/portal",
  "/platform",
  "/settings",
  "/onboarding",
  "/login",
  "/setup",
  "/welcome",
  "/builder-sandbox",
  "/site-preview",
  "/site-preview-v2",
  "/api",
  "/auth",
  "/actions",
];

export default async function robots(): Promise<MetadataRoute.Robots> {
  const host = (await headers()).get("host");
  const origin = originForHost(host);

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: DISALLOWED_PATHS,
    },
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  };
}
