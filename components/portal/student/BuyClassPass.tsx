"use client";

import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import { useTranslations } from "next-intl";
import CheckoutForm from "@/components/payments/CheckoutForm";
import { PaymentModalBody, PaymentModalShell } from "@/components/payments/PaymentModalShell";
import { formatMoney } from "@/lib/currency";

export type StudentPass = {
  id: string;
  status: "reserved" | "paid" | "redeemed" | "cancelled" | "refunded";
  priceCents: number;
  qrCode: string | null;
  purchasedAt: string;
  redeemedAt: string | null;
};

interface Props {
  priceCents: number;
  existingPasses: StudentPass[];
}

export default function BuyClassPass({ priceCents, existingPasses }: Props) {
  const t = useTranslations("student.classPass");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [pendingQr, setPendingQr] = useState<string | null>(null);

  const activePass = existingPasses.find((p) => p.status === "paid") ?? null;

  function openModal() {
    setError(null);
    setClientSecret(null);
    setPendingQr(null);
    setQrCode(activePass?.qrCode ?? null);
    setOpen(true);
  }

  function close() {
    setOpen(false);
    setQrCode(null);
    setClientSecret(null);
    setPendingQr(null);
    setError(null);
    setBusy(false);
  }

  async function buy() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/passes/purchase", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? t("purchaseFailed"));
        return;
      }
      if (data.clientSecret) {
        setPendingQr(data.qrCode ?? null);
        setClientSecret(data.clientSecret);
      } else {
        setError(t("paymentStartFailed"));
      }
    } catch {
      setError(t("networkError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <h2 className="mb-3 text-xs uppercase tracking-widest text-muted">{t("heading")}</h2>

      <button
        type="button"
        onClick={openModal}
        className="group flex w-full items-center justify-between rounded-2xl border border-[--hair] bg-surface p-4 text-left transition-shadow hover:shadow-md sm:max-w-sm"
      >
        <div className="flex items-center gap-3">
          <span className="text-2xl">🩰</span>
          <div>
            <p className="font-semibold text-ink">{t("title")}</p>
            <p className="text-xs text-muted">{t("subtitle")}</p>
          </div>
        </div>
        <div className="text-right">
          <span className="font-black text-brand">{formatMoney(priceCents)}</span>
          {activePass && (
            <p className="mt-0.5 rounded-full bg-[color-mix(in_srgb,#22c55e_18%,transparent)] px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-wider text-emerald-600">
              {t("passHeld")}
            </p>
          )}
        </div>
      </button>

      <AnimatePresence>
        {open && (
          <PaymentModalShell onClose={close}>
            <div className="shrink-0 border-b border-[--hair] px-6 py-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-black text-ink">{t("title")}</h3>
                  <p className="mt-0.5 text-xs text-muted">{t("subtitle")}</p>
                </div>
                <button onClick={close} className="text-lg text-muted hover:text-ink">
                  ✕
                </button>
              </div>
            </div>

            <PaymentModalBody>
              {qrCode ? (
                <div className="flex flex-col items-center text-center">
                  <p className="mb-3 font-semibold text-ink">{t("allSet")}</p>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={qrCode}
                    alt={t("qrAlt")}
                    className="h-48 w-48 rounded-xl border border-[--hair] bg-white p-2"
                  />
                  <p className="mt-3 text-xs text-muted">{t("qrHint")}</p>
                  <button
                    onClick={close}
                    className="mt-4 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
                  >
                    {t("done")}
                  </button>
                </div>
              ) : clientSecret ? (
                <div>
                  <div className="mb-4 flex items-center justify-between">
                    <span className="text-sm text-muted">{t("title")}</span>
                    <span className="text-lg font-black text-brand">{formatMoney(priceCents)}</span>
                  </div>
                  <CheckoutForm
                    clientSecret={clientSecret}
                    submitLabel={t("payAmount", { amount: formatMoney(priceCents) })}
                    onSuccess={() => {
                      setClientSecret(null);
                      setQrCode(pendingQr);
                    }}
                    onCancel={() => setClientSecret(null)}
                    cancelLabel={t("back")}
                  />
                </div>
              ) : (
                <>
                  <p className="mb-4 text-sm text-muted">{t("description")}</p>

                  <div className="mb-4 flex items-center justify-between">
                    <span className="text-sm text-muted">{t("total")}</span>
                    <span className="text-lg font-black text-brand">{formatMoney(priceCents)}</span>
                  </div>

                  {error && (
                    <p className="mb-3 rounded-xl bg-red-500/10 px-3 py-2 text-xs text-red-500">{error}</p>
                  )}

                  <button
                    onClick={buy}
                    disabled={busy}
                    className="w-full rounded-xl bg-brand py-3 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40"
                  >
                    {busy ? t("processing") : t("buyPass")}
                  </button>
                  <p className="mt-2 text-center text-[0.65rem] text-muted">{t("cardAtCheckout")}</p>
                </>
              )}
            </PaymentModalBody>
          </PaymentModalShell>
        )}
      </AnimatePresence>
    </section>
  );
}
