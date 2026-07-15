// ============================================================================
//  /portal/admin/private-lessons — review queue for teacher private lessons.
//  Admins see requested/confirmed/declined bookings and bill confirmed ones
//  through the existing studio-invoice rail.
// ============================================================================

import { requirePortalSession } from "@/lib/portal/session";
import PrivateLessonsReview from "@/components/admin/private-lessons/PrivateLessonsReview";
import type { AdminBooking } from "@/lib/private-lessons/types";

type Row = {
  id: string;
  lesson_date: string;
  start_time: string;
  end_time: string;
  location_name: string | null;
  parent_note: string | null;
  status: AdminBooking["status"];
  invoice_id: string | null;
  amount_cents: number | null;
  teacher: { full_name: string | null } | null;
  student: { full_name: string | null } | null;
  parent: { full_name: string | null } | null;
  invoice: { status: string | null } | null;
};

export default async function AdminPrivateLessonsPage() {
  const { supabase, studioId } = await requirePortalSession();

  const { data } = await supabase
    .from("private_lesson_bookings")
    .select(
      `id, lesson_date, start_time, end_time, location_name, parent_note, status,
       invoice_id, amount_cents,
       teacher:profiles!teacher_id ( full_name ),
       student:profiles!student_id ( full_name ),
       parent:profiles!requested_by ( full_name ),
       invoice:invoices!invoice_id ( status )`,
    )
    .eq("studio_id", studioId)
    .order("lesson_date", { ascending: false });

  const bookings: AdminBooking[] = ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.id,
    teacherName: r.teacher?.full_name ?? null,
    studentName: r.student?.full_name ?? null,
    parentName: r.parent?.full_name ?? null,
    lessonDate: r.lesson_date,
    startTime: r.start_time.slice(0, 5),
    endTime: r.end_time.slice(0, 5),
    locationName: r.location_name,
    parentNote: r.parent_note,
    status: r.status,
    invoiceId: r.invoice_id,
    amountCents: r.amount_cents,
    invoiceStatus: r.invoice?.status ?? null,
  }));

  return <PrivateLessonsReview bookings={bookings} />;
}
