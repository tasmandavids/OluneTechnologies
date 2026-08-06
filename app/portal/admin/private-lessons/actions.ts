"use server";

// ============================================================================
//  Billing a confirmed private lesson.
//
//  The amount used to be keyed in per booking with nothing behind it. It now
//  prices from the booking's catalogue product (PRIVATE-HR by default) against
//  the booked duration, honouring that product's minimum and rounding
//  increment. A manual amount is still accepted as an explicit override —
//  studios do discount a lesson — but it is no longer the only way to bill one.
// ============================================================================

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePortalSession } from "@/lib/portal/session";
import { createInvoice } from "@/app/portal/admin/billing/actions";
import { loadProduct, loadProductByCode } from "@/lib/billing/catalog";
import { hoursBetween, priceProductLine } from "@/lib/billing/pricing";

const BillSchema = z
  .object({
    bookingId: z.string().uuid(),
    /** Explicit override. When absent the product's rate decides. */
    amountDollars: z.number().positive().max(100_000).optional(),
    /** Overrides the booked duration, e.g. a lesson that ran long. */
    hours: z.number().positive().max(24).optional(),
    productId: z.string().uuid().optional(),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .refine((v) => v.amountDollars !== undefined || v.productId !== undefined, {
    message: "Either an amount or a product is required.",
  });

export async function billPrivateLesson(input: z.infer<typeof BillSchema>) {
  const parsed = BillSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid billing details." };

  const { supabase, studioId, role } = await requirePortalSession();
  if (role !== "admin") return { error: "Admins only." };

  const { bookingId, amountDollars, hours, productId, dueDate } = parsed.data;

  const { data: booking } = await supabase
    .from("private_lesson_bookings")
    .select(
      `id, status, invoice_id, requested_by, student_id, lesson_date, start_time, end_time, product_id,
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

  // Product resolution order: the one the admin picked, the one already on the
  // booking, then the studio's default hourly lesson product.
  const product =
    (productId ? await loadProduct(supabase, studioId, productId) : null) ??
    (booking.product_id
      ? await loadProduct(supabase, studioId, booking.product_id as string)
      : null) ??
    (await loadProductByCode(supabase, studioId, "PRIVATE-HR"));

  const bookedHours =
    hours ??
    hoursBetween(
      String(booking.start_time ?? "00:00"),
      String(booking.end_time ?? "00:00"),
    );

  let lineItems: { description: string; quantity: number; unitDollars: number; productId?: string }[] | undefined;
  let totalCents: number;

  if (!product || bookedHours <= 0) {
    if (amountDollars === undefined) {
      return { error: "No hourly rate is set up for private lessons yet — enter an amount." };
    }
    totalCents = Math.round(amountDollars * 100);
  } else {
    // An admin discount still bills against the lesson product, so the
    // revenue lands on the right account instead of becoming an uncoded
    // custom line. The override only changes the rate, not the classification.
    const billableHours = priceProductLine(product, bookedHours).quantity;
    const priced = priceProductLine(product, bookedHours, {
      description,
      unitCentsOverride:
        amountDollars !== undefined
          ? Math.round((amountDollars * 100) / billableHours)
          : undefined,
    });

    totalCents = priced.lineTotalCents;
    lineItems = [
      {
        description: priced.description,
        quantity: priced.quantity,
        unitDollars: priced.unitCents / 100,
        productId: priced.productId ?? undefined,
      },
    ];
  }

  // Reuse the studio invoice pipeline (Stripe intent + parent notification +
  // Xero sync). It derives the header total from the lines when they're given.
  const result = await createInvoice({
    payerId: booking.requested_by as string,
    studentId: booking.student_id as string,
    amountDollars: totalCents / 100,
    dueDate,
    description,
    sendNow: true,
    lineItems,
  });

  if (!result.ok) return { error: result.error };

  const { error: linkErr } = await supabase
    .from("private_lesson_bookings")
    .update({
      invoice_id: result.invoiceId,
      amount_cents: totalCents,
      product_id: product?.id ?? booking.product_id ?? null,
    })
    .eq("id", bookingId)
    .eq("studio_id", studioId);

  if (linkErr) return { error: linkErr.message };

  revalidatePath("/portal/admin/private-lessons");
  return { ok: true };
}
