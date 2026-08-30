"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { inviteRedirectUrl } from "@/lib/app-url";
import {
  getAdminStudio as getOwnerStudio,
  getStudioOpsStudio,
} from "@/lib/portal/access";
import { listStudioMemberProfileIds } from "@/lib/portal/studio-members";
import {
  dedupeParentsByEmail,
  renderMassParentEmail,
  type ParentEmailCandidate,
} from "@/lib/parents/mass-email";
import type { GuardianRelationship } from "@/lib/parents/types";

/** Front-desk + owner — roster CRUD. */
async function getAdminStudio() {
  const ctx = await getStudioOpsStudio();
  return {
    error: ctx.error,
    supabase: ctx.supabase,
    studioId: ctx.studioId,
  };
}

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

const RelationshipSchema = z.enum(["mother", "father", "guardian", "other"]);

const GuardianInputSchema = z.object({
  fullName: z.string().min(1, "Name is required").max(120),
  email: z.string().email("Valid email required").optional().or(z.literal("")),
  phone: z.string().max(30).optional().or(z.literal("")),
  relationship: RelationshipSchema.default("guardian"),
});

const ParentSchema = GuardianInputSchema;

const AddFamilySchema = z.object({
  primary: GuardianInputSchema,
  coParent: GuardianInputSchema.optional(),
  primaryContactId: z.enum(["primary", "coParent"]).default("primary"),
  childIds: z.array(z.string().uuid()).default([]),
});

const PARENT_PATHS = [
  "/portal/admin/parents",
  "/portal/admin/people",
  "/portal/admin/money",
];

function revalidateParentPaths(parentId?: string) {
  for (const path of PARENT_PATHS) revalidatePath(path);
  if (parentId) revalidatePath(`/portal/admin/parents/${parentId}`);
}

async function createParentProfile(
  admin: SupabaseClient,
  studioId: string,
  input: z.infer<typeof GuardianInputSchema>,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (input.email) {
    const { data: existing } = await admin
      .from("profiles")
      .select("id")
      .eq("studio_id", studioId)
      .eq("email", input.email)
      .eq("role", "parent")
      .maybeSingle();
    if (existing) return { ok: false, error: `A parent with email ${input.email} already exists.` };
  }

  const authEmail = input.email || `${crypto.randomUUID()}@parents.olune.local`;

  const { data: authData, error: authErr } = await admin.auth.admin.createUser({
    email: authEmail,
    email_confirm: true,
    user_metadata: { full_name: input.fullName },
  });
  if (authErr) return { ok: false, error: authErr.message };

  const userId = authData.user.id;
  const { error: dbError } = await admin.from("profiles").upsert({
    id: userId,
    studio_id: studioId,
    role: "parent",
    full_name: input.fullName,
    email: input.email || null,
    phone: input.phone || null,
  });

  if (dbError) return { ok: false, error: dbError.message };

  await admin.from("studio_memberships").upsert(
    {
      user_id: userId,
      studio_id: studioId,
      role: "parent",
      is_primary: true,
      linked_via: "admin",
      status: "active",
    },
    { onConflict: "user_id,studio_id" },
  );

  return { ok: true, id: userId };
}

async function linkGuardianships(
  admin: SupabaseClient,
  studioId: string,
  links: {
    guardianId: string;
    studentId: string;
    relationship: GuardianRelationship;
    isPrimary: boolean;
  }[],
) {
  for (const link of links) {
    const { error } = await admin.from("guardianships").upsert(
      {
        studio_id: studioId,
        guardian_id: link.guardianId,
        student_id: link.studentId,
        relationship: link.relationship,
        is_primary: link.isPrimary,
      },
      { onConflict: "guardian_id,student_id" },
    );
    if (error) return error.message;
  }
  return null;
}

async function clearPrimaryForStudents(
  admin: SupabaseClient,
  studioId: string,
  studentIds: string[],
) {
  if (studentIds.length === 0) return null;
  const { error } = await admin
    .from("guardianships")
    .update({ is_primary: false })
    .eq("studio_id", studioId)
    .in("student_id", studentIds);
  return error?.message ?? null;
}

