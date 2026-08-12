// ============================================================================
//  lib/timeclock/queries.ts
//
//  The reads behind the time clock surfaces. Every function takes a Supabase
//  client rather than making one, so the same code serves a staff member's own
//  card (anon client, RLS self-read) and a manager's queue (anon client,
//  is_studio_admin policy) without either being able to reach the other's rows
//  by accident — the policies in 0118 decide that, not a flag passed in here.
//
//  Arithmetic lives in hours.ts and stays pure. This module only fetches and
//  reshapes.
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import { entryMinutes, shiftMinutes, totalMinutes, varianceMinutes } from "@/lib/timeclock/hours";
import type { ClockState, ManagedTimesheet, TimesheetEntry } from "@/lib/timeclock/types";
import { getWeekRange } from "@/lib/staff/week";

const ENTRY_COLUMNS =
  "id, staff_id, entry_date, clock_in_at, clock_out_at, hour_type, source, location_name, note, approved_at";

type EntryRow = {
  id: string;
  staff_id: string;
  entry_date: string;
  clock_in_at: string;
  clock_out_at: string | null;
  hour_type: string;
  source: string;
  location_name: string | null;
  note: string | null;
  approved_at: string | null;
};

function toEntry(row: EntryRow): TimesheetEntry {
  const entry = {
    id: row.id,
    entryDate: row.entry_date,
    clockInAt: row.clock_in_at,
    clockOutAt: row.clock_out_at,
    hourType: row.hour_type as TimesheetEntry["hourType"],
    source: row.source as TimesheetEntry["source"],
    locationName: row.location_name,
    note: row.note,
    approvedAt: row.approved_at,
  };
  return { ...entry, minutes: entryMinutes(entry) };
}

/**
 * Sum rostered minutes per `staffId:date` from staff_shifts rows.
 *
 * Summed rather than taken from one row because a split day — morning desk,
 * evening class — is two shifts and one working day.
 */
function scheduleIndex(
  rows: { staff_id: string; shift_date: string; start_time: string; end_time: string }[],
): Map<string, number> {
  const index = new Map<string, number>();
  for (const row of rows) {
    const minutes = shiftMinutes(row.start_time, row.end_time);
    if (minutes === null) continue;
    const key = `${row.staff_id}:${row.shift_date}`;
    index.set(key, (index.get(key) ?? 0) + minutes);
  }
  return index;
}

/**
 * Everything the clock card shows one staff member about their own week.
 *
 * The open shift is read separately from the week's entries rather than
 * filtered out of them: a shift opened before midnight on Sunday is still open
 * on Monday, and a card that only looked inside the current week would tell
 * someone they weren't clocked in while they were standing at work.
 */
export async function getClockState(
  supabase: SupabaseClient,
  staffId: string,
  base = new Date(),
): Promise<ClockState> {
  const { weekStart, weekEnd } = getWeekRange(base);

  const [openRes, entriesRes, shiftsRes] = await Promise.all([
    supabase
      .from("staff_time_entries")
      .select("id, clock_in_at, source")
      .eq("staff_id", staffId)
      .is("clock_out_at", null)
      .maybeSingle(),

    supabase
      .from("staff_time_entries")
      .select(ENTRY_COLUMNS)
      .eq("staff_id", staffId)
      .gte("entry_date", weekStart)
      .lte("entry_date", weekEnd)
      .order("entry_date", { ascending: false })
      .order("clock_in_at", { ascending: false }),

    supabase
      .from("staff_shifts")
      .select("staff_id, shift_date, start_time, end_time")
      .eq("staff_id", staffId)
      .gte("shift_date", weekStart)
      .lte("shift_date", weekEnd),
  ]);

  const entries = ((entriesRes.data ?? []) as EntryRow[]).map(toEntry);
  const schedule = scheduleIndex(
    (shiftsRes.data ?? []) as { staff_id: string; shift_date: string; start_time: string; end_time: string }[],
  );

  let scheduledMinutes = 0;
  for (const minutes of schedule.values()) scheduledMinutes += minutes;

  const open = openRes.data
    ? {
        id: openRes.data.id as string,
        clockInAt: openRes.data.clock_in_at as string,
        source: openRes.data.source as TimesheetEntry["source"],
      }
    : null;

  return {
    open,
    entries,
    weekMinutes: totalMinutes(entries),
    scheduledMinutes,
    weekStart,
    weekEnd,
  };
}

export type TimesheetFilter = {
  /** Inclusive studio-local date bounds. */
  from: string;
  to: string;
  /** Default false — the queue wants what still needs a decision. */
  includeApproved?: boolean;
};

/**
 * A studio's timesheets over a date window, each measured against its roster.
 *
 * Open entries are included on purpose. A shift left open for three days is
 * precisely the thing a manager needs to see and fix, and hiding it until it
 * closes means it never surfaces at all.
 */
export async function getStudioTimesheets(
  supabase: SupabaseClient,
  studioId: string,
  filter: TimesheetFilter,
): Promise<ManagedTimesheet[]> {
  let query = supabase
    .from("staff_time_entries")
    .select(ENTRY_COLUMNS)
    .eq("studio_id", studioId)
    .gte("entry_date", filter.from)
    .lte("entry_date", filter.to)
    .order("entry_date", { ascending: false })
    .order("clock_in_at", { ascending: false });

  if (!filter.includeApproved) query = query.is("approved_at", null);

  const entriesRes = await query;
  const rows = (entriesRes.data ?? []) as EntryRow[];
  if (rows.length === 0) return [];

  const staffIds = [...new Set(rows.map((r) => r.staff_id))];

  const [shiftsRes, profilesRes] = await Promise.all([
    supabase
      .from("staff_shifts")
      .select("staff_id, shift_date, start_time, end_time")
      .eq("studio_id", studioId)
      .in("staff_id", staffIds)
      .gte("shift_date", filter.from)
      .lte("shift_date", filter.to),

    supabase.from("profiles").select("id, full_name").in("id", staffIds),
  ]);

  const schedule = scheduleIndex(
    (shiftsRes.data ?? []) as { staff_id: string; shift_date: string; start_time: string; end_time: string }[],
  );
  const names = new Map(
    ((profilesRes.data ?? []) as { id: string; full_name: string | null }[]).map((p) => [
      p.id,
      p.full_name,
    ]),
  );

  return rows.map((row) => {
    const entry = toEntry(row);
    const scheduled = schedule.get(`${row.staff_id}:${row.entry_date}`) ?? null;
    return {
      ...entry,
      staffId: row.staff_id,
      staffName: names.get(row.staff_id) ?? null,
      scheduledMinutes: scheduled,
      // Only comparable once both halves exist: an open shift has no actual and
      // an unrostered day has no scheduled.
      varianceMinutes:
        entry.minutes !== null && scheduled !== null
          ? varianceMinutes(entry.minutes, scheduled)
          : null,
    };
  });
}
