"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAdult } from "@/lib/join/age";

export type CompleteProfileResult = { ok: false; error: string };

const CompleteProfileSchema = z.object({
  fullName: z.string().trim().min(1, "Full name is required."),
  birthday: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date of birth is required."),
});

export async function completeAdultProfile(input: unknown): Promise<CompleteProfileResult> {
  const parsed = CompleteProfileSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const { fullName, birthday } = parsed.data;

  if (!isAdult(birthday)) {
    return { ok: false, error: "You must be 18 or older." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, self_managed")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "student" || !profile.self_managed) {
    return { ok: false, error: "This form is only for self-managed adult students." };
  }

  const { error } = await supabase
    .from("profiles")
    .update({ full_name: fullName, birthday })
    .eq("id", user.id);
  if (error) return { ok: false, error: error.message };

  redirect("/portal/student");
}
