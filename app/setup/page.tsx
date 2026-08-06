// app/setup/page.tsx
// Post-onboarding setup wizard. Admins land here after creating their studio
// until setup_completed_at is set (unless snoozed).

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SetupWizard } from "@/components/setup/SetupWizard";
import type { SetupStudio } from "@/app/setup/actions";
import { fetchStudioSetupState, fetchStudioTuitionSetup } from "@/lib/setup/server";
import { TOUR_FEATURES, type SetupStepId } from "@/lib/setup/constants";
import { getEntitlementsCached, hasModule } from "@/lib/portal/entitlements";

export default async function SetupPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?next=/setup");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, studio_id")
    .eq("id", user.id)
    .single();

  if (!profile?.studio_id) redirect("/onboarding");
  if (profile.role !== "admin") redirect("/portal");

  const { state, error } = await fetchStudioSetupState(supabase, profile.studio_id);

  if (!state) redirect("/onboarding");
  if (state.setupCompletedAt) redirect("/portal/admin");

  const [tuition, entitlements] = await Promise.all([
    fetchStudioTuitionSetup(supabase, profile.studio_id),
    getEntitlementsCached(profile.studio_id),
  ]);

  // Same gate the rail applies, so the tour never opens a door this studio's
  // pack doesn't have.
  const tourFeatures = TOUR_FEATURES.filter(
    (f) => !("module" in f) || hasModule(entitlements, f.module),
  ).map((f) => f.id);

  const initial: SetupStudio = {
    name: state.name,
    setupPath: state.setupPath,
    importSource: state.importSource,
    initialStep: (state.setupStep ?? "path") as SetupStepId,
    locationCity: state.locationCity,
    locationRegion: state.locationRegion,
    locationCountry: state.locationCountry,
    about: state.about,
    danceStyles: state.danceStyles,
    schemaReady: state.schemaReady,
    tuition,
    tourFeatures,
  };

  return <SetupWizard studio={initial} schemaError={error} />;
}
