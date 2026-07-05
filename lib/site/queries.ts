// ============================================================================
//  lib/site/queries.ts — server-side reads for the public website.
//  Uses the request-scoped (anon) Supabase client; RLS exposes published
//  pages and public catalog data to anonymous visitors.
// ============================================================================

import { createPublicClient } from "@/lib/supabase/public";
import { normalizeBlocks, type Block } from "./blocks";
import { normalizePageBackground, type PageBackground } from "./background";
import { buildStudioNavLinks, toStudioPageNavSource } from "./page-links";

export type PublicPage = {
  id: string;
  slug: string;
  title: string;
  blocks: Block[];
  background: PageBackground;
  seoTitle: string | null;
  seoDescription: string | null;
};

export type NavLink = {
  slug: string;
  label: string;
  isHome: boolean;
};

/** Minimal shape for sitemap generation — every published page, nav or not. */
export type SitemapPage = {
  slug: string;
  isHome: boolean;
  updatedAt: string;
};

/** A class summary for site blocks. */
export type SiteClass = {
  id: string;
  name: string;
  discipline: string | null;
  level: string | null;
  stream: string | null;
  room: string | null;
  dayOfWeek: number | null;
  startTime: string | null;
  endTime: string | null;
  priceCents: number;
};

export type SiteEvent = {
  id: string;
  name: string;
  description: string | null;
  eventDate: string;
  category: string;
  imageUrl: string | null;
  venueName: string | null;
};

export type SiteProduct = {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  imageUrl: string | null;
  category: string | null;
  stockQty: number;
};

export type SiteStaff = {
  id: string;
  name: string;
  role: string | null;
  bio: string | null;
  photoUrl: string | null;
};

/** Published homepage for a studio (the page flagged is_home). */
export async function getPublishedHome(studioId: string): Promise<PublicPage | null> {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from("site_pages")
    .select("id, slug, title, blocks, background, seo_title, seo_description")
    .eq("studio_id", studioId)
    .eq("status", "published")
    .eq("is_home", true)
    .maybeSingle();
  return data ? toPublicPage(data) : null;
}

/** Published page for a studio by slug. */
export async function getPublishedPage(
  studioId: string,
  slug: string,
): Promise<PublicPage | null> {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from("site_pages")
    .select("id, slug, title, blocks, background, seo_title, seo_description")
    .eq("studio_id", studioId)
    .eq("status", "published")
    .eq("slug", slug)
    .maybeSingle();
  return data ? toPublicPage(data) : null;
}

/** Every published page for a studio, incl. pages hidden from nav — sitemap source. */
export async function getSitemapPages(studioId: string): Promise<SitemapPage[]> {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from("site_pages")
    .select("slug, is_home, updated_at")
    .eq("studio_id", studioId)
    .eq("status", "published");

  return (data ?? []).map((row) => ({
    slug: row.slug,
    isHome: row.is_home,
    updatedAt: row.updated_at,
  }));
}

/** Navigation links from published, in-nav pages (home first). */
export async function getNavLinks(studioId: string): Promise<NavLink[]> {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from("site_pages")
    .select("id, slug, title, nav_label, is_home, show_in_nav, nav_order")
    .eq("studio_id", studioId)
    .eq("status", "published")
    .eq("show_in_nav", true)
    .order("is_home", { ascending: false })
    .order("nav_order", { ascending: true });

  return buildStudioNavLinks((data ?? []).map(toStudioPageNavSource));
}

/** Active classes for site blocks (public-readable via RLS). */
export async function getSiteClasses(studioId: string, limit = 6): Promise<SiteClass[]> {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from("classes")
    .select("id, name, discipline, level, stream, room, day_of_week, start_time, end_time, price_cents")
    .eq("studio_id", studioId)
    .order("name")
    .limit(Math.max(1, Math.min(100, limit)));

  return (data ?? []).map(mapClass);
}

/** All classes for schedule/tabs blocks. */
export async function getSiteScheduleClasses(studioId: string): Promise<SiteClass[]> {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from("classes")
    .select("id, name, discipline, level, stream, room, day_of_week, start_time, end_time, price_cents")
    .eq("studio_id", studioId)
    .order("day_of_week", { ascending: true, nullsFirst: false })
    .order("start_time", { ascending: true, nullsFirst: false });

  return (data ?? []).map(mapClass);
}

