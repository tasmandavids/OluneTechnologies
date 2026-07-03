// ============================================================================
//  Tenant resolution — turn an incoming host into a studio.
//    <slug>.olune.app          → match studios.slug
//    book.mystudio.co.nz        → match studios.custom_domain
//    <slug>.localhost:3000      → local dev
//  Studio identity is public-readable (see RLS), so this works pre-login.
// ============================================================================

import { cache } from "react";
import { createPublicClient } from "./supabase/public";
import { isPlatformHost, slugFromHost } from "./tenant-host";
import type { Studio } from "./types";

export { isTenantHost, slugFromHost } from "./tenant-host";

const STUDIO_COLUMNS = "id, name, slug, custom_domain, status";

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
  return {
    id: data.id,
    name: data.name,
    slug: data.slug,
    customDomain: data.custom_domain,
    status: data.status,
  };
});
