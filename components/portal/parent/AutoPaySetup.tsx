"use client";

import { useState, useTransition } from "react";
import { AnimatePresence } from "framer-motion";
import { useTranslations } from "next-intl";
import {
  createEnrollmentSubscription,
  cancelSubscription,
} from "@/app/portal/parent/subscriptions/actions";
import CheckoutForm from "@/components/payments/CheckoutForm";
import { PaymentModalBody, PaymentModalShell } from "@/components/payments/PaymentModalShell";
import { monthlyFromTermFeeCents } from "@/lib/term-payments";

export type AutoPayItem = {
  studentId: string;
  studentName: string | null;
  classId: string;
  className: string;
  priceCents: number;
  subscriptionId: string | null;
  status: string | null;
  cancelAtPeriodEnd: boolean;
};

const money = (cents: number) =>
  new Intl.NumberFormat("en-NZ", { style: "currency", currency: "NZD" }).format(cents / 100);

function itemKey(i: AutoPayItem) {
  return `${i.studentId}:${i.classId}`;
}

export default function AutoPaySetup({ items }: { items: AutoPayItem[] }) {
  const t = useTranslations("parent.autoPay");
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<Set<string>>(new Set());
  const [cancelled, setCancelled] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function startSetup(item: AutoPayItem) {
    setError(null);
    setActiveKey(itemKey(item));
    setClientSecret(null);
    startTransition(async () => {
      const res = await createEnrollmentSubscription(
        item.studentId,
        item.classId,
        item.className,
        item.priceCents,
      );
      if (!res.ok) {
        setError(res.error);
        setActiveKey(null);
        return;
      }
      setClientSecret(res.data.clientSecret);
    });
  }

  function cancel(item: AutoPayItem) {
    if (!item.subscriptionId) return;
    setError(null);
    startTransition(async () => {
      const res = await cancelSubscription(item.subscriptionId!);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setCancelled((prev) => new Set(prev).add(itemKey(item)));
    });
  }

  return (
    <section>
      <h2 className="text-xl font-black text-ink">{t("title")}</h2>
      <p className="mb-4 text-sm text-muted">{t("subtitle")}</p>

      {error && (
        <p className="mb-3 rounded-xl bg-red-500/10 px-3 py-2 text-xs text-red-500">{error}</p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((item) => {
          const key = itemKey(item);
          const isActive = (item.subscriptionId && !cancelled.has(key)) || confirmed.has(key);
          const isCancelling = cancelled.has(key);

          return (
            <div key={key} className="rounded-2xl border border-[--hair] bg-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-ink">{item.className}</p>
                  <p className="text-xs text-muted">
                    {item.studentName ?? t("studentFallback")} ·{" "}
                    {t("pricePerMonth", { price: money(monthlyFromTermFeeCents(item.priceCents)) })}
                  </p>
                </div>
                {isActive && !isCancelling && (
                  <span className="rounded-full bg-green-500/15 px-2.5 py-1 text-[0.62rem] font-bold uppercase tracking-wider text-green-500">
                    {t("badgeOn")}
                  </span>
                )}
                {isCancelling && (
                  <span className="rounded-full bg-amber-500/15 px-2.5 py-1 text-[0.62rem] font-bold uppercase tracking-wider text-amber-500">
                    {t("badgeEnding")}
                  </span>
                )}
              </div>

              <div className="mt-3">
                {isCancelling ? (
                  <p className="text-xs text-muted">{t("endingHint")}</p>
                ) : isActive ? (
                  <button
                    onClick={() => cancel(item)}
                    disabled={pending || !item.subscriptionId}
                    className="text-xs font-semibold text-muted transition-colors hover:text-red-400 disabled:opacity-40"
                  >
                    {t("cancelAutoPay")}
                  </button>
                ) : (
                  <button
                    onClick={() => startSetup(item)}
                    disabled={pending && activeKey === key}
                    className="rounded-xl px-3 py-2 text-xs font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                    style={{ background: "var(--brand)" }}
                  >
                    {pending && activeKey === key ? t("starting") : t("setup")}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <AnimatePresence>
        {activeKey && clientSecret && (
          <PaymentModalShell
            onClose={() => {
              setActiveKey(null);
              setClientSecret(null);
            }}
          >
              <div className="shrink-0 border-b border-[--hair] px-6 py-5">
                <h3 className="font-black text-ink">{t("confirmTitle")}</h3>
                <p className="mt-1 text-sm text-muted">{t("confirmHint")}</p>
              </div>
              <PaymentModalBody>
                <CheckoutForm
                  clientSecret={clientSecret}
                  submitLabel={t("startAutoPay")}
                  cancelLabel={t("notNow")}
                  onCancel={() => {
                    setActiveKey(null);
                    setClientSecret(null);
                  }}
                  onSuccess={() => {
                    setConfirmed((prev) => new Set(prev).add(activeKey));
                    setActiveKey(null);
                    setClientSecret(null);
                  }}
                />
              </PaymentModalBody>
            </PaymentModalShell>
        )}
      </AnimatePresence>
    </section>
  );
}
