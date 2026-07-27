import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";
import { fetchStudioSetupState } from "@/lib/setup/server";
import { portalHomeForAccount } from "@/lib/account/memberships";
import type { AccountKind } from "@/lib/account/kinds";
import type { Role } from "@/lib/types";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ vertical?: string }>;
}) {
  // /onboarding?vertical=gymnastics pre-selects and skips the picker. This is
  // what the /for/[vertical] marketing pages link to.
  const { vertical } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("studio_id, role, account_kind")
      .eq("id", user.id)
      .single();

    if (profile?.studio_id) {
      const accountKind = (profile.account_kind as AccountKind | null) ?? null;
      const role = profile.role as Role;

      if (accountKind === "instructor") {
        redirect("/portal/teacher");
      }

      // Only admins need to go through the setup flow. Students, parents, and
      // teachers should go directly to their portal home.
      if (role !== "admin") {
        redirect(portalHomeForAccount(accountKind, role));
      }

      const { state } = await fetchStudioSetupState(supabase, profile.studio_id);
      if (state?.setupCompletedAt) redirect("/portal/admin");
      if (state && !state.setupCompletedAt) redirect("/setup");
      redirect("/portal/admin");
    }
  }

  return (
    <OnboardingWizard
      signedIn={!!user}
      email={user?.email ?? ""}
      presetVertical={vertical ?? null}
    />
  );
}
