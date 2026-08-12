// ============================================================================
//  /plan/locked — the paywall.
//
//  Lives OUTSIDE /portal on purpose. The portal layout redirects here, so a
//  page inside that layout would redirect to itself forever. /setup solves the
//  same problem the same way.
//
//  It re-checks the gate rather than trusting the redirect: someone who lands
//  here with a working subscription (a stale tab, a back button, a link) should
//  be sent back to their portal, not shown a paywall they already paid.
// ============================================================================

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTranslations } from "@/lib/i18n/server";
import { OluneLogo } from "@/components/brand/OluneLogo";
import { PlanPicker } from "@/components/plans/PlanPicker";
import { ManageBillingButton } from "@/components/plans/ManageBillingButton";
import { loadStudioSubscription, planAccessFor } from "@/lib/plans/server";
import { isLocked } from "@/lib/plans/gate";
import { isBillingRole } from "@/lib/plans/roles";
import { resolveEffectiveStudioId } from "@/lib/portal/access";
import { portalHomeForAccount } from "@/lib/account/memberships";
import type { AccountKind } from "@/lib/account/kinds";
import type { Role } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function PlanLockedPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/plan/locked");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, studio_id, active_studio_id, account_kind")
    .eq("id", user.id)
    .single();

  const role = (profile?.role as Role | undefined) ?? null;
  const accountKind = (profile?.account_kind as AccountKind | null) ?? null;
  const studioId = profile ? resolveEffectiveStudioId(profile) : null;

  if (!studioId) redirect("/onboarding");

  // Nobody else should ever see this screen — a teacher who follows the link
  // is not locked out of anything and shouldn't be told they are.
  if (!isBillingRole(role)) redirect(portalHomeForAccount(accountKind, role ?? "parent"));

  const [studioRes, subscription, t] = await Promise.all([
    supabase.from("studios").select("name, status").eq("id", studioId).single(),
    loadStudioSubscription(supabase, studioId),
    getTranslations("plan"),
  ]);

  const studio = studioRes.data as { name: string; status: string } | null;
  const access = planAccessFor(subscription, studio?.status ?? null);

  if (!isLocked(access)) redirect("/portal/admin");

  // A suspended studio is an operator decision, not a billing one. Selling
  // them a plan would not unlock anything, so the page says so and stops.
  const suspended = access.reason === "suspended";
  const reasonKey = access.reason ?? "trial_expired";

  return (
    <main className="min-h-screen bg-base px-5 py-12 text-ink">
      <div className="mx-auto w-full max-w-4xl">
        <div className="mb-10 flex justify-center">
          <OluneLogo variant="stacked" size="md" />
        </div>

        <div className="mx-auto mb-10 max-w-xl text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand">
            {studio?.name ?? ""}
          </p>
          <h1 className="mt-3 text-2xl font-bold text-ink sm:text-3xl">
            {t(`locked.${reasonKey}.title`)}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            {t(`locked.${reasonKey}.body`)}
          </p>
          <p className="mt-4 text-xs text-muted">{t("locked.othersUnaffected")}</p>
        </div>

        {suspended ? (
          <div className="mx-auto max-w-md rounded-2xl border border-[--hair] bg-surface p-6 text-center">
            <p className="text-sm text-muted">{t("locked.contactSupport")}</p>
          </div>
        ) : (
          <>
            <PlanPicker
              currentPlan={subscription?.planKey ?? null}
              defaultInterval={subscription?.billingInterval ?? "month"}
            />
            {access.reason === "payment_failed" && subscription?.stripeCustomerId && (
              <div className="mt-8 text-center">
                <p className="mb-3 text-xs text-muted">{t("locked.payment_failed.orUpdateCard")}</p>
                <ManageBillingButton />
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
