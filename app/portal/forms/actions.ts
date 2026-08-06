"use server";

// ============================================================================
//  Signing a form.
//
//  One action serves every role, because "who may sign this for whom" is a
//  data question, not a route question: re-resolve the caller's assigned forms
//  and check that the form and the subject both appear in it. A crafted POST
//  naming somebody else's child fails that check before anything is written.
//
//  Signing captures the evidence a studio would need if a policy were ever
//  disputed: the signature itself, the typed legal name, the time, and the IP
//  and user agent it came from.
// ============================================================================

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { loadAssignedForms } from "@/lib/forms/data";
import type { Role } from "@/lib/types";

export type SubmitResult = { ok: true } | { ok: false; error: string };

const SignatureSchema = z.object({
  // A drawn signature is a PNG data URL; ~1MB of base64 is far more than a
  // 720×240 stroke render needs, and caps what a crafted POST can store.
  value: z.string().min(1).max(1_200_000),
  type: z.enum(["drawn", "typed"]),
  name: z.string().trim().min(1).max(160),
});

const SubmitSchema = z.object({
  formId: z.string().uuid(),
  subjectId: z.string().uuid(),
  data: z.record(z.unknown()).default({}),
  signature: SignatureSchema.nullable().default(null),
});

function clientIp(headerList: Headers): string | null {
  const forwarded = headerList.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim() || null;
  return headerList.get("x-real-ip");
}

export async function submitFormResponse(input: {
  formId: string;
  subjectId: string;
  data: Record<string, unknown>;
  signature: { value: string; type: "drawn" | "typed"; name: string } | null;
}): Promise<SubmitResult> {
  const parsed = SubmitSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That submission isn't valid." };
  const { formId, subjectId, data, signature } = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("studio_id, active_studio_id, role, full_name")
    .eq("id", user.id)
    .single();

  const studioId = (profile?.active_studio_id as string | null) ?? (profile?.studio_id as string | null);
  if (!studioId) return { ok: false, error: "No studio found." };

  const { forms } = await loadAssignedForms(
    supabase,
    user.id,
    studioId,
    (profile?.role as Role) ?? "parent",
    (profile?.full_name as string | null) ?? null,
  );

  const assigned = forms.find((f) => f.form.id === formId);
  if (!assigned) return { ok: false, error: "That form isn't assigned to you." };
  if (!assigned.subjects.some((s) => s.profileId === subjectId)) {
    return { ok: false, error: "That form isn't assigned to that person." };
  }

  const form = assigned.form;

  for (const field of form.fields) {
    if (!field.required) continue;
    const value = data[field.key];
    const missing =
      value === undefined ||
      value === null ||
      (typeof value === "string" && value.trim() === "") ||
      (field.type === "checkbox" && value !== true);
    if (missing) return { ok: false, error: `"${field.label}" is required.` };
  }

  if (form.signatureRequired && !signature) {
    return { ok: false, error: "This form has to be signed before it can be submitted." };
  }
  if (signature?.type === "drawn" && !signature.value.startsWith("data:image/png;base64,")) {
    return { ok: false, error: "That signature couldn't be read — please sign again." };
  }

  // Only the form's own fields are stored: a crafted POST can't smuggle extra
  // keys into the response record.
  const allowed = new Set(form.fields.map((f) => f.key));
  const cleanData: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (allowed.has(key)) cleanData[key] = value;
  }

  const headerList = await headers();
  const now = new Date().toISOString();

  const { error } = await supabase.from("form_responses").upsert(
    {
      form_id: formId,
      student_id: subjectId,
      parent_id: user.id,
      respondent_id: user.id,
      studio_id: studioId,
      data: cleanData,
      signed_at: now,
      signature: signature?.value ?? null,
      signature_type: signature?.type ?? null,
      signature_name: signature?.name ?? null,
      signature_ip: clientIp(headerList),
      signature_user_agent: headerList.get("user-agent")?.slice(0, 400) ?? null,
      updated_at: now,
    },
    { onConflict: "form_id,student_id" },
  );

  if (error) return { ok: false, error: error.message };

  revalidatePath("/portal/forms");
  revalidatePath("/portal/parent/forms");
  revalidatePath("/portal/admin/forms");
  return { ok: true };
}
