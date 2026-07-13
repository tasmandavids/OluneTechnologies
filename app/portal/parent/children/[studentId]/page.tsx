// ============================================================================
//  /portal/parent/children/[studentId] — Parent view of a child's progress.
// ============================================================================

import { notFound } from "next/navigation";
import { getTranslations } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import StudentProgressPanel from "@/components/portal/shared/StudentProgressPanel";
import { fetchStudentProgressBundle } from "@/lib/portal/student-progress-data";
import { fetchStudentBadgeBundle } from "@/lib/portal/badges-data";

export default async function ParentChildProgressPage({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const { studentId } = await params;
  const supabase = await createClient();
  const t = await getTranslations("portal.progress");
  const tParent = await getTranslations("parent.childProgress");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const { data: guardianship } = await supabase
    .from("guardianships")
    .select("id")
    .eq("guardian_id", user.id)
    .eq("student_id", studentId)
    .maybeSingle();

  if (!guardianship) notFound();

  const bundle = await fetchStudentProgressBundle(supabase, studentId);
  if (!bundle) notFound();

  const { data: childProfile } = await supabase
    .from("profiles")
    .select("studio_id")
    .eq("id", studentId)
    .single();
  const badges = childProfile?.studio_id
    ? await fetchStudentBadgeBundle(supabase, childProfile.studio_id, studentId)
    : null;

  return (
    <StudentProgressPanel
      bundle={bundle}
      badges={badges}
      backHref="/portal/parent"
      labels={{
        back: tParent("back"),
        unnamedStudent: tParent("unnamedDancer"),
        currentLevel: t("currentLevel"),
        emptyProgress: tParent("emptyProgress"),
      }}
    />
  );
}
