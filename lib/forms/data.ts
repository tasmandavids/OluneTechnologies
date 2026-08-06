// ============================================================================
//  Studio forms — server-side data access.
//
//  Two readers live here:
//
//    loadStudioForms  — the admin view. Every form in the studio with its
//                       audience and a resolved recipient/signed count, so the
//                       builder can say "17 of 24 signed" without the client
//                       doing any of the fan-out.
//
//    loadAssignedForms — the signing view. The forms that have landed on the
//                        signed-in user, each with the subjects they are
//                        responsible for. RLS already restricts which forms
//                        come back; this narrows *which of my people* each one
//                        is actually about (a form aimed at one class must not
//                        show up against a sibling who isn't in it).
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Role } from "@/lib/types";
import { audienceCoversSubject } from "./audience";
import {
  parseFormFields,
  type AssignedForm,
  type FormAudienceTarget,
  type FormResponseRecord,
  type FormSubject,
  type FormSubjectScope,
  type FormType,
  type StudioForm,
} from "./types";

type FormRow = {
  id: string;
  title: string;
  description: string | null;
  body: string | null;
  form_type: string;
  fields: unknown;
  is_required: boolean;
  due_date: string | null;
  signature_required: boolean;
  signature_statement: string | null;
  subject_scope: string;
  active: boolean;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

type AssignmentRow = {
  id: string;
  form_id: string;
  kind: string;
  role: string | null;
  class_id: string | null;
  profile_id: string | null;
};

const FORM_COLUMNS =
  "id, title, description, body, form_type, fields, is_required, due_date, " +
  "signature_required, signature_statement, subject_scope, active, published_at, created_at, updated_at";

const RESPONSE_COLUMNS =
  "form_id, student_id, data, signed_at, signature, signature_type, signature_name, respondent_id";

function toTarget(row: AssignmentRow): FormAudienceTarget | null {
  if (row.kind === "all") return { kind: "all" };
  if (row.kind === "role" && row.role) return { kind: "role", role: row.role as Role };
  if (row.kind === "class" && row.class_id) return { kind: "class", classId: row.class_id };
  if (row.kind === "person" && row.profile_id) return { kind: "person", profileId: row.profile_id };
  return null;
}

function toForm(row: FormRow, audience: FormAudienceTarget[]): StudioForm {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    body: row.body,
    formType: row.form_type as FormType,
    fields: parseFormFields(row.fields),
    isRequired: row.is_required,
    dueDate: row.due_date,
    signatureRequired: row.signature_required,
    signatureStatement: row.signature_statement,
    subjectScope: (row.subject_scope === "person" ? "person" : "student") as FormSubjectScope,
    active: row.active,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    audience,
  };
}

function toResponse(row: Record<string, unknown>): FormResponseRecord {
  const sigType = row.signature_type;
  return {
    formId: row.form_id as string,
    subjectId: row.student_id as string,
    data: (row.data as Record<string, unknown>) ?? {},
    signedAt: (row.signed_at as string | null) ?? null,
    signature: (row.signature as string | null) ?? null,
    signatureType: sigType === "drawn" || sigType === "typed" ? sigType : null,
    signatureName: (row.signature_name as string | null) ?? null,
    respondentId: (row.respondent_id as string | null) ?? null,
  };
}

// ─── Admin view ─────────────────────────────────────────────────────────────

export type FormRecipient = {
  subjectId: string;
  subjectName: string | null;
  /** Guardians who can sign for this subject. Empty for person-scope forms. */
  signerIds: string[];
};

export type AdminFormSummary = StudioForm & {
  recipientCount: number;
  signedCount: number;
};

export type StudioFormsSnapshot = {
  forms: AdminFormSummary[];
  classes: { id: string; name: string; discipline: string | null }[];
  people: { id: string; name: string | null; email: string | null; role: Role }[];
};

/**
 * Everything needed to turn audiences into people, fetched once and reused.
 * Resolving per-form would be an N+1 across the whole forms list.
 */
type AudienceContext = {
  profiles: Map<string, { name: string | null; role: Role }>;
  rosterByClass: Map<string, Set<string>>;
  guardiansBySubject: Map<string, string[]>;
};

