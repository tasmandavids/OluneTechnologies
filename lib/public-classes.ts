// ============================================================================
//  lib/public-classes.ts — public class-schedule read, used by the
//  enrolment and programmes marketing pages. Salvaged from the old
//  lib/site/queries.ts (v1 site builder) before that module was deleted —
//  this query has nothing to do with page/block rendering.
// ============================================================================

import { createPublicClient } from "@/lib/supabase/public";

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

/** Every class for a studio, ordered for a weekly timetable display. */
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