/** Published events for the news feed block. */
export async function getSiteEvents(studioId: string, limit = 12): Promise<SiteEvent[]> {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from("events")
    .select("id, name, description, event_date, category, image_url, venue_name")
    .eq("studio_id", studioId)
    .eq("status", "published")
    .order("event_date", { ascending: false })
    .limit(Math.max(1, Math.min(50, limit)));

  return (data ?? []).map((e) => ({
    id: e.id as string,
    name: e.name as string,
    description: e.description as string | null,
    eventDate: e.event_date as string,
    category: (e.category as string | null) ?? "events",
    imageUrl: e.image_url as string | null,
    venueName: e.venue_name as string | null,
  }));
}

/** Active products for the shop block. */
export async function getSiteProducts(studioId: string, limit = 24): Promise<SiteProduct[]> {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from("products")
    .select("id, name, description, price_cents, image_url, category, stock_qty")
    .eq("studio_id", studioId)
    .eq("active", true)
    .order("name")
    .limit(Math.max(1, Math.min(100, limit)));

  return (data ?? []).map((p) => ({
    id: p.id as string,
    name: p.name as string,
    description: p.description as string | null,
    priceCents: (p.price_cents as number | null) ?? 0,
    imageUrl: p.image_url as string | null,
    category: p.category as string | null,
    stockQty: (p.stock_qty as number | null) ?? 0,
  }));
}

/** Published staff for the people grid block. */
export async function getSiteStaff(studioId: string, limit = 24): Promise<SiteStaff[]> {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from("staff")
    .select("id, name, role, bio, photo_url")
    .eq("studio_id", studioId)
    .eq("published", true)
    .order("sort_order")
    .order("name")
    .limit(Math.max(1, Math.min(50, limit)));

  return (data ?? []).map((s) => ({
    id: s.id as string,
    name: s.name as string,
    role: s.role as string | null,
    bio: s.bio as string | null,
    photoUrl: s.photo_url as string | null,
  }));
}

type Row = {
  id: string;
  slug: string;
  title: string;
  blocks: unknown;
  background?: unknown;
  seo_title: string | null;
  seo_description: string | null;
};

function toPublicPage(row: Row): PublicPage {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    blocks: normalizeBlocks(row.blocks),
    background: normalizePageBackground(row.background),
    seoTitle: row.seo_title,
    seoDescription: row.seo_description,
  };
}

function mapClass(c: Record<string, unknown>): SiteClass {
  return {
    id: c.id as string,
    name: c.name as string,
    discipline: c.discipline as string | null,
    level: c.level as string | null,
    stream: c.stream as string | null,
    room: c.room as string | null,
    dayOfWeek: c.day_of_week as number | null,
    startTime: c.start_time as string | null,
    endTime: c.end_time as string | null,
    priceCents: (c.price_cents as number | null) ?? 0,
  };
}

/** Scan blocks to determine what live data a page needs. */
export function pageDataNeeds(blocks: Block[]) {
  let classLimit = 0;
  let needsSchedule = false;
  let eventLimit = 0;
  let productLimit = 0;
  let staffLimit = 0;

  for (const b of blocks) {
    if (b.type === "classGrid") {
      const limit = typeof b.props.limit === "number" ? b.props.limit : 6;
      classLimit = Math.max(classLimit, limit);
    }
    if (b.type === "classTabs") {
      const limit = typeof b.props.limit === "number" ? b.props.limit : 50;
      classLimit = Math.max(classLimit, limit);
    }
    if (b.type === "schedule") needsSchedule = true;
    if (b.type === "newsFeed") {
      const limit = typeof b.props.limit === "number" ? b.props.limit : 6;
      eventLimit = Math.max(eventLimit, limit);
    }
    if (b.type === "shopGrid") {
      const limit = typeof b.props.limit === "number" ? b.props.limit : 24;
      productLimit = Math.max(productLimit, limit);
    }
    if (b.type === "peopleGrid" && b.props.source !== "manual") {
      const limit = typeof b.props.limit === "number" ? b.props.limit : 24;
      staffLimit = Math.max(staffLimit, limit);
    }
  }

  return { classLimit, needsSchedule, eventLimit, productLimit, staffLimit };
}