async function loadAudienceContext(
  supabase: SupabaseClient,
  studioId: string,
  classIds: string[],
): Promise<AudienceContext> {
  const [profilesRes, rosterRes, guardianRes] = await Promise.all([
    supabase.from("profiles").select("id, full_name, role").eq("studio_id", studioId),
    classIds.length
      ? supabase
          .from("enrollments")
          .select("student_id, class_id")
          .eq("studio_id", studioId)
          .eq("status", "active")
          .in("class_id", classIds)
      : Promise.resolve({ data: [] as { student_id: string; class_id: string }[] }),
    supabase.from("guardianships").select("guardian_id, student_id").eq("studio_id", studioId),
  ]);

  const profiles = new Map<string, { name: string | null; role: Role }>();
  for (const row of profilesRes.data ?? []) {
    profiles.set(row.id as string, {
      name: (row.full_name as string | null) ?? null,
      role: row.role as Role,
    });
  }

  const rosterByClass = new Map<string, Set<string>>();
  for (const row of (rosterRes.data ?? []) as { student_id: string; class_id: string }[]) {
    const set = rosterByClass.get(row.class_id) ?? new Set<string>();
    set.add(row.student_id);
    rosterByClass.set(row.class_id, set);
  }

  const guardiansBySubject = new Map<string, string[]>();
  for (const row of guardianRes.data ?? []) {
    const studentId = row.student_id as string;
    const list = guardiansBySubject.get(studentId) ?? [];
    list.push(row.guardian_id as string);
    guardiansBySubject.set(studentId, list);
  }

  return { profiles, rosterByClass, guardiansBySubject };
}

/**
 * Expand one form's audience into the concrete subjects it is about.
 *
 * Class and person targets are walked directly (cheaper than scanning every
 * profile), and the role/all targets fall through to the same predicate the
 * signing side uses, so the two views agree by construction.
 */
function expandAudience(
  audience: FormAudienceTarget[],
  subjectScope: FormSubjectScope,
  ctx: AudienceContext,
): FormRecipient[] {
  if (audience.length === 0) return [];

  const subjectIds = new Set<string>();
  const broad = audience.filter((t) => t.kind === "all" || t.kind === "role");

  for (const target of audience) {
    if (target.kind === "person") subjectIds.add(target.profileId);
    else if (target.kind === "class") {
      for (const id of ctx.rosterByClass.get(target.classId) ?? []) subjectIds.add(id);
    }
  }

  if (broad.length > 0) {
    for (const [id, profile] of ctx.profiles) {
      if (subjectIds.has(id)) continue;
      const covered = audienceCoversSubject(
        broad,
        { profileId: id, role: profile.role, classIds: new Set() },
        subjectScope,
      );
      if (covered) subjectIds.add(id);
    }
  }

  // A profile that has left the studio since it was assigned is dropped rather
  // than counted as an unsigned recipient forever.
  return [...subjectIds]
    .filter((id) => ctx.profiles.has(id))
    .map((id) => ({
      subjectId: id,
      subjectName: ctx.profiles.get(id)?.name ?? null,
      signerIds: subjectScope === "student" ? (ctx.guardiansBySubject.get(id) ?? []) : [],
    }));
}

/** Expand a single form's audience, fetching its own context. */
export async function resolveRecipients(
  supabase: SupabaseClient,
  studioId: string,
  audience: FormAudienceTarget[],
  subjectScope: FormSubjectScope,
): Promise<FormRecipient[]> {
  if (audience.length === 0) return [];
  const classIds = audience.flatMap((a) => (a.kind === "class" ? [a.classId] : []));
  const ctx = await loadAudienceContext(supabase, studioId, classIds);
  return expandAudience(audience, subjectScope, ctx);
}

