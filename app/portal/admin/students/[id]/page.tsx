// ============================================================================
//  /portal/admin/students/[id] — Student detail.
//  Server component: fetches the student, their active enrollments, progress
//  history (with the logging instructor's name), schedule, badge catalogues,
//  check-in card, and completed medical/consent forms — then hands the lot to
//  StudentDetailHub, which splits it across the Progress/Schedule/Badges/
//  Information tabs.
// ============================================================================

import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import StudentDetailHub, {
  type StudentFormAnswer,
  type StudentFormField,
  type StudentGuardian,
  type StudentSummary,
} from "@/components/admin/students/StudentDetailHub";
import type { ProgressEntry } from "@/components/admin/students/ProgressTracker";
import type { CurrentCard, CardStatus } from "@/components/portal/admin/checkin/IssueCardButton";
import type { ScheduleEntry } from "@/lib/students/schedule-types";
import { getWeekRange } from "@/lib/staff/week";
import { fetchBadgeCatalogue, fetchProfileBadges } from "@/lib/portal/badges-data";
import { isAppleWalletConfigured } from "@/lib/apple-wallet/config";

export default async function StudentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [studentRes, progressRes, scheduleRes, cardRes, formsRes] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        `
        id, full_name, email, phone, studio_id,
        enrollments!student_id (
          status,
          classes ( id, name, day_of_week, start_time )
        ),
        guardianships!student_id (
          is_primary,
          guardian:profiles!guardian_id ( id, full_name )
        )
      `,
      )
      .eq("id", id)
      .single(),

    supabase
      .from("student_progress")
      .select(
        `
        id, notes, level, certifications, logged_at,
        instructor:profiles!instructor_id ( full_name )
      `,
      )
      .eq("student_id", id)
      .order("logged_at", { ascending: false }),

    supabase
      .from("student_schedule_entries")
      .select(
        "id, student_id, title, description, entry_date, start_time, end_time, entry_type, location_name, cancelled_at",
      )
      .eq("student_id", id)
      .order("entry_date")
      .order("start_time"),

    supabase
      .from("nfc_cards")
      .select("id, status")
      .eq("student_id", id)
      .neq("status", "revoked")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),

    supabase
      .from("form_responses")
      .select(
        `
        id, data, signed_at, updated_at,
        form:student_forms!form_id ( title, form_type, fields )
      `,
      )
      .eq("student_id", id)
      .order("updated_at", { ascending: false }),
  ]);

  if (studentRes.error || !studentRes.data) notFound();
  const p = studentRes.data;

  const classes = (
    (p.enrollments as unknown as {
      status: string;
      classes: { id: string; name: string; day_of_week: number; start_time: string | null } | null;
    }[]) ?? []
  )
    .filter((e) => e.status === "active" && e.classes)
    .map((e) => ({ id: e.classes!.id, name: e.classes!.name }));

  const guardianRows =
    (p.guardianships as unknown as {
      is_primary: boolean;
      guardian: { id: string; full_name: string | null } | null;
    }[]) ?? [];

  const guardians: StudentGuardian[] = guardianRows
    .filter((g) => g.guardian)
    .map((g) => ({
      id: g.guardian!.id,
      name: g.guardian!.full_name,
      isPrimary: g.is_primary,
    }));

  const student: StudentSummary = {
    id: p.id,
    name: p.full_name,
    email: p.email,
    phone: p.phone,
    classes,
    guardians,
  };

  const entries: ProgressEntry[] = (progressRes.data ?? []).map((row) => {
    const instructor = row.instructor as unknown as { full_name: string | null } | null;
    return {
      id: row.id as string,
      notes: (row.notes as string | null) ?? null,
      level: (row.level as string | null) ?? null,
      certifications: ((row.certifications as string[] | null) ?? []) as string[],
      loggedAt: row.logged_at as string,
      instructorName: instructor?.full_name ?? null,
    };
  });

  const scheduleEntries: ScheduleEntry[] = (scheduleRes.data ?? []).map((row) => ({
    id: row.id as string,
    studentId: row.student_id as string,
    title: row.title as string,
    description: (row.description as string | null) ?? null,
    entryDate: row.entry_date as string,
    startTime: (row.start_time as string | null)?.slice(0, 5) ?? null,
    endTime: (row.end_time as string | null)?.slice(0, 5) ?? null,
    entryType: row.entry_type as ScheduleEntry["entryType"],
    locationName: (row.location_name as string | null) ?? null,
    cancelledAt: (row.cancelled_at as string | null) ?? null,
  }));

  const forms: StudentFormAnswer[] = (formsRes.data ?? []).flatMap((row) => {
    const form = row.form as unknown as {
      title: string;
      form_type: string;
      fields: StudentFormField[] | null;
    } | null;
    if (!form) return [];
    return [
      {
        id: row.id as string,
        title: form.title,
        formType: form.form_type,
        fields: (form.fields ?? []).filter((f) => f && f.key),
        data: (row.data as Record<string, unknown> | null) ?? {},
        signedAt: (row.signed_at as string | null) ?? null,
      },
    ];
  });

  const weekStart = getWeekRange().weekStart;

  // ─── Badges: student catalogue + primary guardian's family catalogue ───
  const studioId = p.studio_id as string | null;
  const primaryGuardian =
    guardians.find((g) => g.isPrimary) ?? guardians[0] ?? null;

  const [studentCatalogue, studentEarned, familyCatalogue, familyEarned] = studioId
    ? await Promise.all([
        fetchBadgeCatalogue(supabase, studioId, "student"),
        fetchProfileBadges(supabase, p.id),
        primaryGuardian ? fetchBadgeCatalogue(supabase, studioId, "parent") : Promise.resolve([]),
        primaryGuardian ? fetchProfileBadges(supabase, primaryGuardian.id) : Promise.resolve([]),
      ])
    : [[], [], [], []];

  const currentCard: CurrentCard = cardRes.data
    ? { id: cardRes.data.id as string, status: cardRes.data.status as CardStatus }
    : null;

  return (
    <StudentDetailHub
      student={student}
      entries={entries}
      scheduleEntries={scheduleEntries}
      weekStart={weekStart}
      studentCatalogue={studioId ? studentCatalogue : []}
      studentEarnedIds={studentEarned.map((e) => e.badgeId)}
      familyRecipient={primaryGuardian}
      familyCatalogue={studioId ? familyCatalogue : []}
      familyEarnedIds={familyEarned.map((e) => e.badgeId)}
      currentCard={currentCard}
      appleWalletEnabled={isAppleWalletConfigured()}
      forms={forms}
    />
  );
}
