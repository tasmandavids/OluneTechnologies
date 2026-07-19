"use client";

import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import { useLocale, useTranslations } from "next-intl";
import CheckoutForm from "@/components/payments/CheckoutForm";
import { PaymentModalBody, PaymentModalShell } from "@/components/payments/PaymentModalShell";
import { formatMoney } from "@/lib/currency";
import { listHeldClassPasses, type StudentClassPass } from "@/lib/passes/student-passes";

export type StudentPass = StudentClassPass;

interface Props {
  priceCents: number;
  existingPasses: StudentClassPass[];
}

type ModalState = { mode: "view"; pass: StudentClassPass } | { mode: "buy" } | null;

export default function BuyClassPass({ priceCents, existingPasses }: Props) {
  const t = useTranslations("student.classPass");
  const locale = useLocale();
  const [modal, setModal] = useState<ModalState>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [purchasedQr, setPurchasedQr] = useState<string | null>(null);

  // Every unredeemed, paid pass stays individually accessible — a student may
  // hold more than one (e.g. bought ahead of a few drop-ins), and each needs
  // its own QR shown at the door.
  const heldPasses = listHeldClassPasses(existingPasses);

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
  }

  function openBuy() {
    setError(null);
    setClientSecret(null);
    setPurchasedQr(null);
    setModal({ mode: "buy" });
  }

  function viewPass(pass: StudentPass) {
    setModal({ mode: "view", pass });
  }

  function close() {
    setModal(null);
    setError(null);
    setClientSecret(null);
    setPurchasedQr(null);
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
        setPurchasedQr(data.qrCode ?? null);
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

      <div className="flex flex-col gap-2 sm:max-w-sm">
        {heldPasses.map((pass) => (
          <button
            key={pass.id}
            type="button"
            onClick={() => viewPass(pass)}
            className="group flex items-center justify-between rounded-2xl border border-[--hair] bg-surface p-4 text-left transition-shadow hover:shadow-md"
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">🎫</span>
              <div>
                <p className="font-semibold text-ink">{t("title")}</p>
                <p className="text-xs text-muted">{t("purchasedOn", { date: formatDate(pass.purchasedAt) })}</p>
              </div>
            </div>
            <span className="text-xs font-semibold text-brand group-hover:underline">{t("viewQr")} →</span>
          </button>
        ))}

        <button
          type="button"
          onClick={openBuy}
          className="flex items-center justify-between rounded-2xl border border-dashed border-[--hair] bg-surface p-4 text-left transition-shadow hover:shadow-md"
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">🩰</span>
            <div>
              <p className="font-semibold text-ink">{heldPasses.length ? t("buyAnother") : t("title")}</p>
              <p className="text-xs text-muted">{t("subtitle")}</p>
            </div>
          </div>
          <span className="font-black text-brand">{formatMoney(priceCents)}</span>
        </button>
      </div>

      <AnimatePresence>
        {modal && (
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
              {modal.mode === "view" ? (
                <div className="flex flex-col items-center text-center">
                  <p className="mb-3 font-semibold text-ink">{t("yourPass")}</p>
                  {modal.pass.qrCode && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={modal.pass.qrCode}
                      alt={t("qrAlt")}
                      className="h-48 w-48 rounded-xl border border-[--hair] bg-white p-2"
                    />
                  )}
                  <p className="mt-3 text-xs text-muted">{t("qrHint")}</p>
                  <button
                    onClick={close}
                    className="mt-4 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
                  >
                    {t("done")}
                  </button>
                </div>
              ) : purchasedQr ? (
                <div className="flex flex-col items-center text-center">
                  <p className="mb-3 font-semibold text-ink">{t("allSet")}</p>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={purchasedQr}
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
                    onSuccess={() => setClientSecret(null)}
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
