"use server";

// ============================================================================
//  Forms server actions.
//
//  Same belt-and-braces convention as the rest of the admin actions: every
//  write re-checks studio + admin role in app code rather than trusting RLS
//  alone, and every id that arrives from the client is re-read tenant-scoped
//  before it is used.
//
//  Audience is saved as a full replace — the builder always sends the complete
//  target list, so diffing rows here would only add a way for the two to drift.
// ============================================================================

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAdminStudio } from "@/lib/portal/access";
import { loadFormResponses } from "@/lib/forms/data";
import { FORM_FIELD_TYPES, FORM_SUBJECT_SCOPES, FORM_TYPES } from "@/lib/forms/types";
import type { FormAudienceTarget, FormResponseRecord } from "@/lib/forms/types";
import type { FormRecipient } from "@/lib/forms/data";

export type FormActionResult = { ok: true; id: string } | { ok: false; error: string };

export type FormResponsesResult =
  | { ok: true; recipients: FormRecipient[]; responses: FormResponseRecord[] }
  | { ok: false; error: string };

/** Who a form went to and who has signed. Loaded on demand — resolving every
 *  form's roster up front would make the list page pay for a drawer nobody
 *  may open. */
export async function getFormResponses(formId: string): Promise<FormResponsesResult> {
  const { error: accessError, supabase, studioId } = await getAdminStudio();
  if (accessError || !studioId) return { ok: false, error: accessError ?? "No studio found." };
  if (!z.string().uuid().safeParse(formId).success) return { ok: false, error: "Unknown form." };

  const result = await loadFormResponses(supabase, studioId, formId);
  if (!result) return { ok: false, error: "That form no longer exists." };
  return { ok: true, recipients: result.recipients, responses: result.responses };
}

const ROLES = ["admin", "teacher", "office", "parent", "student"] as const;

const FieldSchema = z.object({
  key: z.string().trim().min(1).max(60),
  label: z.string().trim().min(1).max(160),
  type: z.enum(FORM_FIELD_TYPES),
  required: z.boolean().default(false),
  options: z.array(z.string().trim().min(1).max(120)).max(30).optional(),
  placeholder: z.string().trim().max(160).optional(),
});

const AudienceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("all") }),
  z.object({ kind: z.literal("role"), role: z.enum(ROLES) }),
  z.object({ kind: z.literal("class"), classId: z.string().uuid() }),
  z.object({ kind: z.literal("person"), profileId: z.string().uuid() }),
]);

const FormSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(400).optional(),
  body: z.string().trim().max(40_000).optional(),
  formType: z.enum(FORM_TYPES).default("policy"),
  fields: z.array(FieldSchema).max(60).default([]),
  isRequired: z.boolean().default(true),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  signatureRequired: z.boolean().default(true),
  signatureStatement: z.string().trim().max(1_000).optional(),
  subjectScope: z.enum(FORM_SUBJECT_SCOPES).default("student"),
  audience: z.array(AudienceSchema).max(400).default([]),
  publish: z.boolean().default(false),
});

export type FormInput = z.input<typeof FormSchema>;

/** Duplicate keys would make responses unreadable — the last write would win
 *  silently. Reject rather than de-duplicate, so the builder can say why. */
function hasDuplicateKeys(fields: { key: string }[]): boolean {
  return new Set(fields.map((f) => f.key)).size !== fields.length;
}

/** "Everyone" absorbs every other target — keeping both would let a later
 *  audience edit look like it narrowed the form when it didn't. */
