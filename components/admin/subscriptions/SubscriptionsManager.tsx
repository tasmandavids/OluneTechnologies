"use client";
import { useTranslations } from "next-intl";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type {
  ClassOption,
  ParentOption,
  ProductOption,
  SubscriptionRow,
} from "@/app/portal/admin/subscriptions/page";
import { CreateSubscriptionModal } from "@/components/admin/subscriptions/CreateSubscriptionModal";
import { SubscriptionCancelActions } from "@/components/admin/subscriptions/SubscriptionCancelActions";
import { formatMoney } from "@/lib/currency";
import { intervalLabel, type BillingInterval } from "@/lib/subscriptions/pricing";
import { useLocale } from "next-intl";
import { formatDateMedium } from "@/lib/i18n/format";
import { GlassPanel } from "@/components/portal/admin/glass/GlassPanel";

const SUBSCRIPTION_STATUS_KEYS = [
  "active",
  "trialing",
  "past_due",
  "unpaid",
  "incomplete",
  "canceled",
] as const;

const STATUS_STYLES: Record<string, string> = {
  active: "bg-green-500/15 text-green-500",
  trialing: "bg-blue-500/15 text-blue-500",
  past_due: "bg-amber-500/15 text-amber-500",
  unpaid: "bg-amber-500/15 text-amber-500",
  incomplete: "bg-muted/15 text-muted",
  canceled: "bg-red-500/15 text-red-400",
};

