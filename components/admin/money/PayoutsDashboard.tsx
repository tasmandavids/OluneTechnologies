"use client";

import { useState, useTransition } from "react";
import { motion } from "framer-motion";
import type { StripeBalanceSummary, StripeConnectAccountRow, StripePayoutRow } from "@/lib/stripe/connect";
import { getStripeExpressLoginLink } from "@/app/portal/admin/payments/actions";
import { formatMoney } from "@/lib/currency";

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  paid: { bg: "rgba(22,163,74,.12)", text: "#16803c", label: "Paid" },
  pending: { bg: "rgba(107,102,201,.12)", text: "#3d3a8a", label: "Pending" },
  in_transit: { bg: "rgba(107,102,201,.12)", text: "#3d3a8a", label: "In transit" },
  canceled: { bg: "var(--base)", text: "var(--muted)", label: "Cancelled" },
  failed: { bg: "rgba(220,38,38,.11)", text: "#b91c1c", label: "Failed" },
};

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[--hair] bg-surface p-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted">{label}</p>
      <p
        className="mt-1 tabular-nums tracking-tight text-ink"
        style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: "1.9rem" }}
      >
        {value}
      </p>
    </div>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-NZ", { day: "numeric", month: "short" });
}

function DashboardLinkButton() {
  const [opening, startOpen] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={opening}
        onClick={() => {
          setError(null);
          startOpen(async () => {
            const res = await getStripeExpressLoginLink();
            if (!res.ok) setError(res.error);
            else window.open(res.url, "_blank", "noopener,noreferrer");
          });
        }}
        className="rounded-xl border border-[--hair] bg-surface px-4 py-2.5 text-sm font-semibold text-ink hover:bg-base disabled:opacity-50"
      >
        {opening ? "Opening…" : "View Stripe dashboard"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}

export function PayoutsDashboard({
  account,
  balance,
  payouts,
  fetchError,
  bannerError,
  bannerConnected,
  bannerIncomplete,
}: {
  account: StripeConnectAccountRow | null;
  balance: StripeBalanceSummary | null;
  payouts: StripePayoutRow[];
  fetchError: string | null;
  bannerError: string | null;
  bannerConnected: boolean;
  bannerIncomplete: boolean;
}) {
  const chargeable = account?.charges_enabled === true;
  const displayError = bannerError ?? fetchError;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto max-w-6xl space-y-6 p-6"
    >
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1
            className="text-2xl font-black tracking-tight text-ink"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Payouts
          </h1>
          <p className="mt-1 text-sm text-muted">
            Money moving from Stripe to this studio&apos;s own bank account.
          </p>
        </div>
        {chargeable && <DashboardLinkButton />}
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

      {!account && (
        <div className="rounded-2xl border border-dashed border-[--hair] bg-base/50 p-10 text-center">
          <p className="text-sm font-semibold text-ink">Stripe isn&apos;t connected yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
            Connect this studio&apos;s own Stripe account to start receiving payments — and see
            balance and payout history here.
          </p>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- redirects to Stripe's hosted onboarding */}
          <a
            href="/api/stripe/connect"
            className="mt-5 inline-block rounded-xl bg-ink px-4 py-2.5 text-sm font-bold text-paper hover:opacity-90"
          >
            Connect with Stripe
          </a>
        </div>
      )}

      {account && !chargeable && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
          <p className="text-sm font-semibold text-amber-900">Onboarding incomplete</p>
          <p className="mt-1 text-sm text-amber-900/80">
            {account.disabled_reason
              ? `Stripe needs more information before payouts can start (${account.disabled_reason}).`
              : "Finish Stripe onboarding to start receiving payments and payouts."}
          </p>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- redirects to Stripe's hosted onboarding */}
          <a
            href="/api/stripe/connect"
            className="mt-4 inline-block rounded-xl bg-ink px-4 py-2.5 text-sm font-bold text-paper hover:opacity-90"
          >
            Resume Stripe setup
          </a>
        </div>
      )}

      {displayError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {displayError}
        </div>
      )}

      {chargeable && balance && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <StatCard label="Available now" value={formatMoney(balance.availableCents)} />
            <StatCard label="Pending" value={formatMoney(balance.pendingCents)} />
          </div>

          <div className="overflow-hidden rounded-2xl border border-[--hair] bg-surface">
            <div className="border-b border-[--hair] px-6 py-4">
              <h2 className="text-sm font-bold text-ink">Recent payouts</h2>
            </div>
            {payouts.length === 0 ? (
              <p className="px-6 py-10 text-center text-sm text-muted">No payouts yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="border-b border-[--hair]">
                      {["Date", "Arrives", "Method", "Status", "Amount"].map((h) => (
                        <th
                          key={h}
                          className="px-4 py-3 text-left text-[0.62rem] font-semibold uppercase tracking-wider text-muted"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {payouts.map((p) => {
                      const s = STATUS_STYLES[p.status] ?? {
                        bg: "var(--base)",
                        text: "var(--muted)",
                        label: p.status,
                      };
                      return (
                        <tr key={p.id} className="border-b border-[--hair] last:border-0">
                          <td className="px-4 py-3 text-muted">{formatDate(p.createdAt)}</td>
                          <td className="px-4 py-3 text-muted">{formatDate(p.arrivalDate)}</td>
                          <td className="px-4 py-3 text-muted capitalize">{p.method}</td>
                          <td className="px-4 py-3">
                            <span
                              className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[0.62rem] font-semibold uppercase tracking-wider"
                              style={{ background: s.bg, color: s.text }}
                            >
                              {s.label}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right font-semibold tabular-nums text-ink">
                            {formatMoney(p.amountCents)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </motion.div>
  );
}