function normaliseAudience(audience: FormAudienceTarget[]): FormAudienceTarget[] {
  if (audience.some((a) => a.kind === "all")) return [{ kind: "all" }];
  const seen = new Set<string>();
  const out: FormAudienceTarget[] = [];
  for (const target of audience) {
    if (target.kind === "all") continue;
    const key =
      target.kind === "role"
        ? `role:${target.role}`
        : target.kind === "class"
          ? `class:${target.classId}`
          : `person:${target.profileId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(target);
  }
  return out;
}

export async function saveForm(raw: FormInput): Promise<FormActionResult> {
  const { error: accessError, supabase, studioId, userId } = await getAdminStudio();
  if (accessError || !studioId) return { ok: false, error: accessError ?? "No studio found." };

  const parsed = FormSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "That form isn't valid." };
  }
  const input = parsed.data;

  if (hasDuplicateKeys(input.fields)) {
    return { ok: false, error: "Two questions share the same key — rename one of them." };
  }
  if (input.publish && input.audience.length === 0) {
    return { ok: false, error: "Choose who this form is for before publishing it." };
  }

  const audience = normaliseAudience(input.audience as FormAudienceTarget[]);

  // Classes and people referenced by the audience must belong to this studio.
  const classIds = audience.flatMap((a) => (a.kind === "class" ? [a.classId] : []));
  const personIds = audience.flatMap((a) => (a.kind === "person" ? [a.profileId] : []));

  if (classIds.length > 0) {
    const { data } = await supabase
      .from("classes")
      .select("id")
      .eq("studio_id", studioId)
      .in("id", classIds);
    if ((data ?? []).length !== classIds.length) {
      return { ok: false, error: "One of those classes isn't in this studio." };
    }
  }
  if (personIds.length > 0) {
    const { data } = await supabase
      .from("profiles")
      .select("id")
      .eq("studio_id", studioId)
      .in("id", personIds);
    if ((data ?? []).length !== personIds.length) {
      return { ok: false, error: "One of those people isn't in this studio." };
    }
  }

  const now = new Date().toISOString();
  const row = {
    studio_id: studioId,
    title: input.title,
    description: input.description || null,
    body: input.body || null,
    form_type: input.formType,
    fields: input.fields,
    is_required: input.isRequired,
    due_date: input.dueDate || null,
    signature_required: input.signatureRequired,
    signature_statement: input.signatureStatement || null,
    subject_scope: input.subjectScope,
    updated_at: now,
  };

  let formId = input.id ?? null;

  if (formId) {
    const { data: existing } = await supabase
      .from("student_forms")
      .select("id, published_at")
      .eq("studio_id", studioId)
      .eq("id", formId)
      .maybeSingle();
    if (!existing) return { ok: false, error: "That form no longer exists." };

    const { error } = await supabase
      .from("student_forms")
      .update({
        ...row,
        // Publishing is sticky: re-saving a live form must not unpublish it,
        // and saving a draft as a draft must not date-stamp it as live.
        published_at: input.publish ? (existing.published_at ?? now) : existing.published_at,
      })
      .eq("id", formId)
      .eq("studio_id", studioId);
    if (error) return { ok: false, error: error.message };
  } else {
    const { data, error } = await supabase
      .from("student_forms")
      .insert({
        ...row,
        active: true,
        created_by: userId,
        published_at: input.publish ? now : null,
      })
      .select("id")
      .single();
    if (error || !data) return { ok: false, error: error?.message ?? "Couldn't create that form." };
    formId = data.id as string;
  }

  const { error: clearError } = await supabase
    .from("form_assignments")
    .delete()
    .eq("form_id", formId)
    .eq("studio_id", studioId);
  if (clearError) return { ok: false, error: clearError.message };

  if (audience.length > 0) {
    const { error: insertError } = await supabase.from("form_assignments").insert(
      audience.map((target) => ({
        form_id: formId,
        studio_id: studioId,
        kind: target.kind,
        role: target.kind === "role" ? target.role : null,
        class_id: target.kind === "class" ? target.classId : null,
        profile_id: target.kind === "person" ? target.profileId : null,
      })),
    );
    if (insertError) return { ok: false, error: insertError.message };
  }

  revalidatePath("/portal/admin/forms");
  revalidatePath("/portal/forms");
  revalidatePath("/portal/parent/forms");
  return { ok: true, id: formId! };
}

export async function setFormPublished(
  formId: string,
  published: boolean,
): Promise<FormActionResult> {
  const { error: accessError, supabase, studioId } = await getAdminStudio();
  if (accessError || !studioId) return { ok: false, error: accessError ?? "No studio found." };
  if (!z.string().uuid().safeParse(formId).success) return { ok: false, error: "Unknown form." };

  if (published) {
    const { count } = await supabase
      .from("form_assignments")
      .select("id", { count: "exact", head: true })
      .eq("form_id", formId)
      .eq("studio_id", studioId);
    if (!count) return { ok: false, error: "Choose who this form is for before publishing it." };
  }

  const { error } = await supabase
    .from("student_forms")
    .update({
      published_at: published ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", formId)
    .eq("studio_id", studioId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/portal/admin/forms");
  revalidatePath("/portal/forms");
  revalidatePath("/portal/parent/forms");
  return { ok: true, id: formId };
}

/** Archive rather than delete — signed responses are records, not drafts. */
export async function setFormActive(formId: string, active: boolean): Promise<FormActionResult> {
  const { error: accessError, supabase, studioId } = await getAdminStudio();
  if (accessError || !studioId) return { ok: false, error: accessError ?? "No studio found." };
  if (!z.string().uuid().safeParse(formId).success) return { ok: false, error: "Unknown form." };

  const { error } = await supabase
    .from("student_forms")
    .update({ active, updated_at: new Date().toISOString() })
    .eq("id", formId)
    .eq("studio_id", studioId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/portal/admin/forms");
  revalidatePath("/portal/forms");
  revalidatePath("/portal/parent/forms");
  return { ok: true, id: formId };
}

export async function duplicateForm(formId: string): Promise<FormActionResult> {
  const { error: accessError, supabase, studioId, userId } = await getAdminStudio();
  if (accessError || !studioId) return { ok: false, error: accessError ?? "No studio found." };
  if (!z.string().uuid().safeParse(formId).success) return { ok: false, error: "Unknown form." };

  const { data: source } = await supabase
    .from("student_forms")
    .select(
      "title, description, body, form_type, fields, is_required, due_date, signature_required, signature_statement, subject_scope",
    )
    .eq("studio_id", studioId)
    .eq("id", formId)
    .maybeSingle();
  if (!source) return { ok: false, error: "That form no longer exists." };

  const { data: created, error } = await supabase
    .from("student_forms")
    .insert({
      studio_id: studioId,
      title: `${source.title} (copy)`,
      description: source.description,
      body: source.body,
      form_type: source.form_type,
      fields: source.fields,
      is_required: source.is_required,
      due_date: source.due_date,
      signature_required: source.signature_required,
      signature_statement: source.signature_statement,
      subject_scope: source.subject_scope,
      active: true,
      published_at: null,
      created_by: userId,
    })
    .select("id")
    .single();
  if (error || !created) return { ok: false, error: error?.message ?? "Couldn't copy that form." };

  const { data: targets } = await supabase
    .from("form_assignments")
    .select("kind, role, class_id, profile_id")
    .eq("form_id", formId)
    .eq("studio_id", studioId);

  if ((targets ?? []).length > 0) {
    await supabase.from("form_assignments").insert(
      (targets ?? []).map((t) => ({
        form_id: created.id as string,
        studio_id: studioId,
        kind: t.kind,
        role: t.role,
        class_id: t.class_id,
        profile_id: t.profile_id,
      })),
    );
  }

  revalidatePath("/portal/admin/forms");
  return { ok: true, id: created.id as string };
}

/** Hard delete, responses and all. Only offered for forms nobody has signed. */
export async function deleteForm(formId: string): Promise<FormActionResult> {
  const { error: accessError, supabase, studioId } = await getAdminStudio();
  if (accessError || !studioId) return { ok: false, error: accessError ?? "No studio found." };
  if (!z.string().uuid().safeParse(formId).success) return { ok: false, error: "Unknown form." };

  const { count } = await supabase
    .from("form_responses")
    .select("id", { count: "exact", head: true })
    .eq("studio_id", studioId)
    .eq("form_id", formId)
    .not("signed_at", "is", null);

  if (count && count > 0) {
    return {
      ok: false,
      error: `${count} ${count === 1 ? "person has" : "people have"} signed this form — archive it instead.`,
    };
  }

  const { error } = await supabase
    .from("student_forms")
    .delete()
    .eq("id", formId)
    .eq("studio_id", studioId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/portal/admin/forms");
  return { ok: true, id: formId };
}
