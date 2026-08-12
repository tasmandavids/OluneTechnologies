// ============================================================================
//  lib/timeclock/nfc.ts
//
//  The clock half of a staff NFC tap.
//
//  A staff tap does two things: it puts the person on the building's safety
//  register (building_taps, exactly as a student tap does — staff are in the
//  building too, and a fire roll that omitted them would be worse than useless)
//  and it opens or closes their shift. This module is the second half.
//
//  ── The rule this module exists to enforce
//  The clock is NEVER allowed to fail the tap. The safety register is the
//  primary purpose of the hardware; if the timesheet write fails for any
//  reason, the tap still succeeded and the person is still recorded as present.
//  Every path below therefore returns an outcome rather than throwing, and
//  performTap reports it alongside a tap that has already been written.
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import { studioLocalYmd } from "@/lib/date/studio-date";
import type { TapDirection } from "@/lib/checkin/direction";

export type ClockOutcome =
  | "clocked_in"
  | "clocked_out"
  /** Tapped in while a shift was already open (portal clock-in, or a missed tap-out). */
  | "already_clocked_in"
  /** Tapped out with nothing open. */
  | "not_clocked_in"
  /** In and out within MIN_SHIFT_SECONDS — treated as a mis-tap, shift left open. */
  | "ignored_double_tap"
  | "failed";

/**
 * A shift shorter than this is a bounced tap, not work.
 *
 * Without this, the direction alternation in lib/checkin/direction.ts turns a
 * double tap into in-then-out, and the immediate close either violates the
 * clock_out_at > clock_in_at constraint (a 500 on a door reader) or records a
 * zero-minute shift. Leaving the shift open is the forgiving reading: the
 * person is in the building, and a real tap-out later closes it properly.
 */
const MIN_SHIFT_SECONDS = 60;

const UNIQUE_VIOLATION = "23505";

/**
 * Apply a staff tap to the timesheet.
 *
 * @param admin  Service-role client. The reader is not a signed-in user, so
 *               there is no auth.uid() for the 0118 row guards to check a
 *               staff_id against; they exempt service_role for exactly this
 *               path. Authorisation happened at the reader credential in
 *               lib/checkin/reader-auth.ts.
 */
export async function applyStaffTapToClock(
  admin: SupabaseClient,
  params: {
    studioId: string;
    staffId: string;
    direction: TapDirection;
    timezone: string | null;
    at: Date;
  },
): Promise<ClockOutcome> {
  const { studioId, staffId, direction, timezone, at } = params;

  const { data: open } = await admin
    .from("staff_time_entries")
    .select("id, clock_in_at")
    .eq("staff_id", staffId)
    .is("clock_out_at", null)
    .maybeSingle();

  if (direction === "in") {
    // Already on the clock — the register still recorded the tap, which is the
    // point. Don't open a second shift; the DB wouldn't allow it anyway.
    if (open) return "already_clocked_in";

    const { error } = await admin.from("staff_time_entries").insert({
      studio_id: studioId,
      staff_id: staffId,
      entry_date: studioLocalYmd(timezone, at),
      clock_in_at: at.toISOString(),
      source: "nfc",
    });

    if (error) {
      // Lost a race with a portal clock-in or a second reader. Not an error
      // worth failing a door tap over — they're clocked in either way.
      return error.code === UNIQUE_VIOLATION ? "already_clocked_in" : "failed";
    }
    return "clocked_in";
  }

  if (!open) return "not_clocked_in";

  const openedAt = Date.parse(open.clock_in_at as string);
  if (Number.isFinite(openedAt) && at.getTime() - openedAt < MIN_SHIFT_SECONDS * 1000) {
    return "ignored_double_tap";
  }

  const { data: closed, error } = await admin
    .from("staff_time_entries")
    .update({ clock_out_at: at.toISOString() })
    .eq("id", open.id)
    // Re-assert the open-ness we read, so two readers closing at once can't
    // both win and overwrite each other's clock-out time.
    .is("clock_out_at", null)
    .select("id")
    .maybeSingle();

  if (error) return "failed";
  if (!closed) return "not_clocked_in";
  return "clocked_out";
}
