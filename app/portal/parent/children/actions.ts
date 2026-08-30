"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { inviteRedirectUrl } from "@/lib/app-url";
import { createStudentAuthUser } from "@/lib/students/login-email";
import { escapeHtml } from "@/lib/notify/messages";
import { getParentStudio } from "@/lib/portal/access";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";

export type ChildActionResult = { ok: true; studentId: string } | { ok: false; error: string };

const AddChildSchema = z.object({
  fullName: z.string().min(1, "Name is required").max(120),
  birthday: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
});

export async function addChildToFamily(input: unknown): Promise<ChildActionResult> {
  const parsed = AddChildSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const ctx = await getParentStudio();
  if (ctx.error || !ctx.userId || !ctx.studioId || ctx.mode !== "parent") {
    return { ok: false, error: ctx.error ?? "Parent access required." };
  }

  if (!checkRateLimit(rateLimitKey("add-child", ctx.userId), { limit: 10, windowMs: 60 * 60_000 })) {
    return { ok: false, error: "Too many invite attempts. Please try again later." };
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return { ok: false, error: "Adding children requires studio configuration. Contact support." };
  }

  const d = parsed.data;
  let studentId: string;
  let generatedLoginEmail: string | null = null;

  if (d.email) {
    const { data: inviteData, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(d.email, {
      data: { full_name: d.fullName },
      redirectTo: inviteRedirectUrl(),
    });
    if (inviteErr) return { ok: false, error: inviteErr.message };
    studentId = inviteData.user.id;
  } else {
    try {
      const created = await createStudentAuthUser(admin, d.fullName, { full_name: d.fullName });
      studentId = created.userId;
      generatedLoginEmail = created.email;
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Could not create student login." };
    }
  }

  const { error: profileErr } = await admin.from("profiles").upsert({
    id: studentId,
    studio_id: ctx.studioId,
    role: "student",
    full_name: d.fullName,
    email: d.email || generatedLoginEmail,
    birthday: d.birthday || null,
    self_managed: false,
  });
  if (profileErr) return { ok: false, error: profileErr.message };

  const { error: linkErr } = await admin.from("guardianships").insert({
    studio_id: ctx.studioId,
    guardian_id: ctx.userId,
    student_id: studentId,
    is_primary: true,
    relationship: "guardian",
  });
  if (linkErr) return { ok: false, error: linkErr.message };

  const { data: parentProfile } = await ctx.supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", ctx.userId)
    .single();

  if (
    generatedLoginEmail &&
    parentProfile?.email &&
    !String(parentProfile.email).endsWith(".olune.local")
  ) {
    await notifyParentOfStudentLogin({
      admin,
      parentEmail: parentProfile.email as string,
      parentName: (parentProfile.full_name as string | null) ?? null,
      studentName: d.fullName,
      loginEmail: generatedLoginEmail,
    });
  }

  revalidatePath("/portal/parent");
  return { ok: true, studentId };
}

async function notifyParentOfStudentLogin(params: {
  admin: ReturnType<typeof createAdminClient>;
  parentEmail: string;
  parentName: string | null;
  studentName: string;
  loginEmail: string;
}): Promise<void> {
  const { admin, parentEmail, parentName, studentName, loginEmail } = params;

  const { data: linkData } = await admin.auth.admin.generateLink({
    type: "invite",
    email: loginEmail,
    options: { redirectTo: inviteRedirectUrl() },
  });
  const inviteUrl = linkData?.properties?.action_link;

  const { sendEmail } = await import("@/lib/notify/providers");
  const safeStudentName = escapeHtml(studentName);
  const safeLoginEmail = escapeHtml(loginEmail);
  const greeting = parentName ? `Hi ${escapeHtml(parentName)},` : "Hi,";
  const setPasswordBlock = inviteUrl
    ? `<p>Click the link below to set a password for ${safeStudentName}:</p>
<p><a href="${inviteUrl}">Set password for ${safeStudentName}</a></p>
<p>This link expires in 24 hours.</p>`
    : "";
  const setPasswordText = inviteUrl
    ? `\n\nSet a password for ${studentName} here:\n${inviteUrl}\n\nThis link expires in 24 hours.`
    : "";

  await sendEmail({
    to: parentEmail,
    subject: `Login details for ${studentName}`,
    html: `<p>${greeting}</p>
<p>We've created a portal login for ${safeStudentName}.</p>
<p><strong>Login email:</strong> ${safeLoginEmail}</p>
${setPasswordBlock}
<p>Keep these details somewhere safe — ${safeStudentName} will need them to sign in.</p>`,
    text: `${greeting}\n\nWe've created a portal login for ${studentName}.\n\nLogin email: ${loginEmail}${setPasswordText}\n\nKeep these details somewhere safe — ${studentName} will need them to sign in.`,
  });
}