/** Every form in the studio, newest first, with audience and progress. */
export async function loadStudioForms(
  supabase: SupabaseClient,
  studioId: string,
): Promise<StudioFormsSnapshot> {
  const [formsRes, classesRes, peopleRes] = await Promise.all([
    supabase
      .from("student_forms")
      .select(FORM_COLUMNS)
      .eq("studio_id", studioId)
      .order("created_at", { ascending: false }),
    supabase
      .from("classes")
      .select("id, name, discipline")
      .eq("studio_id", studioId)
      .order("name"),
    supabase
      .from("profiles")
      .select("id, full_name, email, role")
      .eq("studio_id", studioId)
      .order("full_name"),
  ]);

  const rows = (formsRes.data ?? []) as unknown as FormRow[];
  const formIds = rows.map((r) => r.id);

  const [assignmentsRes, responsesRes] = await Promise.all([
    formIds.length
      ? supabase
          .from("form_assignments")
          .select("id, form_id, kind, role, class_id, profile_id")
          .in("form_id", formIds)
      : Promise.resolve({ data: [] as AssignmentRow[] }),
    formIds.length
      ? supabase
          .from("form_responses")
          .select("form_id, student_id, signed_at")
          .eq("studio_id", studioId)
          .in("form_id", formIds)
      : Promise.resolve({ data: [] as { form_id: string; student_id: string; signed_at: string | null }[] }),
  ]);

  const byForm = new Map<string, FormAudienceTarget[]>();
  for (const row of (assignmentsRes.data ?? []) as unknown as AssignmentRow[]) {
    const target = toTarget(row);
    if (!target) continue;
    const list = byForm.get(row.form_id) ?? [];
    list.push(target);
    byForm.set(row.form_id, list);
  }

  const signedByForm = new Map<string, Set<string>>();
  for (const row of (responsesRes.data ?? []) as { form_id: string; student_id: string; signed_at: string | null }[]) {
    if (!row.signed_at) continue;
    const set = signedByForm.get(row.form_id) ?? new Set<string>();
    set.add(row.student_id);
    signedByForm.set(row.form_id, set);
  }

  const referencedClassIds = [
    ...new Set(
      [...byForm.values()].flat().flatMap((t) => (t.kind === "class" ? [t.classId] : [])),
    ),
  ];
  const ctx = await loadAudienceContext(supabase, studioId, referencedClassIds);

  const forms: AdminFormSummary[] = [];
  for (const row of rows) {
    const form = toForm(row, byForm.get(row.id) ?? []);
    const recipients = expandAudience(form.audience, form.subjectScope, ctx);
    const recipientIds = new Set(recipients.map((r) => r.subjectId));
    const signed = signedByForm.get(form.id) ?? new Set<string>();
    forms.push({
      ...form,
      recipientCount: recipients.length,
      // Only count signatures from people still in the audience, so narrowing
      // a form's audience can't push it past 100%.
      signedCount: [...signed].filter((id) => recipientIds.has(id)).length,
    });
  }

  return {
    forms,
    classes: (classesRes.data ?? []).map((c) => ({
      id: c.id as string,
      name: c.name as string,
      discipline: (c.discipline as string | null) ?? null,
    })),
    people: (peopleRes.data ?? []).map((p) => ({
      id: p.id as string,
      name: (p.full_name as string | null) ?? null,
      email: (p.email as string | null) ?? null,
      role: p.role as Role,
    })),
  };
}

/** Per-subject completion for one form — the admin "who's signed" table. */
export async function loadFormResponses(
  supabase: SupabaseClient,
  studioId: string,
  formId: string,
): Promise<{ recipients: FormRecipient[]; responses: FormResponseRecord[] } | null> {
  const { data: formRow } = await supabase
    .from("student_forms")
    .select(FORM_COLUMNS)
    .eq("studio_id", studioId)
    .eq("id", formId)
    .maybeSingle();

  if (!formRow) return null;

  const { data: assignmentRows } = await supabase
    .from("form_assignments")
    .select("id, form_id, kind, role, class_id, profile_id")
    .eq("form_id", formId);

  const audience = ((assignmentRows ?? []) as unknown as AssignmentRow[])
    .map(toTarget)
    .filter((t): t is FormAudienceTarget => t !== null);

  const form = toForm(formRow as unknown as FormRow, audience);

  const [recipients, responsesRes] = await Promise.all([
    resolveRecipients(supabase, studioId, audience, form.subjectScope),
    supabase
      .from("form_responses")
      .select(RESPONSE_COLUMNS)
      .eq("studio_id", studioId)
      .eq("form_id", formId),
  ]);

  return {
    recipients,
    responses: (responsesRes.data ?? []).map((r) => toResponse(r as Record<string, unknown>)),
  };
}

