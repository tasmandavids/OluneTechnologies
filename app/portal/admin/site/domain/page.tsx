// ============================================================================
//  /portal/admin/site/domain — custom domain setup wizard.
// ============================================================================

import { createClient } from "@/lib/supabase/server";
import { DomainSetupWizard } from "@/components/admin/domain/DomainSetupWizard";
import { getTranslations } from "@/lib/i18n/server";

const ROOT = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "olune.app";

export default async function DomainSetupPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [tForbidden, tNotFound] = await Promise.all([
    getTranslations("errors.forbidden"),
    getTranslations("errors.notFound"),
  ]);

  const { data: profile } = await supabase
    .from("profiles")
    .select("studio_id, role")
    .eq("id", user!.id)
    .single();

  if (!profile?.studio_id || profile.role !== "admin") {
    return (
      <div className="p-6 text-sm text-muted">{tForbidden("adminOnly")}</div>
    );
  }

  const { data: studio } = await supabase
    .from("studios")
    .select("name, slug, custom_domain")
    .eq("id", profile.studio_id)
    .single();

  if (!studio) {
    return <div className="p-6 text-sm text-muted">{tNotFound("studio")}</div>;
  }

  return (
    <DomainSetupWizard
      studioName={studio.name as string}
      slug={studio.slug as string}
      customDomain={(studio.custom_domain as string | null) ?? null}
      rootDomain={ROOT}
    />
  );
}
