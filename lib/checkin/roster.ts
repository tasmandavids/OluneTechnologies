// ============================================================================
//  lib/checkin/roster.ts
//
//  "Who's in the building right now" — each student's latest tap today,
//  where that latest tap is a check-in with no later check-out. Plain query,
//  not a materialized view: this needs to be live, matching how the rest of
//  the admin dashboard does ad-hoc queries rather than precomputed state.
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import { studioLocalYmd } from "@/lib/date/studio-date";

export type RosterEntry = {
  studentId: string;
  fullName: string | null;
  tappedInAt: string;
};

type TapRow = {
  student_id: string;
  direction: string;
  tapped_at: string;
  profiles: { full_name: string | null } | null;
};

export async function listWhosIn(supabase: SupabaseClient, studioId: string): Promise<RosterEntry[]> {
  const { data: studio } = await supabase.from("studios").select("timezone").eq("id", studioId).maybeSingle();
  const timezone = studio?.timezone ?? null;
  const todayYmd = studioLocalYmd(timezone);

  // Cheap fixed lower bound (36h covers every timezone's "today" plus slop)
  // to keep the scanned set small before the exact per-row day check below.
  const since = new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString();

  const { data: taps } = await supabase
    .from("building_taps")
    .select("student_id, direction, tapped_at, profiles!student_id ( full_name )")
    .eq("studio_id", studioId)
    .gte("tapped_at", since)
    .order("tapped_at", { ascending: false });

  const rows = (taps ?? []) as unknown as TapRow[];

  const latestByStudent = new Map<string, TapRow>();
  for (const tap of rows) {
    if (studioLocalYmd(timezone, new Date(tap.tapped_at)) !== todayYmd) continue;
    if (!latestByStudent.has(tap.student_id)) latestByStudent.set(tap.student_id, tap);
  }

  return Array.from(latestByStudent.values())
    .filter((tap) => tap.direction === "in")
    .map((tap) => ({
      studentId: tap.student_id,
      fullName: tap.profiles?.full_name ?? null,
      tappedInAt: tap.tapped_at,
    }))
    .sort((a, b) => a.tappedInAt.localeCompare(b.tappedInAt));
}
