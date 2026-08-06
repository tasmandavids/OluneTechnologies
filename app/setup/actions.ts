"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ImportSource, SetupPath, SetupStepId } from "@/lib/setup/constants";
import { SETUP_STEPS } from "@/lib/setup/constants";
import { ensureClassFeeProducts } from "@/lib/billing/class-product";

export type ActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

async function getAdminStudio() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in.", supabase, studioId: null, userId: null };

  const { data: profile } = await supabase
    .from("profiles")
    .select("studio_id, role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") return { error: "Admin only.", supabase, studioId: null, userId: null };
  if (!profile.studio_id) return { error: "No studio found.", supabase, studioId: null, userId: null };

  return {
    error: null,
    supabase,
    studioId: profile.studio_id as string,
    userId: user.id,
  };
}

const optionalEmail = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : undefined))
  .pipe(z.string().email().optional());

const PathSchema = z.object({
  path: z.enum(["scratch", "import"]),
  importSource: z.string().optional(),
});

export async function saveSetupPath(input: unknown): Promise<ActionResult> {
  const parsed = PathSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input" };

  const { error, supabase, studioId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? "Unknown error" };

  const { error: dbError } = await supabase
    .from("studios")
    .update({
      setup_path: parsed.data.path as SetupPath,
      import_source: parsed.data.importSource ?? null,
      setup_step: "profile",
      setup_snoozed_at: null,
    })
    .eq("id", studioId);

  if (dbError) return { ok: false, error: dbError.message };
  return { ok: true };
}

const ProfileSchema = z.object({
  locationCity: z.string().max(120).optional(),
  locationRegion: z.string().max(120).optional(),
  locationCountry: z.string().max(120).optional(),
  about: z.string().max(2000).optional(),
  danceStyles: z.array(z.string().max(80)).max(20),
  timezone: z.string().max(80).optional(),
});

export async function saveStudioProfile(input: unknown): Promise<ActionResult> {
  const parsed = ProfileSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const { error, supabase, studioId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? "Unknown error" };

  const d = parsed.data;
  const { error: dbError } = await supabase
    .from("studios")
    .update({
      location_city: d.locationCity?.trim() || null,
      location_region: d.locationRegion?.trim() || null,
      location_country: d.locationCountry?.trim() || "New Zealand",
      about: d.about?.trim() || null,
      dance_styles: d.danceStyles,
      setup_step: "students",
      setup_snoozed_at: null,
      ...(d.timezone ? { timezone: d.timezone } : {}),
    })
    .eq("id", studioId);

  if (dbError) return { ok: false, error: dbError.message };

  if (d.about?.trim()) {
    await supabase
      .from("studio_branding")
      .update({ tagline: d.about.trim().slice(0, 160) })
      .eq("studio_id", studioId);
  }

  return { ok: true };
}

const StudentRowSchema = z.object({
  fullName: z.string().min(1).max(120),
  email: optionalEmail,
  phone: z.string().max(30).optional(),
  parentName: z.string().max(120).optional(),
  parentEmail: optionalEmail,
});

const BulkStudentsSchema = z.object({
  students: z.array(StudentRowSchema).max(500),
  linkParents: z.boolean().optional().default(true),
});

async function findOrCreateParent(
  admin: SupabaseClient,
  studioId: string,
  parentName?: string,
  parentEmail?: string,
): Promise<string | null> {
  if (!parentName?.trim() && !parentEmail) return null;

  if (parentEmail) {
    const { data: existing } = await admin
      .from("profiles")
      .select("id")
      .eq("studio_id", studioId)
      .eq("email", parentEmail)
      .eq("role", "parent")
      .maybeSingle();
    if (existing?.id) return existing.id;
  }

  const authEmail = parentEmail ?? `${crypto.randomUUID()}@parents.olune.local`;
  const { data: authData, error: authErr } = await admin.auth.admin.createUser({
    email: authEmail,
    email_confirm: true,
    user_metadata: { full_name: parentName?.trim() || undefined },
  });
  if (authErr || !authData.user) return null;

  const { error: profileErr } = await admin.from("profiles").upsert({
    id: authData.user.id,
    studio_id: studioId,
    role: "parent",
    full_name: parentName?.trim() || null,
    email: parentEmail ?? null,
  });
  if (profileErr) return null;
  return authData.user.id;
}

export async function bulkAddStudents(input: unknown): Promise<
  ActionResult<{ added: number; parentsLinked: number; skipped: number }>
