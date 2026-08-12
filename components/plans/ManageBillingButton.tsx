"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

/**
 * Opens the Stripe Customer Portal.
 *
 * Everything past this button — cards, invoices, cancellation, plan changes
 * with proration — is Stripe's hosted UI rather than ours. That is why
 * upgrade/downgrade and dunning screens aren't in this codebase: Stripe
 * already handles the tax and proration cases correctly.
 */
export function ManageBillingButton({ variant = "solid" }: { variant?: "solid" | "quiet" }) {
  const t = useTranslations("plan");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function open() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/plans/portal", { method: "POST" });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        setError(data.error ?? t("errors.portalFailed"));
        setBusy(false);
        return;
      }
      window.location.href = data.url;
    } catch {
      setError(t("errors.portalFailed"));
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={open}
        disabled={busy}
        className={
          variant === "solid"
            ? "rounded-full bg-brand px-5 py-2 text-xs font-bold text-white disabled:opacity-60"
            : "rounded-full border border-[--hair] px-5 py-2 text-xs font-bold text-ink disabled:opacity-60"
        }
      >
        {busy ? t("opening") : t("manageBilling")}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-xs font-semibold text-red-500">
          {error}
        </p>
      )}
    </div>
  );
}
