"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePortalSession } from "@/lib/portal/session";
import { createInvoice } from "@/app/portal/admin/billing/actions";

const BillSchema = z.object({
  bookingId: z.string().uuid(),
  amountDollars: z.number().positive().max(100_000),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function billPrivateLesson(input: z.infer<typeof BillSchema>) {
  const parsed = BillSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid billing details." };

  const { supabase, studioId, role } = await requirePortalSession();
  if (role !== "admin") return { error: "Admins only." };

  const { bookingId, amountDollars, dueDate } = parsed.data;

  const { data: booking } = await supabase
    .from("private_lesson_bookings")
    .select(
      `id, status, invoice_id, requested_by, student_id, lesson_date,
       teacher:profiles!teacher_id ( full_name ),
       student:profiles!student_id ( full_name )`,
    )
    .eq("id", bookingId)
    .eq("studio_id", studioId)
    .single();

  if (!booking) return { error: "Booking not found." };
  if (booking.status !== "accepted") return { error: "Only confirmed lessons can be billed." };
  if (booking.invoice_id) return { error: "This lesson is already invoiced." };

  const teacherName =
    (booking.teacher as unknown as { full_name: string | null } | null)?.full_name ?? "teacher";
  const studentName =
    (booking.student as unknown as { full_name: string | null } | null)?.full_name ?? "dancer";
  const description = `Private lesson — ${studentName} with ${teacherName} (${booking.lesson_date})`.slice(
    0,
    200,
  );

  // Reuse the studio invoice pipeline (Stripe intent + parent notification + Xero sync).
  const result = await createInvoice({
    payerId: booking.requested_by as string,
    studentId: booking.student_id as string,
    amountDollars,
    dueDate,
    description,
    sendNow: true,
  });

  if (!result.ok) return { error: result.error };

  const { error: linkErr } = await supabase
    .from("private_lesson_bookings")
    .update({
      invoice_id: result.invoiceId,
      amount_cents: Math.round(amountDollars * 100),
    })
    .eq("id", bookingId)
    .eq("studio_id", studioId);

  if (linkErr) return { error: linkErr.message };

  revalidatePath("/portal/admin/private-lessons");
  return { ok: true };
}
