import { unstable_cache } from "next/cache";
import {
  getNavLinks,
  getPublishedHome,
  getPublishedPage,
  getSitemapPages,
  type NavLink,
  type PublicPage,
  type SitemapPage,
} from "./queries";

const SITE_REVALIDATE_SECONDS = 300;

export function siteCacheTag(studioId: string) {
  return `site-${studioId}`;
}

export function pageCacheTag(studioId: string, slug: string) {
  return `page-${studioId}-${slug}`;
}

export const getNavLinksCached = (studioId: string): Promise<NavLink[]> =>
  unstable_cache(() => getNavLinks(studioId), ["nav-links", studioId], {
    tags: [siteCacheTag(studioId)],
    revalidate: SITE_REVALIDATE_SECONDS,
  })();

export const getPublishedHomeCached = (studioId: string): Promise<PublicPage | null> =>
  unstable_cache(() => getPublishedHome(studioId), ["published-home", studioId], {
    tags: [siteCacheTag(studioId), pageCacheTag(studioId, "home")],
    revalidate: SITE_REVALIDATE_SECONDS,
  })();

export const getPublishedPageCached = (studioId: string, slug: string): Promise<PublicPage | null> =>
  unstable_cache(() => getPublishedPage(studioId, slug), ["published-page", studioId, slug], {
    tags: [siteCacheTag(studioId), pageCacheTag(studioId, slug)],
    revalidate: SITE_REVALIDATE_SECONDS,
  })();

export const getSitemapPagesCached = (studioId: string): Promise<SitemapPage[]> =>
  unstable_cache(() => getSitemapPages(studioId), ["sitemap-pages", studioId], {
    tags: [siteCacheTag(studioId)],
    revalidate: SITE_REVALIDATE_SECONDS,
  })();