export async function addParent(input: unknown): Promise<ActionResult> {
  const parsed = ParentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const { error, studioId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? "Unknown error" };

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return {
      ok: false,
      error: "Adding parents requires SUPABASE_SERVICE_ROLE_KEY in .env.local (Supabase → Settings → API).",
    };
  }

  const result = await createParentProfile(admin, studioId, parsed.data);
  if (!result.ok) return result;

  revalidateParentPaths();
  return { ok: true, id: result.id };
}

export async function addFamily(input: unknown): Promise<ActionResult> {
  const parsed = AddFamilySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const { error, studioId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? "Unknown error" };

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return {
      ok: false,
      error: "Adding families requires SUPABASE_SERVICE_ROLE_KEY in .env.local.",
    };
  }

  const { primary, coParent, primaryContactId, childIds } = parsed.data;

  const primaryResult = await createParentProfile(admin, studioId, primary);
  if (!primaryResult.ok) return primaryResult;

  let coParentId: string | null = null;
  if (coParent) {
    const coResult = await createParentProfile(admin, studioId, coParent);
    if (!coResult.ok) return coResult;
    coParentId = coResult.id;
  }

  const primaryGuardianId =
    primaryContactId === "coParent" && coParentId ? coParentId : primaryResult.id;
  const secondaryGuardianId =
    coParentId && primaryGuardianId === coParentId ? primaryResult.id : coParentId;

  if (childIds.length > 0) {
    const clearErr = await clearPrimaryForStudents(admin, studioId, childIds);
    if (clearErr) return { ok: false, error: clearErr };

    const links: {
      guardianId: string;
      studentId: string;
      relationship: GuardianRelationship;
      isPrimary: boolean;
    }[] = [];

    for (const studentId of childIds) {
      links.push({
        guardianId: primaryResult.id,
        studentId,
        relationship: primary.relationship as GuardianRelationship,
        isPrimary: primaryGuardianId === primaryResult.id,
      });
      if (coParentId && coParent) {
        links.push({
          guardianId: coParentId,
          studentId,
          relationship: coParent.relationship as GuardianRelationship,
          isPrimary: primaryGuardianId === coParentId,
        });
      }
    }

    const linkErr = await linkGuardianships(admin, studioId, links);
    if (linkErr) return { ok: false, error: linkErr };
  }

  revalidateParentPaths(primaryResult.id);
  if (coParentId) revalidateParentPaths(coParentId);
  return { ok: true, id: primaryResult.id };
}

const UpdateParentSchema = z.object({
  id: z.string().uuid(),
  fullName: z.string().min(1).max(120),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().max(30).optional().or(z.literal("")),
});

export async function updateParent(input: unknown): Promise<ActionResult> {
  const parsed = UpdateParentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const { error, supabase, studioId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? "Unknown error" };

  const { id, fullName, email, phone } = parsed.data;

  const parentIds = await listStudioMemberProfileIds(supabase, studioId, "parent");
  if (!parentIds.includes(id)) return { ok: false, error: "Parent not found." };

  if (email) {
    const { data: dup } = await supabase
      .from("profiles")
      .select("id")
      .eq("studio_id", studioId)
      .eq("email", email)
      .eq("role", "parent")
      .neq("id", id)
      .maybeSingle();
    if (dup) return { ok: false, error: "Another parent already uses this email." };
  }

  const { error: updateErr } = await supabase
    .from("profiles")
    .update({
      full_name: fullName,
      email: email || null,
      phone: phone || null,
    })
    .eq("id", id);

  if (updateErr) return { ok: false, error: updateErr.message };

  revalidateParentPaths(id);
  return { ok: true, id };
}

const LinkChildSchema = z.object({
  guardianId: z.string().uuid(),
  studentId: z.string().uuid(),
  relationship: RelationshipSchema.default("guardian"),
  isPrimary: z.boolean().optional(),
});

