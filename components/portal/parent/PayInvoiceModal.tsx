"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { AnimatePresence } from "framer-motion";
import CheckoutForm from "@/components/payments/CheckoutForm";
import { PaymentModalBody, PaymentModalShell } from "@/components/payments/PaymentModalShell";
import { formatMoney } from "@/lib/currency";

export function PayInvoiceModal({
  invoiceId,
  amountCents,
  label,
  onClose,
  onPaid,
}: {
  invoiceId: string;
  amountCents: number;
  label: string;
  onClose: () => void;
  onPaid: () => void;
}) {
  const t = useTranslations("parent.hub");
  const tPay = useTranslations("payments");
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const amountLabel = formatMoney(amountCents);

  async function startPayment() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/payments/create-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? t("payFailed"));
        return;
      }
      setClientSecret(data.clientSecret);
    } catch {
      setError(t("payFailed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AnimatePresence>
      <PaymentModalShell onClose={onClose}>
        <div className="shrink-0 border-b border-(--hair) px-6 py-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-black tracking-tight text-ink">{t("payInvoice")}</h2>
              <p className="mt-0.5 text-sm text-muted">{label}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={t("cancelPay")}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-base hover:text-ink"
            >
              ✕
            </button>
          </div>
          <p className="mt-4 text-3xl font-black tabular-nums tracking-tight text-ink">
            {amountLabel}
          </p>
        </div>

        <PaymentModalBody>
          {!clientSecret ? (
            <>
              <p className="mb-4 text-sm text-muted">{tPay("secureCheckout")}</p>
              <button
                type="button"
                onClick={startPayment}
                disabled={loading}
                className="w-full rounded-xl py-3 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{ background: "var(--brand)" }}
              >
                {loading ? t("preparingPayment") : t("continueToPay")}
              </button>
            </>
          ) : (
            <CheckoutForm
              clientSecret={clientSecret}
              submitLabel={tPay("payAmount", { amount: amountLabel })}
              onCancel={onClose}
              cancelLabel={t("cancelPay")}
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
