"use client";

import { useState, useTransition } from "react";
import { motion } from "framer-motion";
import type { StripeConnectAccountRow } from "@/lib/stripe/connect";
import { getStripeExpressLoginLink, refreshStripeConnectStatus } from "@/app/portal/admin/payments/actions";

export function PaymentsSettings({
  account,
  bannerError,
  bannerConnected,
  bannerIncomplete,
}: {
  account: StripeConnectAccountRow | null;
  bannerError: string | null;
  bannerConnected: boolean;
  bannerIncomplete: boolean;
}) {
  const [refreshing, startRefresh] = useTransition();
  const [openingDashboard, startOpenDashboard] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);

  const chargeable = account?.charges_enabled === true;

  const onRefresh = () => {
    setActionError(null);
    startRefresh(async () => {
      const res = await refreshStripeConnectStatus();
      if (!res.ok) setActionError(res.error);
    });
  };

  const onOpenDashboard = () => {
    setActionError(null);
    startOpenDashboard(async () => {
      const res = await getStripeExpressLoginLink();
      if (!res.ok) setActionError(res.error);
      else window.open(res.url, "_blank", "noopener,noreferrer");
    });
  };

  const displayError = bannerError ?? actionError;

  let statusLabel = "Not connected";
  let statusTone = "text-muted";
  if (account && chargeable) {
    statusLabel = "Active — payments settle to this studio's own Stripe account";
    statusTone = "text-emerald-700";
  } else if (account) {
    statusLabel = account.disabled_reason
      ? `Onboarding incomplete (${account.disabled_reason})`
      : "Onboarding incomplete — finish setup to start receiving payments";
    statusTone = "text-amber-700";
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto max-w-3xl space-y-6 p-6"
    >
      <header>
        <h1 className="text-2xl font-black tracking-tight text-ink">Payments</h1>
        <p className="mt-1 text-sm text-muted">
          Connect this studio&apos;s own Stripe account so parent payments settle directly to your
          bank instead of a shared platform account.
        </p>
      </header>

      {bannerConnected && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Stripe connected — new payments now go directly to this studio&apos;s account.
        </div>
      )}
      {bannerIncomplete && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Stripe onboarding isn&apos;t finished yet — you can resume it below.
        </div>
      )}
      {displayError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {displayError}
        </div>
      )}

      <div className="rounded-2xl border border-[--hair] bg-surface p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">Status</p>
        <p className={`mt-1 text-sm font-semibold ${statusTone}`}>{statusLabel}</p>

        <div className="mt-4 flex flex-wrap gap-2">
          <a
            href="/api/stripe/connect"
            className="rounded-xl bg-[--brand] px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90"
          >
            {account ? "Resume Stripe setup" : "Connect with Stripe"}
          </a>
          {account && (
            <>
              <button
                type="button"
                onClick={onRefresh}
                disabled={refreshing}
                className="rounded-xl border border-[--hair] bg-surface px-4 py-2.5 text-sm font-semibold text-ink hover:bg-base disabled:opacity-50"
              >
                {refreshing ? "Refreshing…" : "Refresh status"}
              </button>
              {chargeable && (
                <button
                  type="button"
                  onClick={onOpenDashboard}
                  disabled={openingDashboard}
                  className="rounded-xl border border-[--hair] bg-surface px-4 py-2.5 text-sm font-semibold text-ink hover:bg-base disabled:opacity-50"
                >
                  {openingDashboard ? "Opening…" : "View Stripe dashboard"}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
}
