// ============================================================================
//  /portal layout — resolves the session and wraps every portal route in the
//  shared PortalShell (sidebar nav + studio identity). Runs server-side on
//  every navigation that lands under /portal/*.
//  Auth + role are also enforced by middleware; this is a presentation layer.
// ============================================================================

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PortalShell } from "@/components/portal/PortalShell";
import { PlatformAnnouncementsBanner } from "@/components/admin/PlatformAnnouncementsBanner";
import { SetupResumeBanner } from "@/components/setup/SetupResumeBanner";
import { getBrandingCached } from "@/lib/branding";
import { resolvePortalTheme } from "@/lib/portal/resolve-portal-theme";
import { fetchStudioSetupState, setupBlocksPortal, setupNeedsBanner } from "@/lib/setup/server";
import { showAffiliationsNav } from "@/lib/account/memberships";
import { resolveEffectiveStudioId } from "@/lib/portal/access";
import type { AccountKind } from "@/lib/account/kinds";
import type { Role } from "@/lib/types";
import { getTranslations } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name, studio_id, active_studio_id, account_kind, self_managed")
    .eq("id", user.id)
    .single();

  if (!profile?.studio_id) redirect("/onboarding");

  const studioId = resolveEffectiveStudioId(profile);
  if (!studioId) redirect("/onboarding");

  const accountKind = (profile.account_kind as AccountKind | null) ?? null;
  const now = new Date().toISOString();

  const [{ count: membershipCount }, activeStudioRes, setupResult, announcementsResult, branding, tCommon, portalTheme] =
    await Promise.all([
    supabase
      .from("studio_memberships")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("status", "active"),
    supabase.from("studios").select("name, kind").eq("id", studioId).single(),
    profile.role === "admin"
      ? fetchStudioSetupState(supabase, studioId)
      : Promise.resolve({ state: null }),
    profile.role === "admin"
      ? supabase
          .from("platform_announcements")
          .select("id, title, body, severity, expires_at")
          .not("published_at", "is", null)
          .lte("published_at", now)
          .order("published_at", { ascending: false })
          .limit(10)
      : Promise.resolve({ data: null }),
    getBrandingCached(studioId),
    getTranslations("common"),
    resolvePortalTheme(),
  ]);

  const studio = activeStudioRes.data as { name: string; kind: string } | null;
  const isStudioOwner =
    accountKind === "studio_owner" || (accountKind === null && studio?.kind !== "instructor");
  const isAdmin = profile.role === "admin" && isStudioOwner;

  const setupState = setupResult.state;
  if (isAdmin && setupState && setupBlocksPortal(setupState)) {
    redirect("/setup");
  }

  const announcements = (announcementsResult.data ?? [])
    .filter((a) => !a.expires_at || a.expires_at > now)
    .slice(0, 3)
    .map(({ id, title, body, severity }) => ({ id, title, body, severity }));

  const displayName =
    accountKind === "instructor" && studio?.kind === "instructor"
      ? (profile.full_name ?? studio?.name ?? tCommon("yourStudio"))
      : (studio?.name ?? tCommon("yourStudio"));

  return (
    <PortalShell
      role={profile.role as Role}
      studioName={displayName}
      logoUrl={branding.logoUrl}
      userName={profile.full_name}
      showAffiliations={showAffiliationsNav(accountKind, membershipCount ?? 0)}
      selfManagedStudent={profile.role === "student" && !!profile.self_managed}
      portalTheme={portalTheme}
    >
      {isAdmin && setupState && setupNeedsBanner(setupState) && (
        <SetupResumeBanner
          setupStep={setupState.setupStep}
          snoozed={!!setupState.setupSnoozedAt}
        />
      )}
      {isAdmin && announcements.length > 0 && (
        <PlatformAnnouncementsBanner announcements={announcements} />
      )}
      {children}
    </PortalShell>
  );
}
