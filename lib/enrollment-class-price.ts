// ============================================================================
//  Server-authoritative class pricing for parent enrollment / auto-pay.
//  Never trust client-supplied priceCents — always load from classes.
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";

export type ClassPriceRow = {
  id: string;
  name: string;
  priceCents: number;
  studioId: string;
  recurringGroupId: string | null;
};

/**
 * Load class fee + name from the DB, scoped to the caller's studio.
 * Returns null when the class is missing or belongs to another studio.
 */
export async function loadStudioClassPrice(
  supabase: SupabaseClient,
  studioId: string,
  classId: string,
): Promise<ClassPriceRow | null> {
  const { data } = await supabase
    .from("classes")
    .select("id, name, price_cents, studio_id, recurring_group_id")
    .eq("id", classId)
    .eq("studio_id", studioId)
    .maybeSingle();

  if (!data) return null;

  return {
    id: data.id as string,
    name: (data.name as string) ?? "",
    priceCents: Number(data.price_cents ?? 0),
    studioId: data.studio_id as string,
    recurringGroupId: (data.recurring_group_id as string | null) ?? null,
  };
}

/** Batch variant — returns a map keyed by class id (missing ids omitted). */
export async function loadStudioClassPrices(
  supabase: SupabaseClient,
  studioId: string,
  classIds: string[],
): Promise<Map<string, ClassPriceRow>> {
  const result = new Map<string, ClassPriceRow>();
  if (!classIds.length) return result;

  const { data } = await supabase
    .from("classes")
    .select("id, name, price_cents, studio_id, recurring_group_id")
    .eq("studio_id", studioId)
    .in("id", classIds);

  for (const row of data ?? []) {
    result.set(row.id as string, {
      id: row.id as string,
      name: (row.name as string) ?? "",
      priceCents: Number(row.price_cents ?? 0),
      studioId: row.studio_id as string,
      recurringGroupId: (row.recurring_group_id as string | null) ?? null,
    });
  }

  return result;
}
