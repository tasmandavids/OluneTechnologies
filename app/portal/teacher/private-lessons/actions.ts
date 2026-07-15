"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const RespondSchema = z.object({
  bookingId: z.string().uuid(),
  decision: z.enum(["accepted", "declined"]),
  note: z.string().max(500).optional().nullable(),
});

export async function respondToBooking(input: z.infer<typeof RespondSchema>) {
  const parsed = RespondSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid request." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { bookingId, decision, note } = parsed.data;
  const fn = decision === "accepted" ? "accept_private_lesson" : "decline_private_lesson";
  const { error } = await supabase.rpc(fn, {
    p_booking: bookingId,
    p_note: note?.trim() || null,
  });

  if (error) return { error: error.message };

  revalidatePath("/portal/teacher/private-lessons");
  revalidatePath("/portal/teacher");
  return { ok: true };
}
