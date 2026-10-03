"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { AnimatePresence } from "framer-motion";
import CheckoutForm from "@/components/payments/CheckoutForm";
import { PaymentModalBody, PaymentModalShell } from "@/components/payments/PaymentModalShell";
import { formatMoney } from "@/lib/currency";
import { createTermInstallmentIntent } from "@/app/portal/parent/billing/actions";

export function TermInstallmentPayModal({
  onClose,
  onPaid,
  invoiceIds,
  title,
  subtitle,
}: {
  onClose: () => void;
  onPaid: () => void;
  invoiceIds?: string[];
  title?: string;
  subtitle?: string;
}) {
  const t = useTranslations("parent.billing");
  const tPay = useTranslations("payments");
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [installmentCents, setInstallmentCents] = useState<number | null>(null);
  const [installmentNumber, setInstallmentNumber] = useState<number | null>(null);
  const [installmentCount, setInstallmentCount] = useState<number>(3);
  const [totalCents, setTotalCents] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function startPayment() {
    setLoading(true);
    setError(null);
    try {
      const res = await createTermInstallmentIntent(invoiceIds);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setClientSecret(res.data.clientSecret);
      setInstallmentCents(res.data.installmentCents);
      setInstallmentNumber(res.data.installmentNumber);
      setInstallmentCount(res.data.installmentCount);
      setTotalCents(res.data.totalCents);
    } catch {
      setError(t("termPayFailed"));
    } finally {
      setLoading(false);
    }
  }

  const amountLabel =
    installmentCents != null ? formatMoney(installmentCents) : "—";

  return (
    <AnimatePresence>
      <PaymentModalShell onClose={onClose}>
        <div className="shrink-0 border-b border-(--hair) px-6 py-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-black tracking-tight text-ink">
                {title ?? t("termPayTitle")}
              </h2>
              <p className="mt-0.5 text-sm text-muted">{subtitle ?? t("termPaySubtitle")}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-base hover:text-ink"
            >
              ✕
            </button>
          </div>
          {installmentNumber != null && totalCents != null && (
            <p className="mt-3 text-xs text-muted">
              {t("termInstallmentProgress", {
                current: installmentNumber,
                total: installmentCount,
                accountTotal: formatMoney(totalCents),
              })}
            </p>
          )}
          <p className="mt-4 text-3xl font-black tabular-nums tracking-tight text-ink">
            {amountLabel}
          </p>
        </div>

        <PaymentModalBody>
          {!clientSecret ? (
            <>
              <p className="mb-4 text-sm text-muted">{t("termPayExplain")}</p>
              <button
                type="button"
                onClick={startPayment}
                disabled={loading}
                className="w-full rounded-xl py-3 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{ background: "var(--brand)" }}
              >
                {loading ? t("preparingTermPay") : t("continueTermPay")}
              </button>
            </>
          ) : (
            <CheckoutForm
              clientSecret={clientSecret}
              submitLabel={tPay("payAmount", { amount: amountLabel })}
              onCancel={onClose}
              cancelLabel={t("cancelTermPay")}
              onSuccess={() => {
                onPaid();
                onClose();
              }}
            />
          )}

          {error && (
            <p className="mt-4 rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-500">{error}</p>
          )}
        </PaymentModalBody>
      </PaymentModalShell>
    </AnimatePresence>
  );
}
