// ============================================================================
//  GET /api/cron/notifications   (Phase 4.3 — time-based notifications)
//
//  Generates the notification types that can't be DB-triggered because they're
//  time-based rather than event-driven:
//    • class_reminder   — for every active enrollee of a class scheduled
//                         tomorrow (≈24h ahead)
//    • payment_overdue  — sweeps `sent` invoices past their due date to
//                         `overdue` (the 0008 invoice trigger then notifies)
//    • birthday_greeting — for any profile whose birthday is today
//
//  Auth: Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`. We also
//  accept `?secret=<CRON_SECRET>` for manual testing. If CRON_SECRET is unset
//  the route refuses to run (fail closed) outside development.
//
//  Runs with the service-role client (no signed-in user), so it bypasses RLS.
//
//  TIMEZONE (Session 8): each studio carries an IANA `timezone` (migration
//  0017). "Tomorrow" (reminders), "today" (birthdays) and the overdue cut-off
//  are computed PER STUDIO in its local time, so an 08:00-UTC cron still targets
//  the correct local day for studios in any timezone.
//
//  Requires env: SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET.
//
//  CADENCE — THIS ROUTE MUST STAY DAILY.
//  When the other crons moved to sub-daily schedules this one deliberately did
//  not. It GENERATES notifications for a whole local day (every enrollee of
//  tomorrow's classes, every birthday today) and has no dedupe: there is no
//  uniqueness constraint on (user_id, type, day) and no check for an existing
//  row. Running it twice in one local day sends every parent the same class
//  reminder twice. Delivery frequency is /api/cron/deliver-notifications' job,
//  and that one is safe to run often — this one is not.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizedCron } from "@/lib/cron/auth";

export const dynamic = "force-dynamic";

// Local calendar info for a studio's timezone at the given instant.
//   ymd  — local date  "YYYY-MM-DD"
//   mmdd — local month/day "MM-DD"
//   dow  — local day-of-week 0..6 (Sun..Sat)
function localDateInfo(timezone: string, base = new Date()) {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(base);
  } catch {
    // Invalid tz string → fall back to UTC.
    parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(base);
  }
  const m: Record<string, string> = {};
  for (const p of parts) m[p.type] = p.value;
  const ymd = `${m.year}-${m.month}-${m.day}`;
  // Day-of-week from a fixed-noon-UTC instant of that calendar date (tz-safe).
  const dow = new Date(`${ymd}T12:00:00Z`).getUTCDay();
  return { ymd, mmdd: `${m.month}-${m.day}`, dow };
}

export async function GET(req: NextRequest) {
  if (!authorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let supabase;
  try {
    supabase = createAdminClient();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Admin client unavailable" },
      { status: 500 },
    );
  }

  const summary = { classReminders: 0, overdueInvoices: 0, birthdayGreetings: 0 };
  const now = new Date();
  // UTC midnight is fine as the dedup floor (the cron runs once per day).
  const dedupFloorIso = (() => {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    return d.toISOString();
  })();

  // Per-studio local calendar info, keyed by studio id.
  const { data: studios } = await supabase.from("studios").select("id, timezone");
  const studioInfo = new Map(
    (studios ?? []).map((s) => [
      s.id as string,
      localDateInfo((s.timezone as string) || "UTC", now),
    ]),
  );

  // ── 1. Class reminders (classes scheduled the studio's local "tomorrow") ───
  const { data: classes } = await supabase
    .from("classes")
    .select("id, name, studio_id, start_time, day_of_week");

  const dueClasses = (classes ?? []).filter((c) => {
    const info = studioInfo.get(c.studio_id as string);
    if (!info) return false;
    const tomorrowDow = (info.dow + 1) % 7;
    return Number(c.day_of_week) === tomorrowDow;
  });

  const classIds = dueClasses.map((c) => c.id as string);
  const classById = new Map(dueClasses.map((c) => [c.id as string, c]));

  if (classIds.length) {
    const { data: enrollments } = await supabase
      .from("enrollments")
      .select("student_id, class_id, studio_id")
      .in("class_id", classIds)
      .eq("status", "active");

    // Dedup against reminders already sent today for the same (user, class).
    const { data: sentToday } = await supabase
      .from("notifications")
      .select("user_id, payload")
      .eq("type", "class_reminder")
      .gte("sent_at", dedupFloorIso);

    const already = new Set(
      (sentToday ?? []).map(
        (n) => `${n.user_id}:${(n.payload as { class_id?: string } | null)?.class_id ?? ""}`,
      ),
    );

    const rows = (enrollments ?? [])
      .filter((e) => !already.has(`${e.student_id}:${e.class_id}`))
      .map((e) => {
        const cls = classById.get(e.class_id as string);
        const time = (cls?.start_time as string | null)?.slice(0, 5);
        return {
          studio_id: e.studio_id,
          user_id: e.student_id,
          type: "class_reminder",
          title: `Class tomorrow: ${cls?.name ?? "your class"}`,
          body: time ? `Starts at ${time}. See you there!` : "See you there!",
          link: "/portal/student",
          payload: { class_id: e.class_id },
        };
      });

    if (rows.length) {
      const { error } = await supabase.from("notifications").insert(rows);
      if (!error) summary.classReminders = rows.length;
    }
  }

  // ── 2. Overdue invoice sweep (fires the 0008 invoice_overdue trigger) ──────
  // Per studio: mark `sent` invoices whose due_date is before the studio's
  // local today. Group studios by their local date to minimise queries.
  const studiosByYmd = new Map<string, string[]>();
  for (const [studioId, info] of studioInfo) {
    const arr = studiosByYmd.get(info.ymd) ?? [];
    arr.push(studioId);
    studiosByYmd.set(info.ymd, arr);
  }

  for (const [ymd, ids] of studiosByYmd) {
    const { data: overdue } = await supabase
      .from("invoices")
      .update({ status: "overdue" })
      .eq("status", "sent")
      .lt("due_date", ymd)
      .in("studio_id", ids)
      .select("id");
    summary.overdueInvoices += overdue?.length ?? 0;
  }

  // ── 3. Birthday greetings (profile's birthday == studio's local today) ─────
  const { data: people } = await supabase
    .from("profiles")
    .select("id, studio_id, full_name, birthday")
    .not("birthday", "is", null);

  const birthdayPeople = (people ?? []).filter((p) => {
    const info = studioInfo.get(p.studio_id as string);
    if (!info) return false;
    return (p.birthday as string)?.slice(5) === info.mmdd;
  });

  if (birthdayPeople.length) {
    const { data: greetedToday } = await supabase
      .from("notifications")
      .select("user_id")
      .eq("type", "birthday_greeting")
      .gte("sent_at", dedupFloorIso);
    const greeted = new Set((greetedToday ?? []).map((n) => n.user_id as string));

    const rows = birthdayPeople
      .filter((p) => !greeted.has(p.id as string))
      .map((p) => ({
        studio_id: p.studio_id,
        user_id: p.id,
        type: "birthday_greeting",
        title: "Happy birthday! 🎉",
        body: `Wishing you a wonderful day${
          (p.full_name as string)?.split(" ")[0] ? `, ${(p.full_name as string).split(" ")[0]}` : ""
        }!`,
        link: "/portal/student",
      }));

    if (rows.length) {
      const { error } = await supabase.from("notifications").insert(rows);
      if (!error) summary.birthdayGreetings = rows.length;
    }
  }

  return NextResponse.json({ ok: true, ranAt: new Date().toISOString(), summary });
}
