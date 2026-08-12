// ============================================================================
//  lib/timeclock/types.ts
//
//  The shapes the time clock surfaces pass around. Separate from queries.ts so
//  a client component can import the types without dragging a Supabase client
//  and its server-only dependencies into the browser bundle.
// ============================================================================

import type { HourType } from "@/lib/timeclock/hours";

/** One row of a timesheet, as a surface renders it. */
export type TimesheetEntry = {
  id: string;
  entryDate: string; // YYYY-MM-DD, studio-local
  clockInAt: string; // ISO instant
  clockOutAt: string | null; // null = still on the clock
  hourType: HourType;
  source: "portal" | "nfc" | "manual";
  locationName: string | null;
  note: string | null;
  approvedAt: string | null;
  /** Worked minutes, or null while open. See entryMinutes in hours.ts. */
  minutes: number | null;
};

/** What the clock-in/out card needs to render for the signed-in staff member. */
export type ClockState = {
  /** The shift currently open, if any. */
  open: { id: string; clockInAt: string; source: TimesheetEntry["source"] } | null;
  /** Closed and open entries for the current week, most recent first. */
  entries: TimesheetEntry[];
  /** Closed minutes so far this week. Open shifts contribute nothing. */
  weekMinutes: number;
  /** Rostered minutes this week from staff_shifts, for the variance line. */
  scheduledMinutes: number;
  weekStart: string;
  weekEnd: string;
};

/** A timesheet row in the manager's queue, with the roster it's measured against. */
export type ManagedTimesheet = TimesheetEntry & {
  staffId: string;
  staffName: string | null;
  /**
   * Rostered minutes for this staff member on this date, or null when they
   * worked a day they weren't rostered for. Null and 0 are different answers
   * and the UI says so — "not rostered" is not "rostered for nothing".
   */
  scheduledMinutes: number | null;
  /** actual − scheduled, or null when there's nothing to compare against. */
  varianceMinutes: number | null;
};
