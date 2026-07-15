// ============================================================================
//  /portal/teacher/students/[id] — Teacher view of a student's progress.
//  RLS (0011_student_progress.sql) restricts reads/writes to students the
//  signed-in teacher actually teaches, so no extra guard is needed here.
//  Reuses the shared ProgressTracker; delete is hidden for teachers.
// ============================================================================

import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ProgressTracker, {
  type ProgressEntry,
} from "@/components/admin/students/ProgressTracker";
import StudentSchedulePanel from "@/components/admin/students/StudentSchedulePanel";
import BadgeAwarder from "@/components/portal/shared/BadgeAwarder";
import type { ScheduleEntry } from "@/lib/students/schedule-types";
import { getWeekRange } from "@/lib/staff/week";
import { getTranslations } from "@/lib/i18n/server";
import { fetchBadgeCatalogue, fetchProfileBadges } from "@/lib/portal/badges-data";

export default async function TeacherStudentProgressPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [t, tCommon] = await Promise.all([
    getTranslations("teacher.studentProgress"),
    getTranslations("common"),
  ]);

  const [studentRes, progressRes, scheduleRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, email, studio_id")
      .eq("id", id)
      .single(),

    supabase
      .from("student_progress")
      .select(
        `
        id, notes, level, certifications, logged_at,
        instructor:profiles!instructor_id ( full_name )
      `,
      )
      .eq("student_id", id)
      .order("logged_at", { ascending: false }),

    supabase
      .from("student_schedule_entries")
      .select(
        "id, student_id, title, description, entry_date, start_time, end_time, entry_type, location_name, cancelled_at",
      )
      .eq("student_id", id)
      .order("entry_date")
      .order("start_time"),
  ]);

  if (studentRes.error || !studentRes.data) notFound();
  const p = studentRes.data;

  const entries: ProgressEntry[] = (progressRes.data ?? []).map((row) => {
    const instructor = row.instructor as unknown as { full_name: string | null } | null;
    return {
      id: row.id as string,
      notes: (row.notes as string | null) ?? null,
      level: (row.level as string | null) ?? null,
      certifications: ((row.certifications as string[] | null) ?? []) as string[],
      loggedAt: row.logged_at as string,
      instructorName: instructor?.full_name ?? null,
    };
  });

  const scheduleEntries: ScheduleEntry[] = (scheduleRes.data ?? []).map((row) => ({
    id: row.id as string,
    studentId: row.student_id as string,
    title: row.title as string,
    description: (row.description as string | null) ?? null,
    entryDate: row.entry_date as string,
    startTime: (row.start_time as string | null)?.slice(0, 5) ?? null,
    endTime: (row.end_time as string | null)?.slice(0, 5) ?? null,
    entryType: row.entry_type as ScheduleEntry["entryType"],
    locationName: (row.location_name as string | null) ?? null,
    cancelledAt: (row.cancelled_at as string | null) ?? null,
  }));

  const weekStart = getWeekRange().weekStart;

  const studioId = p.studio_id as string | null;
  const [catalogue, earned] = studioId
    ? await Promise.all([
        fetchBadgeCatalogue(supabase, studioId, "student"),
        fetchProfileBadges(supabase, p.id),
      ])
    : [[], []];

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-6">
      <div>
        <Link href="/portal/teacher" className="text-xs text-muted hover:text-ink">
          {t("back")}
        </Link>
        <h1 className="mt-3 text-2xl font-black tracking-tight text-ink">
          {p.full_name ?? tCommon("student")}
        </h1>
        <p className="text-sm text-muted">{p.email ?? t("progressLog")}</p>
      </div>

      {studioId && catalogue.length > 0 && (
        <BadgeAwarder
          recipientId={p.id}
          catalogue={catalogue}
          earnedIds={earned.map((e) => e.badgeId)}
        />
      )}

      <ProgressTracker studentId={p.id} entries={entries} readOnlyDelete />

      <StudentSchedulePanel
        studentId={p.id}
        entries={scheduleEntries}
        weekStart={weekStart}
      />
    </div>
  );
}