function StatusBadge({ status, label }: { status: string; label: string }) {
  const style = STATUS_STYLES[status] ?? "bg-muted/15 text-muted";
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-[0.62rem] font-bold uppercase tracking-wider ${style}`}
    >
      {label}
    </span>
  );
}

function fmtDate(iso: string | null, locale: string) {
  if (!iso) return "—";
  return formatDateMedium(iso, locale);
}

function billingLabel(interval: string) {
  try {
    return intervalLabel(interval as BillingInterval);
  } catch {
    return interval;
  }
}

export default function SubscriptionsManager({
  subscriptions,
  parents,
  classes,
  products,
}: {
  subscriptions: SubscriptionRow[];
  parents: ParentOption[];
  classes: ClassOption[];
  products: ProductOption[];
}) {
  const t = useTranslations("admin.subscriptions");
  const tShared = useTranslations("admin.shared");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const [filter, setFilter] = useState<"all" | "active" | "canceled">("all");
  const [showCreate, setShowCreate] = useState(false);
  const [rows, setRows] = useState(subscriptions);
  const [error, setError] = useState<string | null>(null);

  const activeMrrCents = useMemo(
    () =>
      rows
        .filter((s) => s.status === "active" || s.status === "trialing")
        .reduce((sum, s) => sum + s.monthlyAmountCents, 0),
    [rows],
  );
  const activeCount = rows.filter(
    (s) => s.status === "active" || s.status === "trialing",
  ).length;

  const filtered = rows.filter((s) => {
    if (filter === "active") return s.status === "active" || s.status === "trialing";
    if (filter === "canceled") return s.status === "canceled";
    return true;
  });

  const markCanceled = (id: string, immediate: boolean) => {
    setRows((prev) =>
      prev.map((s) =>
        s.id === id
          ? {
              ...s,
              status: immediate ? "canceled" : s.status,
              cancelAtPeriodEnd: immediate ? false : true,
            }
          : s,
      ),
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto max-w-5xl space-y-6 p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-ink">{t("title")}</h1>
          <p className="text-sm text-muted">{t("subtitle")}</p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          disabled={parents.length === 0}
          className="rounded-xl bg-ink px-4 py-2 text-sm font-bold text-paper disabled:opacity-50"
        >
          {t("create")}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <GlassPanel className="!p-4">
          <p className="text-[0.62rem] font-semibold uppercase tracking-wider text-muted">
            {t("stats.activePlans")}
          </p>
          <p className="mt-1 text-2xl font-black tabular-nums text-ink">{activeCount}</p>
        </GlassPanel>
        <GlassPanel className="!p-4">
          <p className="text-[0.62rem] font-semibold uppercase tracking-wider text-muted">
            {t("stats.monthlyRecurring")}
          </p>
          <p className="mt-1 text-2xl font-black tabular-nums text-ink">
            {formatMoney(activeMrrCents)}
          </p>
        </GlassPanel>
        <GlassPanel className="!p-4">
          <p className="text-[0.62rem] font-semibold uppercase tracking-wider text-muted">{t("stats.total")}</p>
          <p className="mt-1 text-2xl font-black tabular-nums text-ink">{rows.length}</p>
        </GlassPanel>
      </div>

      <div className="flex gap-1.5">
        {(["all", "active", "canceled"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${
              filter === f ? "text-white" : "border border-[--hair] text-muted hover:text-ink"
            }`}
            style={filter === f ? { background: "var(--brand)" } : undefined}
          >
            {t(`filters.${f}`)}
          </button>
        ))}
      </div>

      {error && (
        <p className="rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-xs text-red-400">
          {error}
        </p>
      )}

      <GlassPanel className="!p-0 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm text-muted">{t("empty")}</p>
            {parents.length > 0 && (
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                className="mt-3 text-sm font-semibold text-ink underline"
              >
                {t("createFirst")}
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left">
              <thead>
                <tr className="border-b border-[--hair]">
                  {(
                    [
                      t("table.plan"),
                      t("table.payer"),
                      t("table.student"),
                      t("table.monthly"),
                      t("table.charge"),
                      t("table.status"),
                      t("table.nextCharge"),
                      "",
                    ] as const
                  ).map(
                    (h) => (
                      <th
                        key={h || "actions"}
                        className={`px-4 py-3 text-[0.62rem] font-semibold uppercase tracking-wider text-muted ${
                          !h ? "text-right" : ""
                        }`}
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                <AnimatePresence initial={false}>
                  {filtered.map((s) => {
                    return (
                      <tr
                        key={s.id}
                        className="border-b border-[--hair] transition-colors last:border-0 hover:bg-[color-mix(in_srgb,var(--brand)_3%,transparent)]"
                      >
                        <td className="px-4 py-3">
                          <p className="text-sm font-semibold text-ink">
                            {s.planLabel ?? s.className ?? t("defaultPlan")}
                          </p>
                          {s.adminCreated && (
                            <p className="text-[0.65rem] font-medium uppercase tracking-wider text-muted">
                              {tShared("adminPlan")}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-ink">{s.payerName ?? "—"}</td>
                        <td className="px-4 py-3 text-sm text-muted">{s.studentName ?? "—"}</td>
                        <td className="px-4 py-3 text-sm tabular-nums text-ink">
                          {formatMoney(s.monthlyAmountCents)}
                        </td>
                        <td className="px-4 py-3 text-sm tabular-nums text-ink">
                          {formatMoney(s.amountCents)}
                          <span className="block text-xs text-muted">
                            {billingLabel(s.billingInterval)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge
                            status={s.status}
                            label={
                              SUBSCRIPTION_STATUS_KEYS.includes(
                                s.status as (typeof SUBSCRIPTION_STATUS_KEYS)[number],
                              )
                                ? t(`status.${s.status}` as "status.active")
                                : s.status.replace("_", " ")
                            }
                          />
                          {s.cancelAtPeriodEnd && s.status !== "canceled" && (
                            <span className="ml-1.5 text-[0.6rem] text-amber-500">{tShared("ending")}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm tabular-nums text-muted">
                          {s.cancelAtPeriodEnd ? "—" : fmtDate(s.currentPeriodEnd, locale)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <SubscriptionCancelActions
                            subscription={s}
                            onCanceled={markCanceled}
                            align="end"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        )}
      </GlassPanel>

      {showCreate && (
        <CreateSubscriptionModal
          parents={parents}
          classes={classes}
          products={products}
          onClose={() => setShowCreate(false)}
        />
      )}
    </motion.div>
  );
}
