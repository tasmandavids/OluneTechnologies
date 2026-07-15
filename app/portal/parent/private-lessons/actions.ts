"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const CreateSchema = z.object({
  teacherId: z.string().uuid(),
  studentId: z.string().uuid(),
  lessonDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  locationName: z.string().max(200).optional().nullable(),
  parentNote: z.string().max(500).optional().nullable(),
});

async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, userId: null };
  return { supabase, userId: user.id };
}

export async function createBookingRequest(input: z.infer<typeof CreateSchema>) {
  const parsed = CreateSchema.safeParse(input);
  if (!parsed.success) return { error: "Please fill in every field." };

  const d = parsed.data;
  if (d.endTime <= d.startTime) return { error: "End time must be after the start time." };
  if (d.lessonDate < new Date().toISOString().slice(0, 10)) {
    return { error: "Pick a date in the future." };
  }

  const { supabase, userId } = await getUser();
  if (!userId) return { error: "Unauthorized" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("studio_id")
    .eq("id", userId)
    .single();
  if (!profile?.studio_id) return { error: "No studio found for your account." };

  const { error } = await supabase.from("private_lesson_bookings").insert({
    studio_id: profile.studio_id,
    teacher_id: d.teacherId,
    student_id: d.studentId,
    requested_by: userId,
    lesson_date: d.lessonDate,
    start_time: d.startTime,
    end_time: d.endTime,
    location_name: d.locationName?.trim() || null,
    parent_note: d.parentNote?.trim() || null,
    status: "requested",
  });

  if (error) return { error: error.message };

  revalidatePath("/portal/parent/private-lessons");
  return { ok: true };
}

export async function cancelBookingRequest(bookingId: string) {
  if (!z.string().uuid().safeParse(bookingId).success) return { error: "Invalid request." };

  const { supabase, userId } = await getUser();
  if (!userId) return { error: "Unauthorized" };

  const { error } = await supabase
    .from("private_lesson_bookings")
    .update({ status: "cancelled" })
    .eq("id", bookingId)
    .eq("requested_by", userId)
    .eq("status", "requested");

  if (error) return { error: error.message };

  revalidatePath("/portal/parent/private-lessons");
  return { ok: true };
}
