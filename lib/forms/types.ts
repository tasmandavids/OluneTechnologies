// ============================================================================
//  Studio forms — the shared shape between the admin builder, the signing
//  surface and the server actions.
//
//  A form is: some policy text, zero or more fields, an optional signature
//  block, and an audience. The audience is a union of targets (everyone / a
//  role / a class / a named person), and `subjectScope` decides what a single
//  response is *about*:
//
//    student — one response per student; a guardian signs for each of their
//              children (self-managed students sign their own).
//    person  — one response per person; whoever it lands on signs once.
// ============================================================================

import type { Role } from "@/lib/types";

export const FORM_FIELD_TYPES = [
  "text",
  "textarea",
  "checkbox",
  "select",
  "date",
  "phone",
  "email",
] as const;
export type FormFieldType = (typeof FORM_FIELD_TYPES)[number];

export type FormField = {
  key: string;
  label: string;
  type: FormFieldType;
  required?: boolean;
  options?: string[];
  placeholder?: string;
};

export const FORM_TYPES = [
  "policy",
  "handbook",
  "code_of_conduct",
  "waiver",
  "medical",
  "emergency_contact",
  "photo_consent",
  "video_consent",
  "pickup_permission",
  "general",
] as const;
export type FormType = (typeof FORM_TYPES)[number];

export const FORM_SUBJECT_SCOPES = ["student", "person"] as const;
export type FormSubjectScope = (typeof FORM_SUBJECT_SCOPES)[number];

/** Roles a form can be targeted at. Admins are included so a studio can send
 *  its own policies to its own office team. */
export const ASSIGNABLE_ROLES: Role[] = ["parent", "student", "teacher", "office", "admin"];

export type FormAudienceTarget =
  | { kind: "all" }
  | { kind: "role"; role: Role }
  | { kind: "class"; classId: string }
  | { kind: "person"; profileId: string };

export type StudioForm = {
  id: string;
  title: string;
  description: string | null;
  body: string | null;
  formType: FormType;
  fields: FormField[];
  isRequired: boolean;
  dueDate: string | null;
  signatureRequired: boolean;
  signatureStatement: string | null;
  subjectScope: FormSubjectScope;
  active: boolean;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  audience: FormAudienceTarget[];
};

/** Who a given response belongs to, from the signer's point of view. */
export type FormSubject = {
  profileId: string;
  name: string | null;
  /** True when the signed-in user *is* the subject (rather than a guardian). */
  isSelf: boolean;
};

export type FormSignature = {
  /** PNG data URL for a drawn signature, or the typed text for a typed one. */
  value: string;
  type: "drawn" | "typed";
  name: string;
};

export type FormResponseRecord = {
  formId: string;
  subjectId: string;
  data: Record<string, unknown>;
  signedAt: string | null;
  signature: string | null;
  signatureType: "drawn" | "typed" | null;
  signatureName: string | null;
  respondentId: string | null;
};

/** A form as it reaches somebody who has to fill it in. */
export type AssignedForm = {
  form: StudioForm;
  subjects: FormSubject[];
};

export function isFormFieldType(value: unknown): value is FormFieldType {
  return FORM_FIELD_TYPES.includes(value as FormFieldType);
}

/** Tolerant parse of the `fields` jsonb column — bad rows are dropped, not
 *  thrown on, because a malformed field must never take out the whole page. */
export function parseFormFields(raw: unknown): FormField[] {
  if (!Array.isArray(raw)) return [];
  const out: FormField[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const field = entry as Record<string, unknown>;
    const key = typeof field.key === "string" ? field.key : null;
    const label = typeof field.label === "string" ? field.label : null;
    if (!key || !label) continue;
    out.push({
      key,
      label,
      type: isFormFieldType(field.type) ? field.type : "text",
      required: field.required === true,
      options: Array.isArray(field.options)
        ? field.options.filter((o): o is string => typeof o === "string")
        : undefined,
      placeholder: typeof field.placeholder === "string" ? field.placeholder : undefined,
    });
  }
  return out;
}

/** Stable, collision-free key for a newly added builder field. */
export function fieldKeyFromLabel(label: string, taken: Set<string>): string {
  const base =
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "field";
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}_${n}`)) n += 1;
  return `${base}_${n}`;
}