export async function linkChild(input: unknown): Promise<ActionResult> {
  const parsed = LinkChildSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const { error, supabase, studioId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? "Unknown error" };

  const { guardianId, studentId, relationship, isPrimary } = parsed.data;

  const [parentIds, studentIds] = await Promise.all([
    listStudioMemberProfileIds(supabase, studioId, "parent"),
    listStudioMemberProfileIds(supabase, studioId, "student"),
  ]);

  if (!parentIds.includes(guardianId)) return { ok: false, error: "Parent not found." };
  if (!studentIds.includes(studentId)) return { ok: false, error: "Student not found." };

  let primary = isPrimary ?? false;
  if (isPrimary === undefined) {
    const { count } = await supabase
      .from("guardianships")
      .select("id", { count: "exact", head: true })
      .eq("student_id", studentId);
    primary = (count ?? 0) === 0;
  }

  if (primary) {
    const clearErr = await clearPrimaryForStudents(supabase, studioId, [studentId]);
    if (clearErr) return { ok: false, error: clearErr };
  }

  const { error: linkErr } = await supabase.from("guardianships").upsert(
    {
      studio_id: studioId,
      guardian_id: guardianId,
      student_id: studentId,
      relationship,
      is_primary: primary,
    },
    { onConflict: "guardian_id,student_id" },
  );

  if (linkErr) return { ok: false, error: linkErr.message };

  revalidateParentPaths(guardianId);
  return { ok: true };
}

const UnlinkChildSchema = z.object({
  guardianId: z.string().uuid(),
  studentId: z.string().uuid(),
});

export async function unlinkChild(input: unknown): Promise<ActionResult> {
  const parsed = UnlinkChildSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const { error, supabase, studioId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? "Unknown error" };

  const { guardianId, studentId } = parsed.data;

  const { error: delErr } = await supabase
    .from("guardianships")
    .delete()
    .eq("studio_id", studioId)
    .eq("guardian_id", guardianId)
    .eq("student_id", studentId);

  if (delErr) return { ok: false, error: delErr.message };

  revalidateParentPaths(guardianId);
  return { ok: true };
}

const SetPrimarySchema = z.object({
  guardianId: z.string().uuid(),
});

export async function setPrimaryContact(input: unknown): Promise<ActionResult> {
  const parsed = SetPrimarySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const { error, supabase, studioId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? "Unknown error" };

  const { guardianId } = parsed.data;

  const { data: links } = await supabase
    .from("guardianships")
    .select("student_id")
    .eq("studio_id", studioId)
    .eq("guardian_id", guardianId);

  const studentIds = (links ?? []).map((l) => l.student_id as string);
  if (studentIds.length === 0) {
    return { ok: false, error: "Link at least one child before setting primary contact." };
  }

  const clearErr = await clearPrimaryForStudents(supabase, studioId, studentIds);
  if (clearErr) return { ok: false, error: clearErr };

  const { error: updateErr } = await supabase
    .from("guardianships")
    .update({ is_primary: true })
    .eq("studio_id", studioId)
    .eq("guardian_id", guardianId)
    .in("student_id", studentIds);

  if (updateErr) return { ok: false, error: updateErr.message };

  revalidateParentPaths(guardianId);
  return { ok: true };
}

const AddCoParentSchema = z.object({
  existingGuardianId: z.string().uuid(),
  coParent: GuardianInputSchema,
  makePrimary: z.boolean().default(false),
});