// ─── Signing view ───────────────────────────────────────────────────────────

/**
 * The forms waiting on the signed-in user, and who each one is about.
 *
 * RLS on student_forms already answers "may I see this form at all"; the work
 * here is the second half — of the people I'm responsible for, which ones does
 * this particular form actually cover.
 */
export async function loadAssignedForms(
  supabase: SupabaseClient,
  userId: string,
  studioId: string,
  role: Role,
  selfName: string | null,
): Promise<{ forms: AssignedForm[]; responses: FormResponseRecord[] }> {
  const { data: formRows } = await supabase
    .from("student_forms")
    .select(FORM_COLUMNS)
    .eq("studio_id", studioId)
    .eq("active", true)
    .not("published_at", "is", null)
    .order("created_at", { ascending: false });

  const rows = (formRows ?? []) as unknown as FormRow[];
  if (rows.length === 0) return { forms: [], responses: [] };

  const formIds = rows.map((r) => r.id);

  const [assignmentsRes, guardianshipsRes] = await Promise.all([
    supabase
      .from("form_assignments")
      .select("id, form_id, kind, role, class_id, profile_id")
      .in("form_id", formIds),
    supabase
      .from("guardianships")
      .select("student_id, profiles!student_id ( full_name )")
      .eq("guardian_id", userId),
  ]);

  const children = (guardianshipsRes.data ?? []).map((g) => ({
    profileId: g.student_id as string,
    name: (g.profiles as unknown as { full_name: string | null } | null)?.full_name ?? null,
  }));

  // Classes I'm in (as a student) and classes my children are in.
  const enrolmentSubjects = [userId, ...children.map((c) => c.profileId)];
  const { data: enrolmentRows } = await supabase
    .from("enrollments")
    .select("student_id, class_id")
    .eq("status", "active")
    .in("student_id", enrolmentSubjects);

  const classesBySubject = new Map<string, Set<string>>();
  for (const row of enrolmentRows ?? []) {
    const subject = row.student_id as string;
    const set = classesBySubject.get(subject) ?? new Set<string>();
    set.add(row.class_id as string);
    classesBySubject.set(subject, set);
  }

  const assignmentsByForm = new Map<string, AssignmentRow[]>();
  for (const row of (assignmentsRes.data ?? []) as unknown as AssignmentRow[]) {
    const list = assignmentsByForm.get(row.form_id) ?? [];
    list.push(row);
    assignmentsByForm.set(row.form_id, list);
  }

  const self: FormSubject = { profileId: userId, name: selfName, isSelf: true };
  const childSubjects: FormSubject[] = children.map((c) => ({
    profileId: c.profileId,
    name: c.name,
    isSelf: false,
  }));

  const forms: AssignedForm[] = [];
  for (const row of rows) {
    const assignments = assignmentsByForm.get(row.id) ?? [];
    if (assignments.length === 0) continue;

    const audience = assignments.map(toTarget).filter((t): t is FormAudienceTarget => t !== null);
    const form = toForm(row, audience);

    // The audience names subjects directly, so matching mirrors expandAudience
    // exactly: whoever the audience picks out, I answer for if they are me or
    // one of my children. Guardianship rows only ever point at students, so a
    // child's effective role is always "student".
    const candidates: FormSubject[] = [self, ...childSubjects];

    const subjects = candidates.filter((subject) =>
      audienceCoversSubject(
        audience,
        {
          profileId: subject.profileId,
          role: subject.isSelf ? role : "student",
          classIds: classesBySubject.get(subject.profileId) ?? new Set<string>(),
        },
        form.subjectScope,
      ),
    );

    if (subjects.length > 0) forms.push({ form, subjects });
  }

  if (forms.length === 0) return { forms: [], responses: [] };

  const subjectIds = [...new Set(forms.flatMap((f) => f.subjects.map((s) => s.profileId)))];
  const { data: responseRows } = await supabase
    .from("form_responses")
    .select(RESPONSE_COLUMNS)
    .in("form_id", forms.map((f) => f.form.id))
    .in("student_id", subjectIds);

  return {
    forms,
    responses: (responseRows ?? []).map((r) => toResponse(r as Record<string, unknown>)),
  };
}
