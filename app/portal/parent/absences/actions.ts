"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getTranslations } from "@/lib/i18n/server";
import { reportHandledError } from "@/lib/observability/report";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function reportAbsence(data: {
  studentId: string;
  classId: string;
  absenceDate: string;
  reason: string;
  notes: string;
}): Promise<ActionResult> {
  // Returns a result rather than throwing. Next.js sanitises an error thrown
  // out of a server action in production — the client gets a digest, not the
  // message — so a thrown string can never actually reach the parent. The
  // caller had no catch either, which meant a failed insert closed nothing
  // and said nothing.
  const t = await getTranslations("errors.actions");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: t("notSignedIn") };

  const { data: profile } = await supabase
    .from("profiles")
    .select("studio_id")
    .eq("id", user.id)
    .single();

  if (!profile?.studio_id) return { ok: false, error: t("noStudioFound") };

  const { error } = await supabase.from("student_absences").insert({
    student_id: data.studentId,
    class_id: data.classId,
    absence_date: data.absenceDate,
    reason: data.reason,
    notes: data.notes || null,
    reported_by: user.id,
    makeup_status: "not_requested",
    studio_id: profile.studio_id,
  });

  if (error) {
    // The raw PostgrestError named tables and constraints; it used to be
    // thrown straight at the client. Sentry gets it, the parent gets a
    // sentence they can act on.
    await reportHandledError(error, {
      route: "parent.absences.report",
      extra: { classId: data.classId, absenceDate: data.absenceDate },
    });
    return { ok: false, error: t("couldNotSaveAbsence") };
  }

  revalidatePath("/portal/parent/absences");
  return { ok: true };
}
