// ============================================================================
//  /portal/admin/plan — the studio's Olune subscription.
//
//  Reads through getAdminStudioForBilling() rather than getAdminStudio(): this
//  page has to stay reachable while past_due, because it is where a studio
//  fixes a failed card. Everything on it is read-only or a redirect to Stripe,
//  so bypassing the paywall here grants no capability the paywall protects.
// ============================================================================

import { redirect } from "next/navigation";
import { getAdminStudioForBilling } from "@/lib/portal/access";
import { getTranslations, getLocale } from "@/lib/i18n/server";
import { loadStudioSubscription, planAccessFor } from "@/lib/plans/server";
import { PlanPicker } from "@/components/plans/PlanPicker";
import { ManageBillingButton } from "@/components/plans/ManageBillingButton";
import { getPlan, planAmountCents } from "@/lib/plans/catalog";
import { formatMoney } from "@/lib/currency";

export const dynamic = "force-dynamic";

function formatDate(iso: string | null, locale: string): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  return new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(new Date(ms));
}

export default async function AdminPlanPage() {
  const access = await getAdminStudioForBilling();
  if (access.error || !access.studioId) redirect("/portal");

  const [studioRes, subscription, t, locale] = await Promise.all([
    access.supabase.from("studios").select("status").eq("id", access.studioId).single(),
    loadStudioSubscription(access.supabase, access.studioId),
    getTranslations("plan"),
    getLocale(),
  ]);

  const planAccess = planAccessFor(
    subscription,
    (studioRes.data?.status as string | null) ?? null,
  );
  const plan = getPlan(subscription?.planKey ?? null);
  const interval = subscription?.billingInterval ?? "month";
  const renewsOn = formatDate(subscription?.currentPeriodEnd ?? null, locale);
  const trialEnds = formatDate(subscription?.trialEndsAt ?? null, locale);
  const status = subscription?.status ?? "trialing";

  return (
    <div className="mx-auto w-full max-w-4xl px-5 py-8">
      <header className="mb-8">
        <h1 className="text-xl font-bold text-ink">{t("page.title")}</h1>
        <p className="mt-1 text-sm text-muted">{t("page.subtitle")}</p>
      </header>

      <section className="mb-10 rounded-2xl border border-[--hair] bg-surface p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              {t("current.heading")}
            </p>
            <p className="mt-2 text-lg font-bold text-ink">
              {t(`plans.${plan.key}.name`)}
              {subscription?.comped && (
                <span className="ml-2 rounded-full bg-brand/15 px-2 py-0.5 text-[10px] font-bold uppercase text-brand">
                  {t("current.comped")}
                </span>
              )}
            </p>
            {!subscription?.comped && (
              <p className="mt-1 text-sm text-muted">
                {formatMoney(planAmountCents(plan, interval), { maximumFractionDigits: 0 })}
                {interval === "year" ? t("perYear") : t("perMonth")}
              </p>
            )}
          </div>

          <div className="text-right">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              {t("current.status")}
            </p>
            <p className="mt-2 text-sm font-semibold text-ink">{t(`status.${status}`)}</p>
            {status === "trialing" && trialEnds && (
              <p className="mt-1 text-xs text-muted">
                {t("current.trialEnds", { date: trialEnds })}
                {planAccess.daysLeft !== null &&
                  ` · ${t("current.daysLeft", { days: planAccess.daysLeft })}`}
              </p>
            )}
            {status === "active" && renewsOn && (
              <p className="mt-1 text-xs text-muted">
                {subscription?.cancelAtPeriodEnd
                  ? t("current.endsOn", { date: renewsOn })
                  : t("current.renewsOn", { date: renewsOn })}
              </p>
            )}
          </div>
        </div>

        {subscription?.stripeCustomerId && (
          <div className="mt-6 border-t border-[--hair] pt-5">
            <p className="mb-3 text-xs text-muted">{t("current.portalHint")}</p>
            <ManageBillingButton variant="quiet" />
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-1 text-base font-bold text-ink">
          {status === "trialing" ? t("choose.trialHeading") : t("choose.changeHeading")}
        </h2>
        <p className="mb-6 text-sm text-muted">{t("choose.body")}</p>
        <PlanPicker
          currentPlan={status === "trialing" ? null : (subscription?.planKey ?? null)}
          defaultInterval={interval}
        />
      </section>
    </div>
  );
}