export async function addCoParent(input: unknown): Promise<ActionResult> {
  const parsed = AddCoParentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const { error, studioId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? "Unknown error" };

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return {
      ok: false,
      error: "Adding co-parents requires SUPABASE_SERVICE_ROLE_KEY in .env.local.",
    };
  }

  const { existingGuardianId, coParent, makePrimary } = parsed.data;

  const { data: existingLinks } = await admin
    .from("guardianships")
    .select("student_id, relationship")
    .eq("studio_id", studioId)
    .eq("guardian_id", existingGuardianId);

  const coResult = await createParentProfile(admin, studioId, coParent);
  if (!coResult.ok) return coResult;

  const studentIds = (existingLinks ?? []).map((l) => l.student_id as string);

  if (studentIds.length > 0) {
    if (makePrimary) {
      const clearErr = await clearPrimaryForStudents(admin, studioId, studentIds);
      if (clearErr) return { ok: false, error: clearErr };
    }

    const links = studentIds.map((studentId) => ({
      guardianId: coResult.id,
      studentId,
      relationship: coParent.relationship as GuardianRelationship,
      isPrimary: makePrimary,
    }));

    const linkErr = await linkGuardianships(admin, studioId, links);
    if (linkErr) return { ok: false, error: linkErr };
  }

  revalidateParentPaths(existingGuardianId);
  revalidateParentPaths(coResult.id);
  return { ok: true, id: coResult.id };
}

const UpdateChildRelationshipSchema = z.object({
  guardianId: z.string().uuid(),
  studentId: z.string().uuid(),
  relationship: RelationshipSchema,
});

export async function updateChildRelationship(input: unknown): Promise<ActionResult> {
  const parsed = UpdateChildRelationshipSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const { error, supabase, studioId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? "Unknown error" };

  const { guardianId, studentId, relationship } = parsed.data;

  const { error: updateErr } = await supabase
    .from("guardianships")
    .update({ relationship })
    .eq("studio_id", studioId)
    .eq("guardian_id", guardianId)
    .eq("student_id", studentId);

  if (updateErr) return { ok: false, error: updateErr.message };

  revalidateParentPaths(guardianId);
  return { ok: true };
}

// ─── DELETE PARENT ────────────────────────────────────────────────────────────

export async function deleteParent(parentId: string): Promise<ActionResult> {
  if (!parentId) return { ok: false, error: "Missing parent ID" };

  const { error, studioId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? "Unknown error" };

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return {
      ok: false,
      error: "Deleting parents requires SUPABASE_SERVICE_ROLE_KEY in .env.local (Supabase → Settings → API).",
    };
  }

  const parentIds = await listStudioMemberProfileIds(admin, studioId, "parent");
  if (!parentIds.includes(parentId)) {
    return { ok: false, error: "Parent not found." };
  }

  const { data: profile, error: profileErr } = await admin
    .from("profiles")
    .select("id, role, studio_id")
    .eq("id", parentId)
    .eq("role", "parent")
    .maybeSingle();

  if (profileErr) return { ok: false, error: profileErr.message };
  if (!profile) return { ok: false, error: "Parent not found." };

  const { count: invoiceCount } = await admin
    .from("invoices")
    .select("id", { count: "exact", head: true })
    .eq("payer_id", parentId)
    .eq("studio_id", studioId);

  if (invoiceCount && invoiceCount > 0) {
    return {
      ok: false,
      error: "This parent has billing records at this studio and cannot be removed.",
    };
  }

  const { count: subCount } = await admin
    .from("subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("payer_id", parentId)
    .eq("studio_id", studioId);

  if (subCount && subCount > 0) {
    return {
      ok: false,
      error: "This parent has active subscriptions at this studio and cannot be removed.",
    };
  }

  const isHomeStudio = profile.studio_id === studioId;

  if (isHomeStudio) {
    await admin.from("events").update({ created_by: null }).eq("created_by", parentId);

    const { error: deleteErr } = await admin.auth.admin.deleteUser(parentId);
    if (deleteErr) return { ok: false, error: deleteErr.message };
  } else {
    const { error: guardianshipErr } = await admin
      .from("guardianships")
      .delete()
      .eq("studio_id", studioId)
      .eq("guardian_id", parentId);
    if (guardianshipErr) return { ok: false, error: guardianshipErr.message };

    const { error: membershipErr } = await admin
      .from("studio_memberships")
      .delete()
      .eq("studio_id", studioId)
      .eq("user_id", parentId);
    if (membershipErr) return { ok: false, error: membershipErr.message };
  }

  revalidateParentPaths();
  return { ok: true };
}

