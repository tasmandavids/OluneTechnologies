// ============================================================================
//  /portal/student/complete-profile — gate for self-managed adult students
//  who reached the dashboard (e.g. via OAuth signup) without a full name or
//  date of birth on file. Blocks access to /portal/student until both are set.
// ============================================================================

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CompleteProfileForm from "@/components/portal/student/CompleteProfileForm";

export const dynamic = "force-dynamic";

export default async function CompleteProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, self_managed, full_name, birthday")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "student" || !profile.self_managed) redirect("/portal/student");
  if (profile.full_name?.trim() && profile.birthday) redirect("/portal/student");

  return <CompleteProfileForm initialFullName={profile.full_name} />;
}
