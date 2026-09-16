// ============================================================================
//  /portal layout — resolves the session and wraps every portal route in the
//  shared PortalShell (sidebar nav + studio identity). Runs server-side on
//  every navigation that lands under /portal/*.
//  Auth + role are also enforced by middleware; this is a presentation layer.
// ============================================================================

import { MessageScope } from "@/components/i18n/MessageScope";
import { getMessages } from "next-intl/server";
import { redirect } from "next/navigation";
import { getPortalMemberships } from "@/lib/portal/session";
import { getPortalIdentity } from "@/lib/portal/identity";
import { PortalShell } from "@/components/portal/PortalShell";
import { PlatformAnnouncementsBanner } from "@/components/admin/PlatformAnnouncementsBanner";
import { SetupResumeBanner } from "@/components/setup/SetupResumeBanner";
import { TrialBanner } from "@/components/plans/TrialBanner";
import { getBrandingCached } from "@/lib/branding";
import { getEntitlementsCached } from "@/lib/portal/entitlements";
import {
  buildAdminNav,
  buildOfficeNav,
  buildPortalNav,
  buildSelfManagedStudentNav,
} from "@/lib/portal/nav-config";
import { resolvePortalTheme } from "@/lib/portal/resolve-portal-theme";
import { fetchStudioSetupState, setupBlocksPortal, setupNeedsBanner } from "@/lib/setup/server";
import { loadStudioSubscription, planAccessFor } from "@/lib/plans/server";
import { isLocked, needsTrialBanner } from "@/lib/plans/gate";
import { isBillingRole } from "@/lib/plans/roles";
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
  const { supabase, user, profile } = await getPortalIdentity();
  if (!user) redirect("/login");

  if (!profile?.studio_id) redirect("/onboarding");

  const studioId = resolveEffectiveStudioId(profile);
  if (!studioId) redirect("/onboarding");

  const accountKind = (profile.account_kind as AccountKind | null) ?? null;
  const now = new Date().toISOString();

  const [
    memberships,
    activeStudioRes,
    setupResult,
    announcementsResult,
    branding,
    entitlements,
    tCommon,
    portalTheme,
    subscription,
  ] = await Promise.all([
    getPortalMemberships(),
    supabase.from("studios").select("name, kind, status").eq("id", studioId).single(),
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
    getEntitlementsCached(studioId),
    getTranslations("common"),
    resolvePortalTheme(),
    // Only the people who can do something about a lapsed bill pay the cost of
    // reading it. Teachers, parents and students skip the query entirely.
    isBillingRole(profile.role as Role)
      ? loadStudioSubscription(supabase, studioId)
      : Promise.resolve(null),
  ]);

  const studio = activeStudioRes.data as { name: string; kind: string; status: string } | null;
  const isStudioOwner =
    accountKind === "studio_owner" || (accountKind === null && studio?.kind !== "instructor");
  const isAdmin = profile.role === "admin" && isStudioOwner;

  const setupState = setupResult.state;
  if (isAdmin && setupState && setupBlocksPortal(setupState)) {
    redirect("/setup");
  }

  // ── Paywall ───────────────────────────────────────────────────────────────
  // Admin and office only, by design: a lapsed Olune bill is between Olune and
  // the studio owner, and taking a parent's enrolment or a teacher's register
  // offline over it would make Olune the villain in someone else's
  // relationship. /plan/locked lives outside this layout, which is the only
  // thing keeping this from being a redirect loop — same reason /setup does.
  const planAccess = planAccessFor(subscription, studio?.status ?? null);
  if (isBillingRole(profile.role as Role) && isLocked(planAccess)) {
    redirect("/plan/locked");
  }

  const announcements = (announcementsResult.data ?? [])
    .filter((a) => !a.expires_at || a.expires_at > now)
    .slice(0, 3)
    .map(({ id, title, body, severity }) => ({ id, title, body, severity }));

  const displayName =
    accountKind === "instructor" && studio?.kind === "instructor"
      ? (profile.full_name ?? studio?.name ?? tCommon("yourStudio"))
      : (studio?.name ?? tCommon("yourStudio"));

  // Nav is filtered server-side so a module the studio does not have never
  // reaches the client. This is presentation only — requireModule()/
  // assertModule() on the pages and server actions do the enforcing.
  const role = profile.role as Role;
  const selfManagedStudent = role === "student" && !!profile.self_managed;
  const roleNav =
    role === "admin"
      ? undefined
      : role === "student" && selfManagedStudent
        ? buildSelfManagedStudentNav(entitlements)
        : buildPortalNav(role, entitlements);

  const messages = await getMessages();
  return (
    <MessageScope messages={{ admin: messages.admin }}>
    <PortalShell
      role={role}
      studioName={displayName}
      logoUrl={branding.logoUrl}
      userName={profile.full_name}
      showAffiliations={showAffiliationsNav(accountKind, memberships.filter(m => m.status === "active").length)}
      selfManagedStudent={selfManagedStudent}
      portalTheme={portalTheme}
      adminNav={buildAdminNav(entitlements)}
      officeNav={buildOfficeNav(entitlements)}
      roleNav={roleNav}
    >
      {needsTrialBanner(planAccess) && (
        <TrialBanner daysLeft={planAccess.daysLeft} urgent={planAccess.state === "trial_ending"} />
      )}
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
    </MessageScope>
  );
}