// ─── BULK INVITE ──────────────────────────────────────────────────────────────
// Sends (or re-sends) invite emails to every parent and self-managed student
// in the studio who has a real email address but has never signed in.
// Safe to call multiple times — skips any account with last_sign_in_at set.

export type BulkInviteResult =
  | { ok: true; sent: number; skipped: number; failed: number; details: string[] }
  | { ok: false; error: string };

export async function bulkInviteMembers(): Promise<BulkInviteResult> {
  const { error, studioId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? "Unknown error" };

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return { ok: false, error: "Requires SUPABASE_SERVICE_ROLE_KEY." };
  }

  // Dynamically import sendEmail — server-only, avoids bundling in edge runtimes
  const { sendEmail } = await import("@/lib/notify/providers");

  // Fetch all profiles with a real email (not ghost @*.olune.local addresses)
  const { data: profiles, error: profilesErr } = await admin
    .from("profiles")
    .select("id, full_name, email, role")
    .eq("studio_id", studioId)
    .in("role", ["parent", "student"])
    .not("email", "ilike", "%@%.olune.local")
    .not("email", "is", null);

  if (profilesErr) return { ok: false, error: profilesErr.message };
  if (!profiles || profiles.length === 0) {
    return { ok: true, sent: 0, skipped: 0, failed: 0, details: ["No members with email found."] };
  }

  const redirectTo = inviteRedirectUrl();

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  const details: string[] = [];

  for (const profile of profiles) {
    if (!profile.email) continue;

    // Check if they've already signed in (don't re-invite active accounts)
    const { data: authUser } = await admin.auth.admin.getUserById(profile.id);
    if (authUser?.user?.last_sign_in_at) {
      skipped++;
      continue;
    }

    // Generate a new invite link — works for both unconfirmed and
    // accounts created with email_confirm:true but never signed in
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "invite",
      email: profile.email,
      options: { redirectTo },
    });

    if (linkErr || !linkData?.properties?.action_link) {
      failed++;
      details.push(`${profile.email}: ${linkErr?.message ?? "no link generated"}`);
      continue;
    }

    const inviteUrl = linkData.properties.action_link;
    const name = profile.full_name ?? "there";

    const result = await sendEmail({
      to: profile.email,
      subject: "You've been invited to Olune",
      html: `<p>Hi ${name},</p>
<p>You've been added to your studio's Olune portal. Click the link below to set your password and get started:</p>
<p><a href="${inviteUrl}">Accept invitation &amp; set password</a></p>
<p>This link expires in 24 hours.</p>
<p>If you didn't expect this email, you can ignore it.</p>`,
      text: `Hi ${name},\n\nYou've been added to your studio's Olune portal.\n\nAccept your invitation and set a password here:\n${inviteUrl}\n\nThis link expires in 24 hours.`,
    });

    if (!result.ok && !result.skipped) {
      failed++;
      details.push(`${profile.email}: ${result.error}`);
    } else {
      sent++;
    }
  }

  return { ok: true, sent, skipped, failed, details };
}

// ─── MASS EMAIL PARENTS ───────────────────────────────────────────────────────
// Studio owners compose a subject + body and send via Resend to parents with
// real email addresses. Scope: all parents, selected IDs, or parents of a class.

export type MassEmailResult =
  | { ok: true; sent: number; skipped: number; failed: number; details: string[] }
  | { ok: false; error: string };

const MassEmailSchema = z.object({
  subject: z.string().trim().min(1, "Subject is required").max(200),
  body: z.string().trim().min(1, "Message is required").max(10_000),
  scope: z.enum(["all", "selected", "class"]),
  parentIds: z.array(z.string().uuid()).max(500).optional(),
  classId: z.string().uuid().optional(),
});

