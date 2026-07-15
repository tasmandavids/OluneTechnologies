// ============================================================================
//  /portal/parent/schedule — one Schedule door with two views:
//  "My family" (linked children's classes + staff-added entries) and
//  "Whole studio" (full weekly timetable). View state lives in ?view= so the
//  old /portal/parent/studio-schedule deep links keep working.
// ============================================================================

import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getTranslations } from "@/lib/i18n/server";
import ParentScheduleCalendar from "@/components/portal/parent/ParentScheduleCalendar";
import ParentStudioScheduleGrid from "@/components/portal/parent/ParentStudioScheduleGrid";
import type { StudioScheduleClass } from "@/lib/portal/parent-studio-schedule";
import type {
  EnrolledClassSlot,
  ScheduleChild,
  ScheduleEntry,
} from "@/lib/students/schedule-types";
import { getWeekRange } from "@/lib/staff/week";
import { mergeScheduleItems } from "@/lib/students/schedule-utils";

async function FamilyScheduleView({ weekParam }: { weekParam: string | undefined }) {
  const weekStart =
    weekParam && /^\d{4}-\d{2}-\d{2}$/.test(weekParam)
      ? weekParam
      : getWeekRange().weekStart;
  const { weekDates, weekEnd } = getWeekRange(new Date(`${weekStart}T12:00:00`));

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: guardianships } = await supabase
    .from("guardianships")
    .select(`
      student_id,
      profiles!student_id (
        full_name,
        enrollments (
          status,
          classes (
            id, name, discipline, level,
            day_of_week, start_time, end_time,
            profiles!teacher_id ( full_name )
          )
        )
      )
    `)
    .eq("guardian_id", user!.id);

  const children: ScheduleChild[] = [];
  const classSlots: EnrolledClassSlot[] = [];
  const studentIds: string[] = [];

  for (const g of guardianships ?? []) {
    const profile = g.profiles as unknown as {
      full_name: string | null;
      enrollments: {
        status: string;
        classes: {
          id: string;
          name: string;
          discipline: string | null;
          level: string | null;
          day_of_week: number;
          start_time: string | null;
          end_time: string | null;
          profiles: { full_name: string | null } | null;
        } | null;
      }[];
    } | null;

    const studentId = g.student_id as string;
    studentIds.push(studentId);
    children.push({
      studentId,
      name: profile?.full_name ?? null,
    });

    for (const enrollment of profile?.enrollments ?? []) {
      if (enrollment.status !== "active" || !enrollment.classes) continue;
      const c = enrollment.classes;
      classSlots.push({
        classId: c.id,
        studentId,
        studentName: profile?.full_name ?? null,
        name: c.name,
        discipline: c.discipline,
        level: c.level,
        dayOfWeek: c.day_of_week,
        startTime: c.start_time?.slice(0, 5) ?? null,
        endTime: c.end_time?.slice(0, 5) ?? null,
        teacherName: c.profiles?.full_name ?? null,
      });
    }
  }

  let entries: ScheduleEntry[] = [];
  if (studentIds.length > 0) {
    const { data: entryRows } = await supabase
      .from("student_schedule_entries")
      .select(
        "id, student_id, title, description, entry_date, start_time, end_time, entry_type, location_name, cancelled_at",
      )
      .in("student_id", studentIds)
      .gte("entry_date", weekStart)
      .lte("entry_date", weekEnd)
      .is("cancelled_at", null)
      .order("entry_date")
      .order("start_time");

    entries = (entryRows ?? []).map((row) => ({
      id: row.id as string,
      studentId: row.student_id as string,
      title: row.title as string,
      description: (row.description as string | null) ?? null,
      entryDate: row.entry_date as string,
      startTime: (row.start_time as string | null)?.slice(0, 5) ?? null,
      endTime: (row.end_time as string | null)?.slice(0, 5) ?? null,
      entryType: row.entry_type as ScheduleEntry["entryType"],
      locationName: (row.location_name as string | null) ?? null,
      cancelledAt: null,
    }));
  }

  const nameByStudent = new Map(children.map((c) => [c.studentId, c.name]));
  const items = mergeScheduleItems(classSlots, entries, weekDates).map((item) =>
    item.kind === "entry"
      ? { ...item, studentName: nameByStudent.get(item.studentId) ?? null }
      : item,
  );

  return (
    <ParentScheduleCalendar linkedChildren={children} items={items} weekStart={weekStart} />
  );
}

async function StudioScheduleView() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("studio_id")
    .eq("id", user!.id)
    .single();

  const { data: rows } = await supabase
    .from("classes")
    .select(`
      id, name, discipline, level, stream, room,
      day_of_week, start_time, end_time, price_cents,
      profiles!teacher_id ( full_name )
    `)
    .eq("studio_id", profile?.studio_id ?? "")
    .not("day_of_week", "is", null)
    .not("start_time", "is", null)
    .order("day_of_week")
    .order("start_time");

  const classes: StudioScheduleClass[] = (rows ?? []).map((row) => {
    const teacher = row.profiles as unknown as { full_name: string | null } | null;
    return {
      id: row.id as string,
      name: row.name as string,
      discipline: row.discipline as string | null,
      level: row.level as string | null,
      stream: row.stream as string | null,
      room: row.room as string | null,
      dayOfWeek: row.day_of_week as number,
      startTime: (row.start_time as string | null)?.slice(0, 5) ?? null,
      endTime: (row.end_time as string | null)?.slice(0, 5) ?? null,
      priceCents: (row.price_cents as number | null) ?? 0,
      teacherName: teacher?.full_name ?? null,
    };
  });

  return <ParentStudioScheduleGrid classes={classes} />;
}

export default async function ParentSchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; view?: string }>;
}) {
  const params = await searchParams;
  const view = params.view === "studio" ? "studio" : "family";
  const t = await getTranslations("parent.scheduleViews");

  return (
    <div>
      <div className="px-6 pt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex w-fit gap-1 rounded-xl border border-[--hair] bg-surface p-1">
          {(
            [
              { id: "family", href: "/portal/parent/schedule", label: t("family") },
              {
                id: "studio",
                href: "/portal/parent/schedule?view=studio",
                label: t("studio"),
              },
            ] as const
          ).map(({ id, href, label }) => (
            <Link
              key={id}
              href={href}
              scroll={false}
              className={`rounded-lg px-4 py-1.5 text-xs font-semibold transition ${
                view === id ? "bg-ink text-paper" : "text-muted hover:text-ink"
              }`}
            >
              {label}
            </Link>
          ))}
        </div>

        <Link
          href="/portal/parent/private-lessons"
          className="rounded-lg bg-ink px-4 py-1.5 text-xs font-semibold text-paper transition hover:opacity-90"
        >
          {t("bookPrivateLesson")}
        </Link>
      </div>

      {view === "studio" ? (
        <StudioScheduleView />
      ) : (
        <FamilyScheduleView weekParam={params.week} />
      )}
    </div>
  );
}
