// ============================================================================
//  /portal/admin/students/[id] — Student detail + progress timeline.
//  Server component: fetches the student, their active enrollments, and the
//  full progress history (with the logging instructor's name).
// ============================================================================

import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import ProgressTracker, {
  type ProgressEntry,
} from "@/components/admin/students/ProgressTracker";
import DeleteStudentButton from "@/components/admin/students/DeleteStudentButton";
import StudentSchedulePanel from "@/components/admin/students/StudentSchedulePanel";
import BadgeAwarder from "@/components/portal/shared/BadgeAwarder";
import type { ScheduleEntry } from "@/lib/students/schedule-types";
import { getWeekRange } from "@/lib/staff/week";
import { fetchBadgeCatalogue, fetchProfileBadges } from "@/lib/portal/badges-data";

export type StudentDetail = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  classes: { id: string; name: string }[];
};

const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default async function StudentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const t = await getTranslations("admin.students.detail");
  const tShared = await getTranslations("admin.shared");

  const [studentRes, progressRes, scheduleRes] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        `
        id, full_name, email, phone, studio_id,
        enrollments!student_id (
          status,
          classes ( id, name, day_of_week, start_time )
        ),
        guardianships!student_id (
          is_primary,
          guardian:profiles!guardian_id ( id, full_name )
        )
      `,
      )
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

  const classes = (
    (p.enrollments as unknown as {
      status: string;
      classes: { id: string; name: string; day_of_week: number; start_time: string | null } | null;
    }[]) ?? []
  )
    .filter((e) => e.status === "active" && e.classes)
    .map((e) => ({ id: e.classes!.id, name: e.classes!.name }));

  const student: StudentDetail = {
    id: p.id,
    name: p.full_name,
    email: p.email,
    phone: p.phone,
    classes,
  };

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

  // ─── Badges: student catalogue + primary guardian's family catalogue ───
  const studioId = p.studio_id as string | null;
  const guardianRows =
    (p.guardianships as unknown as {
      is_primary: boolean;
      guardian: { id: string; full_name: string | null } | null;
    }[]) ?? [];
  const primaryGuardian =
    guardianRows.find((g) => g.is_primary && g.guardian)?.guardian ??
    guardianRows.find((g) => g.guardian)?.guardian ??
    null;

  const [studentCatalogue, studentEarned, familyCatalogue, familyEarned] = studioId
    ? await Promise.all([
        fetchBadgeCatalogue(supabase, studioId, "student"),
        fetchProfileBadges(supabase, p.id),
        primaryGuardian ? fetchBadgeCatalogue(supabase, studioId, "parent") : Promise.resolve([]),
        primaryGuardian ? fetchProfileBadges(supabase, primaryGuardian.id) : Promise.resolve([]),
      ])
    : [[], [], [], []];

  void DAY_SHORT;

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-6">
      <div>
        <Link
          href="/portal/admin/students"
          className="text-xs text-muted hover:text-ink"
        >
          {t("back")}
        </Link>
        <div className="mt-3 flex items-center gap-4">
          <span
            className="grid h-14 w-14 shrink-0 place-items-center rounded-full text-xl font-black text-white"
            style={{ background: "var(--brand)" }}
          >
            {(student.name ?? "?")
              .split(" ")
              .map((w) => w[0])
              .slice(0, 2)
              .join("")
              .toUpperCase()}
          </span>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-ink">
              {student.name ?? tShared("unknownStudent")}
            </h1>
            <p className="text-sm text-muted">
              {student.email ?? student.phone ?? t("noContactOnFile")}
            </p>
            {student.classes.length > 0 && (
              <p className="mt-1 text-xs text-muted">
                {student.classes.map((c) => c.name).join(" · ")}
              </p>
            )}
          </div>
        </div>
      </div>

      {studioId && studentCatalogue.length > 0 && (
        <BadgeAwarder
          recipientId={student.id}
          catalogue={studentCatalogue}
          earnedIds={studentEarned.map((e) => e.badgeId)}
        />
      )}

      {studioId && primaryGuardian && familyCatalogue.length > 0 && (
        <BadgeAwarder
          recipientId={primaryGuardian.id}
          catalogue={familyCatalogue}
          earnedIds={familyEarned.map((e) => e.badgeId)}
        />
      )}

      <ProgressTracker studentId={student.id} entries={entries} />

      <StudentSchedulePanel
        studentId={student.id}
        entries={scheduleEntries}
        weekStart={weekStart}
      />

      <DeleteStudentButton studentId={student.id} studentName={student.name} />
    </div>
  );
}
