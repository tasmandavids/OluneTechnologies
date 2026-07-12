// ============================================================================
//  /portal/parent/private-lessons — request a private lesson with a studio
//  teacher (guided by their published availability) and track request status.
//  Accepted lessons also appear automatically on the family Schedule.
// ============================================================================

import { createClient } from "@/lib/supabase/server";
import BookPrivateLesson from "@/components/portal/parent/BookPrivateLesson";
import type {
  BookableChild,
  BookableTeacher,
  ParentBooking,
} from "@/lib/private-lessons/types";

export default async function ParentPrivateLessonsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("studio_id")
    .eq("id", user!.id)
    .single();
  const studioId = profile?.studio_id ?? "";

  // Children this parent guards
  const { data: guardianships } = await supabase
    .from("guardianships")
    .select("student_id, profiles!student_id ( full_name )")
    .eq("guardian_id", user!.id);

  const children: BookableChild[] = (guardianships ?? []).map((g) => ({
    studentId: g.student_id as string,
    name: (g.profiles as unknown as { full_name: string | null } | null)?.full_name ?? null,
  }));

  // Studio teachers: affiliated instructors + staff teachers (mirrors admin availability)
  const [{ data: affiliations }, { data: staffTeachers }] = await Promise.all([
    supabase
      .from("studio_memberships")
      .select("instructor_id, profiles!instructor_id ( id, full_name )")
      .eq("studio_id", studioId)
      .eq("status", "active"),
    supabase
      .from("profiles")
      .select("id, full_name")
      .eq("studio_id", studioId)
      .eq("role", "teacher"),
  ]);

  const nameById = new Map<string, string | null>();
  for (const a of affiliations ?? []) {
    const p = a.profiles as unknown as { id: string; full_name: string | null } | null;
    if (p) nameById.set(p.id, p.full_name);
  }
  for (const t of staffTeachers ?? []) {
    nameById.set(t.id as string, (t.full_name as string | null) ?? null);
  }

  const teacherIds = [...nameById.keys()];

  const { data: slots } = teacherIds.length
    ? await supabase
        .from("instructor_availability")
        .select("instructor_id, day_of_week, start_time, end_time, notes")
        .in("instructor_id", teacherIds)
        .order("day_of_week")
        .order("start_time")
    : { data: [] };

  const teachers: BookableTeacher[] = teacherIds
    .map((id) => ({
      id,
      name: nameById.get(id) ?? null,
      slots: (slots ?? [])
        .filter((s) => s.instructor_id === id)
        .map((s) => ({
          dayOfWeek: s.day_of_week as number,
          startTime: (s.start_time as string).slice(0, 5),
          endTime: (s.end_time as string).slice(0, 5),
          notes: (s.notes as string | null) ?? null,
        })),
    }))
    .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));

  // This parent's own requests
  const { data: bookingRows } = await supabase
    .from("private_lesson_bookings")
    .select(
      `id, lesson_date, start_time, end_time, location_name, parent_note, teacher_response_note, status,
       teacher:profiles!teacher_id ( full_name ),
       student:profiles!student_id ( full_name )`,
    )
    .eq("requested_by", user!.id)
    .order("lesson_date", { ascending: false });

  const bookings: ParentBooking[] = (
    (bookingRows ?? []) as unknown as {
      id: string;
      lesson_date: string;
      start_time: string;
      end_time: string;
      location_name: string | null;
      parent_note: string | null;
      teacher_response_note: string | null;
      status: ParentBooking["status"];
      teacher: { full_name: string | null } | null;
      student: { full_name: string | null } | null;
    }[]
  ).map((r) => ({
    id: r.id,
    teacherName: r.teacher?.full_name ?? null,
    studentName: r.student?.full_name ?? null,
    lessonDate: r.lesson_date,
    startTime: r.start_time.slice(0, 5),
    endTime: r.end_time.slice(0, 5),
    locationName: r.location_name,
    parentNote: r.parent_note,
    teacherResponseNote: r.teacher_response_note,
    status: r.status,
  }));

  return (
    <BookPrivateLesson teachers={teachers} students={children} bookings={bookings} />
  );
}
