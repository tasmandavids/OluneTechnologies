// ============================================================================
//  lib/website/cache.ts — public-site cache tag + cached read, replacing
//  siteCacheTag/getPublishedHomeCached from the old lib/site/cached-queries.ts.
// ============================================================================

import { unstable_cache } from "next/cache";
import { getPublishedWebsiteConfig } from "./queries";
import type { WebsiteConfig } from "./types";

const SITE_REVALIDATE_SECONDS = 300;

export function websiteCacheTag(studioId: string) {
  return `website-${studioId}`;
}

export const getPublishedWebsiteConfigCached = (studioId: string): Promise<WebsiteConfig | null> =>
  unstable_cache(() => getPublishedWebsiteConfig(studioId), ["published-website-config", studioId], {
    tags: [websiteCacheTag(studioId)],
    revalidate: SITE_REVALIDATE_SECONDS,
  })();
