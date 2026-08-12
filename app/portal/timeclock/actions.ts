"use server";

// ============================================================================
//  Time clock — clock in / clock out.
//
//  Role-agnostic on purpose, like app/portal/forms: teachers and front-desk
//  (office) staff both clock in, and both surfaces call these. Anything
//  manager-shaped — approving, correcting, back-dating, setting rates — lives
//  in app/portal/admin/staff/actions.ts instead, because those are a different
//  permission and a different audit story.
//
//  These actions deliberately carry no column-level authorisation of their own.
//  The insert/update guards in migration 0118 are the enforcement point, so the
//  same rules apply to the NFC tap path (which never runs this code) and to
//  anything added later. What's here is the friendly-error layer over them.
// ============================================================================

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { resolveEffectiveStudioId } from "@/lib/portal/access";
import { studioLocalYmd } from "@/lib/date/studio-date";

export type TimeClockResult = { ok: true; entryId: string } | { ok: false; error: string };

/** Postgres unique-violation — the one-open-shift-per-staff partial index. */
const UNIQUE_VIOLATION = "23505";

const CLOCK_PATHS = ["/portal/teacher", "/portal/office", "/portal/admin/staff"];

function revalidateClockPaths() {
  for (const path of CLOCK_PATHS) revalidatePath(path);
}

type ClockContext = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  studioId: string;
  timezone: string | null;
};

async function getClockContext(): Promise<ClockContext | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("studio_id, active_studio_id, role")
    .eq("id", user.id)
    .single();

  if (!profile) return { error: "No profile found." };

  // Parents and students have no shifts to record. Admins do — an owner who
  // teaches a class is still working.
  const role = profile.role as string | null;
  if (role !== "teacher" && role !== "office" && role !== "admin") {
    return { error: "Only staff can use the time clock." };
  }

  const studioId = resolveEffectiveStudioId(profile);
  if (!studioId) return { error: "No studio found." };

  const { data: studio } = await supabase
    .from("studios")
    .select("timezone")
    .eq("id", studioId)
    .maybeSingle();

  return {
    supabase,
    userId: user.id,
    studioId,
    timezone: (studio?.timezone as string | null) ?? null,
  };
}

/**
 * Open a shift for the signed-in staff member, now.
 *
 * A second call while already clocked in is rejected by the database, not by a
 * read-then-write check here — a double-submitted button would race straight
 * past that. See staff_time_entries_one_open_per_staff in 0118.
 */
export async function clockIn(): Promise<TimeClockResult> {
  const ctx = await getClockContext();
  if ("error" in ctx) return { ok: false, error: ctx.error };

  const now = new Date();
  const { data, error } = await ctx.supabase
    .from("staff_time_entries")
    .insert({
      studio_id: ctx.studioId,
      staff_id: ctx.userId,
      // Studio-local, not UTC: a 23:30 start belongs to the day it began on.
      entry_date: studioLocalYmd(ctx.timezone, now),
      clock_in_at: now.toISOString(),
      source: "portal",
      created_by: ctx.userId,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      return { ok: false, error: "You're already clocked in." };
    }
    return { ok: false, error: error.message };
  }

  revalidateClockPaths();
  return { ok: true, entryId: data.id as string };
}

/**
 * Close the signed-in staff member's open shift.
 *
 * The update is filtered on `clock_out_at is null` as well as on the row id, so
 * two devices closing the same shift can't both succeed and the second gets a
 * clear message rather than silently extending the first one's hours.
 */
export async function clockOut(note?: string): Promise<TimeClockResult> {
  const ctx = await getClockContext();
  if ("error" in ctx) return { ok: false, error: ctx.error };

  const { data: open } = await ctx.supabase
    .from("staff_time_entries")
    .select("id")
    .eq("staff_id", ctx.userId)
    .is("clock_out_at", null)
    .maybeSingle();

  if (!open) return { ok: false, error: "You're not clocked in." };

  const trimmed = note?.trim();
  const { data, error } = await ctx.supabase
    .from("staff_time_entries")
    .update({
      clock_out_at: new Date().toISOString(),
      ...(trimmed ? { note: trimmed.slice(0, 500) } : {}),
    })
    .eq("id", open.id)
    .is("clock_out_at", null)
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "That shift was already closed." };

  revalidateClockPaths();
  return { ok: true, entryId: data.id as string };
}
