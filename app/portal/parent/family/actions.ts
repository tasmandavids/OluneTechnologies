"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type InviteCoParentResult = { ok: true; linked: boolean } | { ok: false; error: string };

const InviteCoParentSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  relationship: z.enum(["mother", "father", "guardian", "other"]).default("guardian"),
});

// Invites a second parent/guardian into the SAME family — linking them to every
// dancer the inviting parent already guards, instead of letting them register
// separately and (re)create duplicate child profiles for kids that already exist.
export async function inviteCoParent(input: unknown): Promise<InviteCoParentResult> {
  const parsed = InviteCoParentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("studio_id, role, email")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "parent" || !profile.studio_id) {
    return { ok: false, error: "Parent access required." };
  }

  const { email, relationship } = parsed.data;
  if (profile.email && profile.email.toLowerCase() === email) {
    return { ok: false, error: "That's your own email address." };
  }

  const { data: guardianships } = await supabase
    .from("guardianships")
    .select("student_id")
    .eq("guardian_id", user.id);

  const studentIds = (guardianships ?? []).map((g) => g.student_id as string);
  if (studentIds.length === 0) {
    return { ok: false, error: "Add a dancer to your family before inviting a co-parent." };
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return { ok: false, error: "Inviting a co-parent requires studio configuration. Contact support." };
  }

  const studioId = profile.studio_id as string;

  // Already an account in this studio? Link them to the family instead of inviting.
  const { data: existing } = await admin
    .from("profiles")
    .select("id, role")
    .eq("studio_id", studioId)
    .eq("email", email)
    .maybeSingle();

  if (existing) {
    if (existing.role !== "parent") {
      return { ok: false, error: "That email already belongs to a different type of account." };
    }

    const { error: linkErr } = await admin.from("guardianships").upsert(
      studentIds.map((studentId) => ({
        studio_id: studioId,
        guardian_id: existing.id,
        student_id: studentId,
        is_primary: false,
        relationship,
      })),
      { onConflict: "guardian_id,student_id" },
    );
    if (linkErr) return { ok: false, error: linkErr.message };

    revalidatePath("/portal/parent");
    return { ok: true, linked: true };
  }

  const { data: inviteData, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/auth/callback?next=/welcome`,
  });
  if (inviteErr || !inviteData.user) {
    return { ok: false, error: inviteErr?.message ?? "Could not send invite." };
  }

  const newParentId = inviteData.user.id;

  const { error: profileErr } = await admin.from("profiles").upsert({
    id: newParentId,
    studio_id: studioId,
    role: "parent",
    email,
  });
  if (profileErr) return { ok: false, error: profileErr.message };

  const { error: linkErr } = await admin.from("guardianships").insert(
    studentIds.map((studentId) => ({
      studio_id: studioId,
      guardian_id: newParentId,
      student_id: studentId,
      is_primary: false,
      relationship,
    })),
  );
  if (linkErr) return { ok: false, error: linkErr.message };

  revalidatePath("/portal/parent");
  return { ok: true, linked: false };
}
