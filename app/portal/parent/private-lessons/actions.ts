"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { studioLocalYmd } from "@/lib/date/studio-date";
import { getTranslations } from "@/lib/i18n/server";

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
  const t = await getTranslations("errors.actions");
  const parsed = CreateSchema.safeParse(input);
  if (!parsed.success) return { error: t("fillEveryField") };

  const d = parsed.data;
  if (d.endTime <= d.startTime) return { error: t("endTimeAfterStart") };
  if (d.lessonDate < studioLocalYmd()) {
    return { error: t("pickFutureDate") };
  }

  const { supabase, userId } = await getUser();
  if (!userId) return { error: t("unauthorized") };

  const { data: profile } = await supabase
    .from("profiles")
    .select("studio_id")
    .eq("id", userId)
    .single();
  if (!profile?.studio_id) return { error: t("noStudioFound") };

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
  const t = await getTranslations("errors.actions");
  if (!z.string().uuid().safeParse(bookingId).success) return { error: t("invalidInput") };

  const { supabase, userId } = await getUser();
  if (!userId) return { error: t("unauthorized") };

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
