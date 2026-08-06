import "server-only";

// ============================================================================
//  Resolving a studio's GA4 measurement ID for the public site.
//
//  The GA4 card stored a measurement ID that nothing ever rendered. This is the
//  read side — deliberately narrow: it returns the ID and nothing else, so a
//  layout can't accidentally pull a credential blob into a page render.
//
//  Cached hard. The root layout runs on every public request, and
//  studio_integrations is admin-only under RLS, so this read has to go through
//  the service role. An uncached service-role query per page view would be both
//  slow and a bad habit; five minutes of staleness on an analytics tag costs
//  nothing.
// ============================================================================

import { cache } from "react";
import { unstable_cache } from "next/cache";
import { getStudioConnectionAdmin } from "./credentials";

/** `G-` followed by the account's short code. Anything else isn't a GA4 tag. */
const MEASUREMENT_ID = /^G-[A-Z0-9]{4,20}$/i;

async function readMeasurementId(studioId: string): Promise<string | null> {
  const connection = await getStudioConnectionAdmin(studioId, "ga4");
  const id = connection?.values.measurementId?.trim();
  if (!id || !MEASUREMENT_ID.test(id)) return null;
  return id.toUpperCase();
}

/**
 * The studio's GA4 measurement ID, or null when it hasn't connected one (or
 * typed something that isn't a measurement ID).
 *
 * `cache` dedupes within a single render; `unstable_cache` shares the result
 * across requests for five minutes.
 */
export const getStudioMeasurementId = cache(
  async (studioId: string): Promise<string | null> =>
    unstable_cache(() => readMeasurementId(studioId), ["ga4-measurement-id", studioId], {
      tags: [`integrations-${studioId}`],
      revalidate: 300,
    })(),
);