> {
  const parsed = BulkStudentsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid student data — check names and emails." };

  const { error, studioId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? "Unknown error" };

  if (parsed.data.students.length === 0) {
    return { ok: true, data: { added: 0, parentsLinked: 0, skipped: 0 } };
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return {
      ok: false,
      error: "Bulk import requires SUPABASE_SERVICE_ROLE_KEY in .env.local.",
    };
  }

  let added = 0;
  let parentsLinked = 0;
  let skipped = 0;
  const linkParents = parsed.data.linkParents !== false;

  for (const row of parsed.data.students) {
    const authEmail = row.email ?? `${crypto.randomUUID()}@students.olune.local`;
    const { data: authData, error: authErr } = await admin.auth.admin.createUser({
      email: authEmail,
      email_confirm: true,
      user_metadata: { full_name: row.fullName },
    });
    if (authErr || !authData.user) {
      skipped += 1;
      continue;
    }

    const studentId = authData.user.id;
    const { error: profileErr } = await admin.from("profiles").upsert({
      id: studentId,
      studio_id: studioId,
      role: "student",
      full_name: row.fullName,
      email: row.email ?? null,
      phone: row.phone ?? null,
    });
    if (profileErr) {
      skipped += 1;
      continue;
    }
    added += 1;

    if (linkParents && (row.parentName?.trim() || row.parentEmail)) {
      const guardianId = await findOrCreateParent(
        admin,
        studioId,
        row.parentName,
        row.parentEmail,
      );
      if (guardianId) {
        const { error: linkErr } = await admin.from("guardianships").upsert(
          {
            studio_id: studioId,
            guardian_id: guardianId,
            student_id: studentId,
            is_primary: true,
          },
          { onConflict: "guardian_id,student_id" },
        );
        if (!linkErr) parentsLinked += 1;
      }
    }
  }

  revalidatePath("/portal/admin/students");
  return { ok: true, data: { added, parentsLinked, skipped } };
}

const ClassRowSchema = z.object({
  name: z.string().min(1).max(100),
  discipline: z.string().max(80).optional(),
  level: z.string().max(80).optional(),
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  capacity: z.number().int().min(1).max(500),
  priceCents: z.number().int().min(0),
});

const BulkClassesSchema = z.object({
  classes: z.array(ClassRowSchema).max(200),
});

export async function bulkAddClasses(input: unknown): Promise<ActionResult<{ added: number }>> {
  const parsed = BulkClassesSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid class data" };

  const { error, supabase, studioId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? "Unknown error" };

  if (parsed.data.classes.length === 0) return { ok: true, data: { added: 0 } };

  // A class the studio sells must exist in the catalogue too, or everything
  // downstream — invoice tax treatment, ledger coding, the Xero item — falls
  // back to a bare cents column that carries none of it. One product per
  // distinct price, reusing any tuition product already at that price.
  const productByPrice = await ensureClassFeeProducts(
    supabase,
    studioId,
    parsed.data.classes.map((c) => c.priceCents),
  );

  const rows = parsed.data.classes.map((c) => ({
    studio_id: studioId,
    name: c.name,
    discipline: c.discipline || null,
    level: c.level || null,
    day_of_week: c.dayOfWeek,
    start_time: c.startTime || null,
    end_time: c.endTime || null,
    capacity: c.capacity,
    price_cents: c.priceCents,
    product_id: productByPrice.get(Math.max(0, Math.round(c.priceCents))) ?? null,
  }));

  const { error: dbError } = await supabase.from("classes").insert(rows);
  if (dbError) return { ok: false, error: dbError.message };

  revalidatePath("/portal/admin/money");

  revalidatePath("/portal/admin/classes");
  return { ok: true, data: { added: rows.length } };
}

const stepIds = SETUP_STEPS.map((s) => s.id) as [SetupStepId, ...SetupStepId[]];

const StepSchema = z.object({
  step: z.enum(stepIds),
});

export async function saveSetupStep(input: unknown): Promise<ActionResult> {
  const parsed = StepSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid step" };

  const { error, supabase, studioId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? "Unknown error" };

  const { error: dbError } = await supabase
    .from("studios")
    .update({ setup_step: parsed.data.step })
    .eq("id", studioId);

  if (dbError) return { ok: false, error: dbError.message };
  return { ok: true };
}

export async function snoozeSetup(input?: unknown): Promise<ActionResult> {
  const stepParsed = StepSchema.safeParse(input ?? { step: "path" });
  const step = stepParsed.success ? stepParsed.data.step : "path";

  const { error, supabase, studioId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? "Unknown error" };

  const { error: dbError } = await supabase
    .from("studios")
    .update({
      setup_step: step,
      setup_snoozed_at: new Date().toISOString(),
    })
    .eq("id", studioId);

  if (dbError) return { ok: false, error: dbError.message };

  revalidatePath("/portal/admin");
  revalidatePath("/setup");
  return { ok: true };
}

export async function resumeSetup(): Promise<ActionResult> {
  const { error, supabase, studioId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? "Unknown error" };

  const { error: dbError } = await supabase
    .from("studios")
    .update({ setup_snoozed_at: null })
    .eq("id", studioId);

  if (dbError) return { ok: false, error: dbError.message };
  revalidatePath("/setup");
  return { ok: true };
}

export async function completeSetup(): Promise<ActionResult> {
  const { error, supabase, studioId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? "Unknown error" };

  const { error: dbError } = await supabase
    .from("studios")
    .update({
      setup_completed_at: new Date().toISOString(),
      setup_step: "tour",
      setup_snoozed_at: null,
    })
    .eq("id", studioId);

  if (dbError) return { ok: false, error: dbError.message };
  revalidatePath("/portal/admin");
  revalidatePath("/setup");
  return { ok: true };
}

export type SetupStudio = {
  name: string;
  setupPath: SetupPath | null;
  importSource: ImportSource | null;
  initialStep: SetupStepId;
  locationCity: string | null;
  locationRegion: string | null;
  locationCountry: string | null;
  about: string | null;
  danceStyles: string[];
  schemaReady: boolean;
};
