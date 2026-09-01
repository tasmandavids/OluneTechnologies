// ============================================================================
//  Tenant resolution — find the studio a request belongs to.
//
//  The web resolves by host:
//    <slug>.olune.app          → match studios.slug
//    book.mystudio.co.nz        → match studios.custom_domain
//    <slug>.localhost:3000      → local dev
//
//  The native app cannot. One binary has no hostname, so it asks the parent
//  which studio they are with and then carries the id. `resolveStudio(host)` is
//  therefore no longer *the* resolver — it is the host-shaped one, built on the
//  same primitives as the slug and id lookups the app uses.
//
//  Studio identity is public-readable (see RLS: `status <> 'suspended'`), so
//  all of this works pre-login — which it must, because choosing a studio comes
//  before signing in.
// ============================================================================

import { cache } from "react";
import { createPublicClient } from "./supabase/public";
import { isPlatformHost, slugFromHost } from "./tenant-host";
import { STUDIO_QUERY_LIMIT, isStudioSlug, sanitizeStudioQuery } from "./tenant-search";
import type { Studio } from "./types";

export { isTenantHost, slugFromHost } from "./tenant-host";

const STUDIO_COLUMNS = "id, name, slug, custom_domain, status";

type StudioRow = {
  id: string;
  name: string;
  slug: string;
  custom_domain: string | null;
  status: string;
};

function mapStudio(row: StudioRow): Studio {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    customDomain: row.custom_domain,
    status: row.status,
  };
}

/** Resolve the studio for a host. Returns null on the marketing root / unknown host. */
export const resolveStudio = cache(async (host: string | null): Promise<Studio | null> => {
  if (!host) return null;
  const hostname = host.split(":")[0];
  const slug = slugFromHost(host);

  // Marketing apex / dev root — no tenant; skip the custom_domain lookup.
  if (!slug && isPlatformHost(hostname)) return null;

  const supabase = createPublicClient();
  const query = supabase.from("studios").select(STUDIO_COLUMNS);
  const { data } = slug
    ? await query.eq("slug", slug).single()
    : await query.eq("custom_domain", hostname).single();

  if (!data) return null;
  return mapStudio(data as StudioRow);
});

/**
 * Resolve a studio by its slug — the code a studio puts on a welcome email, and
 * what the app stores once a parent has chosen.
 */
export const resolveStudioBySlug = cache(async (slug: string | null): Promise<Studio | null> => {
  if (!isStudioSlug(slug)) return null;
  const supabase = createPublicClient();
  const { data } = await supabase
    .from("studios")
    .select(STUDIO_COLUMNS)
    .eq("slug", slug!.trim())
    .single();
  return data ? mapStudio(data as StudioRow) : null;
});

/**
 * Resolve a studio by id — what the app holds after first launch, and what a
 * per-studio white-label binary would be built with.
 */
export const resolveStudioById = cache(async (id: string | null): Promise<Studio | null> => {
  if (!id) return null;
  const supabase = createPublicClient();
  const { data } = await supabase.from("studios").select(STUDIO_COLUMNS).eq("id", id).single();
  return data ? mapStudio(data as StudioRow) : null;
});

/**
 * Search studios for the app's "which studio are you with?" screen.
 *
 * Matches a name substring or a slug prefix. An exact slug match is hoisted to
 * the front: a parent who typed the code from their welcome email meant that
 * studio, not a studio whose name happens to contain the same letters.
 *
 * Returns [] rather than throwing on a query too short to be useful — an empty
 * search box is a state, not an error.
 */
export async function findStudios(rawQuery: unknown): Promise<Studio[]> {
  const q = sanitizeStudioQuery(rawQuery);
  if (!q) return [];

  const supabase = createPublicClient();
  const { data } = await supabase
    .from("studios")
    .select(STUDIO_COLUMNS)
    // `*` is PostgREST's wildcard inside a filter string, not `%`. The term is
    // sanitized in lib/tenant-search.ts so it cannot carry filter grammar.
    .or(`name.ilike.*${q}*,slug.ilike.${q}*`)
    .order("name", { ascending: true })
    .limit(STUDIO_QUERY_LIMIT);

  const studios = (data ?? []).map((row) => mapStudio(row as StudioRow));
  const exact = q.toLowerCase();
  return studios.sort((a, b) => {
    const aExact = a.slug.toLowerCase() === exact ? 0 : 1;
    const bExact = b.slug.toLowerCase() === exact ? 0 : 1;
    return aExact - bExact;
  });
}
