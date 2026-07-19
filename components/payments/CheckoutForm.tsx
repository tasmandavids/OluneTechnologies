"use client";

// ============================================================================
//  CheckoutForm — shared Stripe card-capture component.
// ============================================================================

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import type { StripeElementsOptions } from "@stripe/stripe-js";
import { getStripe } from "@/lib/stripe-client";
import { buildStripeAppearance } from "@/lib/stripe-appearance";

const stripePromise = getStripe();

interface CheckoutFormProps {
  clientSecret: string;
  submitLabel?: string;
  onSuccess: () => void;
  onCancel?: () => void;
  cancelLabel?: string;
  /**
   * Optional: wait for the server/webhook to confirm the sale before calling
   * onSuccess. Return true when the DB row is paid; false to show processing.
   */
  confirmPaid?: () => Promise<boolean>;
}

function InnerForm({
  submitLabel,
  onSuccess,
  onCancel,
  cancelLabel,
  confirmPaid,
}: Omit<CheckoutFormProps, "clientSecret">) {
  const t = useTranslations("payments");
  const tCommon = useTranslations("common");
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;

    setBusy(true);
    setError(null);

    const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
      confirmParams: {
        // Required for 3DS card authentication — Stripe redirects here then back.
        // Uses the current page so the user lands on the same context after auth.
        return_url: window.location.href,
      },
    });

    if (confirmError) {
      setError(confirmError.message ?? t("paymentNotCompleted"));
      setBusy(false);
      return;
    }

    // Only a *settled* payment is a success. `processing` means the funds have
    // not cleared yet (async methods, delayed capture) — we must NOT report it
    // as paid. Our webhook flips the record once `payment_intent.succeeded`
    // arrives, so we show a truthful "still processing" state and leave the
    // record untouched here.
    if (paymentIntent?.status === "succeeded") {
      if (confirmPaid) {
        const paid = await confirmPaid();
        if (!paid) {
          setProcessing(true);
          setBusy(false);
          return;
        }
      }
      onSuccess();
      return;
    }

    if (paymentIntent?.status === "processing") {
      setProcessing(true);
      setBusy(false);
      return;
    }

    setError(t("paymentIncomplete"));
    setBusy(false);
  }

  if (processing) {
    return (
      <div className="flex flex-col gap-4">
        <p className="rounded-xl bg-amber-500/10 px-3 py-3 text-sm text-amber-600">
          {t("paymentProcessing")}
        </p>
        <button
          type="button"
          onClick={onCancel ?? onSuccess}
          className="w-full rounded-xl border border-[--hair] bg-surface py-3 text-sm font-semibold text-muted transition-colors hover:text-ink"
        >
          {cancelLabel ?? tCommon("close")}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="min-h-0 max-h-[min(55dvh,24rem)] overflow-y-auto overscroll-contain">
        <PaymentElement
          options={{
            layout: "accordion",
            paymentMethodOrder: ["card"],
            wallets: { applePay: "never", googlePay: "never" },
          }}
        />
      </div>

      {error && (
        <p className="rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-500">{error}</p>
      )}

      <div className={`flex shrink-0 gap-3 ${onCancel ? "" : ""}`}>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="flex-1 rounded-xl border border-[--hair] bg-surface py-3 text-sm font-semibold text-muted transition-colors hover:text-ink disabled:opacity-40"
          >
            {cancelLabel ?? tCommon("cancel")}
          </button>
        )}
        <button
          type="submit"
          disabled={!stripe || busy}
          className={`rounded-xl py-3 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-40 ${
            onCancel ? "flex-1" : "w-full"
          }`}
          style={{ background: "var(--brand)" }}
        >
          {busy ? t("processing") : (submitLabel ?? t("payNow"))}
        </button>
      </div>
    </form>
  );
}

export default function CheckoutForm({
  clientSecret,
  submitLabel,
  onSuccess,
  onCancel,
  cancelLabel,
  confirmPaid,
}: CheckoutFormProps) {
  const appearance = useMemo(() => buildStripeAppearance(), []);

  const options: StripeElementsOptions = {
    clientSecret,
    appearance,
  };

  return (
    <Elements stripe={stripePromise} options={options} key={clientSecret}>
      <InnerForm
        submitLabel={submitLabel}
        onSuccess={onSuccess}
        onCancel={onCancel}
        cancelLabel={cancelLabel}
        confirmPaid={confirmPaid}
      />
    </Elements>
  );
}