async function resolveMassEmailRecipients(
  supabase: SupabaseClient,
  studioId: string,
  input: z.infer<typeof MassEmailSchema>,
): Promise<{ ok: true; parents: ParentEmailCandidate[] } | { ok: false; error: string }> {
  const parentIds = await listStudioMemberProfileIds(supabase, studioId, "parent");
  if (parentIds.length === 0) {
    return { ok: true, parents: [] };
  }

  let targetIds = parentIds;

  if (input.scope === "selected") {
    const selected = input.parentIds ?? [];
    if (selected.length === 0) {
      return { ok: false, error: "Select at least one parent." };
    }
    const allowed = new Set(parentIds);
    targetIds = selected.filter((id) => allowed.has(id));
    if (targetIds.length === 0) {
      return { ok: false, error: "No valid parents selected." };
    }
  } else if (input.scope === "class") {
    if (!input.classId) {
      return { ok: false, error: "Choose a class." };
    }

    const { data: enrollments, error: enrollErr } = await supabase
      .from("enrollments")
      .select("student_id")
      .eq("studio_id", studioId)
      .eq("class_id", input.classId)
      .eq("status", "active");

    if (enrollErr) return { ok: false, error: enrollErr.message };

    const studentIds = [...new Set((enrollments ?? []).map((e) => e.student_id as string))];
    if (studentIds.length === 0) {
      return { ok: true, parents: [] };
    }

    const { data: links, error: linkErr } = await supabase
      .from("guardianships")
      .select("guardian_id")
      .eq("studio_id", studioId)
      .in("student_id", studentIds);

    if (linkErr) return { ok: false, error: linkErr.message };

    const guardianSet = new Set((links ?? []).map((l) => l.guardian_id as string));
    targetIds = parentIds.filter((id) => guardianSet.has(id));
  }

  if (targetIds.length === 0) {
    return { ok: true, parents: [] };
  }

  const { data: profiles, error: profilesErr } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .in("id", targetIds)
    .eq("role", "parent");

  if (profilesErr) return { ok: false, error: profilesErr.message };

  return {
    ok: true,
    parents: dedupeParentsByEmail((profiles ?? []) as ParentEmailCandidate[]),
  };
}

export async function massEmailParents(input: unknown): Promise<MassEmailResult> {
  const parsed = MassEmailSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  // Studio owners only (admin) — office staff manage roster but do not blast email.
  const { error, supabase, studioId } = await getOwnerStudio();
  if (error || !studioId || !supabase) {
    return { ok: false, error: error ?? "Not authorized." };
  }

  const { isEmailConfigured } = await import("@/lib/notify/config");
  if (!isEmailConfigured()) {
    return {
      ok: false,
      error: "Email is not configured. Set RESEND_API_KEY and RESEND_FROM to send mass emails.",
    };
  }

  const recipients = await resolveMassEmailRecipients(supabase, studioId, parsed.data);
  if (!recipients.ok) return recipients;

  if (recipients.parents.length === 0) {
    return {
      ok: true,
      sent: 0,
      skipped: 0,
      failed: 0,
      details: ["No parents with a deliverable email address matched this selection."],
    };
  }

  const { data: studio } = await supabase
    .from("studios")
    .select("name")
    .eq("id", studioId)
    .maybeSingle();

  const studioName = (studio?.name as string | null)?.trim() || "Your studio";
  const { sendEmail } = await import("@/lib/notify/providers");

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  const details: string[] = [];

  for (const parent of recipients.parents) {
    if (!parent.email) {
      skipped++;
      continue;
    }

    const rendered = renderMassParentEmail({
      studioName,
      subject: parsed.data.subject,
      body: parsed.data.body,
      parentName: parent.full_name,
    });

    const result = await sendEmail({
      to: parent.email,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });

    if (result.ok) {
      sent++;
    } else if (result.skipped) {
      skipped++;
      details.push(`${parent.email}: email provider not configured`);
    } else {
      failed++;
      details.push(`${parent.email}: ${result.error}`);
    }
  }

  return { ok: true, sent, skipped, failed, details };
}
