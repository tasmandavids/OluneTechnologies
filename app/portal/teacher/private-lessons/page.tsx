// ============================================================================
//  /portal/teacher/private-lessons — incoming private-lesson requests the
//  teacher can accept or decline, plus their upcoming accepted lessons.
// ============================================================================

import { createClient } from "@/lib/supabase/server";
import PrivateLessonRequests from "@/components/portal/teacher/PrivateLessonRequests";
import type { TeacherBooking } from "@/lib/private-lessons/types";

type Row = {
  id: string;
  lesson_date: string;
  start_time: string;
  end_time: string;
  location_name: string | null;
  parent_note: string | null;
  status: TeacherBooking["status"];
  student: { full_name: string | null } | null;
  parent: { full_name: string | null } | null;
};

export default async function TeacherPrivateLessonsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data } = await supabase
    .from("private_lesson_bookings")
    .select(
      `id, lesson_date, start_time, end_time, location_name, parent_note, status,
       student:profiles!student_id ( full_name ),
       parent:profiles!requested_by ( full_name )`,
    )
    .eq("teacher_id", user!.id)
    .order("lesson_date");

  const bookings: TeacherBooking[] = ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.id,
    studentName: r.student?.full_name ?? null,
    parentName: r.parent?.full_name ?? null,
    lessonDate: r.lesson_date,
    startTime: r.start_time.slice(0, 5),
    endTime: r.end_time.slice(0, 5),
    locationName: r.location_name,
    parentNote: r.parent_note,
    status: r.status,
  }));

  const today = new Date().toISOString().slice(0, 10);
  const pending = bookings.filter((b) => b.status === "requested");
  const upcoming = bookings.filter(
    (b) => b.status === "accepted" && b.lessonDate >= today,
  );

  return <PrivateLessonRequests pending={pending} upcoming={upcoming} />;
}
