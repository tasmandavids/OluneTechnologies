"use client";

// Step 3: Review — confirm enrollment and choose how to pay.
// Split from EnrollModal.tsx (1.6.1). Handlers are unchanged; only the
// presentation of the payment fork changed: one primary CTA (Pay now),
// a quieter Pay monthly with its instalment amount inline, and Pay later
// (invoice) tucked behind a "More payment options" link. All four payment
// paths remain reachable and functional.

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  enrollChildInClass,
  createEnrollmentIntent,
  createEnrollmentPayLaterInvoice,
  waitForInvoicePaid,
} from "@/app/portal/parent/enroll/actions";
import {
  startTermPlanAfterEnrollment,
  getAccountBillingSummary,
  type AccountBillingSummary,
} from "@/app/portal/parent/billing/actions";
import { splitTermInstallments } from "@/lib/term-payments";
import type { TuitionQuoteLine } from "@/lib/billing/tuition-quote";
import CheckoutForm from "@/components/payments/CheckoutForm";
import { NZD, type EnrollData } from "./types";

export function Step3Review({
  childId,
  enrollData,
  onComplete,
  onBack,
}: {
  childId: string;
  enrollData: Pick<EnrollData, "childName" | "classes" | "quote">;
  onComplete: (
    waitlisted: boolean,
    opts?: { payLater?: boolean; paidOnline?: boolean; payMonthly?: boolean; installmentCents?: number },
  ) => void;
  onBack: () => void;
}) {
  const t = useTranslations("parent.enroll");
  const [phase, setPhase] = useState<"summary" | "pay">("summary");
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [pendingInvoiceId, setPendingInvoiceId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showMoreOptions, setShowMoreOptions] = useState(false);
  const [enrolledClassIds, setEnrolledClassIds] = useState<Set<string>>(new Set());
  const [payMeta, setPayMeta] = useState<{
    installmentCents: number;
    installmentNumber: number;
    installmentCount: number;
    totalCents: number;
  } | null>(null);
  const [accountSummary, setAccountSummary] = useState<AccountBillingSummary | null>(null);

  const classes = enrollData.classes;
  const quote = enrollData.quote ?? null;

  // The quote is authoritative. The raw class prices are only a fallback for
  // the moment before it arrives (or if the call failed) — they're never what
  // gets charged, since every payment path re-quotes server-side.
  const totalBillableCents =
    quote?.totalCents ?? classes.reduce((sum, c) => sum + c.priceCents, 0);
  const isPaid = totalBillableCents > 0;
  const isSingleClass = classes.length === 1;

  useEffect(() => {
    if (!isPaid) return;
    getAccountBillingSummary().then((res) => {
      if (res.ok) setAccountSummary(res.data);
    });
  }, [isPaid]);

  const projectedTermTotal = (accountSummary?.outstandingCents ?? 0) + totalBillableCents;
  const monthlyInstallmentCents = splitTermInstallments(projectedTermTotal)[0] ?? 0;

  async function enrollAll(): Promise<{ anyWaitlisted: boolean } | null> {
    const toEnroll = classes.filter((c) => !enrolledClassIds.has(c.classId));
    let anyWaitlisted = false;
    const newEnrolled = new Set(enrolledClassIds);

    for (const cls of toEnroll) {
      const res = await enrollChildInClass(childId, cls.classId);
      if (!res.ok) {
        setError(res.error);
        return null;
      }
      if (res.data.waitlisted) anyWaitlisted = true;
      newEnrolled.add(cls.classId);
    }

    setEnrolledClassIds(newEnrolled);
    return { anyWaitlisted };
  }

  async function handlePayLater() {
    setBusy(true);
    setError(null);

    const enrolled = await enrollAll();
    if (!enrolled) { setBusy(false); return; }

    if (enrolled.anyWaitlisted || !isPaid) {
      onComplete(enrolled.anyWaitlisted);
      setBusy(false);
      return;
    }

    const invRes = await createEnrollmentPayLaterInvoice(
      childId,
      classes.map((cls) => ({ classId: cls.classId, className: cls.className, priceCents: cls.priceCents })),
      false,
    );
    if (!invRes.ok) { setError(invRes.error); setBusy(false); return; }

    onComplete(false, { payLater: true });
    setBusy(false);
  }

  async function handlePayMonthly() {
    setBusy(true);
    setError(null);

    const enrolled = await enrollAll();
    if (!enrolled) { setBusy(false); return; }

    if (enrolled.anyWaitlisted || !isPaid) {
      onComplete(enrolled.anyWaitlisted);
      setBusy(false);
      return;
    }

    const invRes = await createEnrollmentPayLaterInvoice(
      childId,
      classes.map((cls) => ({ classId: cls.classId, className: cls.className, priceCents: cls.priceCents })),
      true,
    );
    if (!invRes.ok) { setError(invRes.error); setBusy(false); return; }

    if (!invRes.data.invoiceId) {
      onComplete(false);
      setBusy(false);
      return;
    }

    const termRes = await startTermPlanAfterEnrollment(invRes.data.invoiceId);
    if (!termRes.ok) { setError(termRes.error); setBusy(false); return; }

    setPayMeta({
      installmentCents: termRes.data.installmentCents,
      installmentNumber: termRes.data.installmentNumber,
      installmentCount: termRes.data.installmentCount,
      totalCents: termRes.data.totalCents,
    });
    setClientSecret(termRes.data.clientSecret);
    setPhase("pay");
    setBusy(false);
  }

  async function handlePayNow() {
    if (!isSingleClass) return;
    setBusy(true);
    setError(null);

    const cls = classes[0];
    const enrolled = await enrollAll();
    if (!enrolled) { setBusy(false); return; }

    if (enrolled.anyWaitlisted || !isPaid) {
      onComplete(enrolled.anyWaitlisted);
      setBusy(false);
      return;
    }

    const intentRes = await createEnrollmentIntent(childId, cls.classId, cls.className, cls.priceCents);
    if (!intentRes.ok) { setError(intentRes.error); setBusy(false); return; }

    if ("billingSkipped" in intentRes.data) {
      onComplete(false);
      setBusy(false);
      return;
    }

    setClientSecret(intentRes.data.clientSecret);
    setPendingInvoiceId(intentRes.data.invoiceId);
    setPhase("pay");
    setBusy(false);
  }

  async function handleFreeConfirm() {
    setBusy(true);
    setError(null);
    const enrolled = await enrollAll();
    if (!enrolled) { setBusy(false); return; }
    onComplete(enrolled.anyWaitlisted);
    setBusy(false);
  }

  function handlePaymentCancelled() {
    onComplete(false, { payLater: true });
  }

  // ── Card capture phase ─────────────────────────────────────────────────────
  if (phase === "pay" && clientSecret) {
    const chargeCents = payMeta?.installmentCents ?? totalBillableCents;
    const label = isSingleClass ? classes[0].className : t("multipleClasses", { count: classes.length });
    return (
      <div className="flex flex-col gap-4">
        <h3 className="text-base font-bold text-ink">
          {payMeta ? t("termPayTitle") : t("paymentTitle")}
        </h3>
        {payMeta && (
          <p className="text-xs text-muted">
            {t("termInstallmentProgress", {
              current: payMeta.installmentNumber,
              total: payMeta.installmentCount,
              accountTotal: NZD.format(payMeta.totalCents / 100),
            })}
          </p>
        )}
        <div className="box flex items-center justify-between rounded-xl px-4 py-3">
          <span className="text-sm text-muted">{label}</span>
          <span className="font-black text-ink">{NZD.format(chargeCents / 100)}</span>
        </div>
        <CheckoutForm
          clientSecret={clientSecret}
          submitLabel={t("payAmount", { amount: NZD.format(chargeCents / 100) })}
          confirmPaid={async () => {
            if (!pendingInvoiceId) return true;
            const res = await waitForInvoicePaid(pendingInvoiceId);
            return res.ok && res.data.status === "paid";
          }}
          onSuccess={() =>
            onComplete(false, {
              paidOnline: !payMeta,
              payMonthly: !!payMeta,
              installmentCents: payMeta?.installmentCents,
            })
          }
          onCancel={handlePaymentCancelled}
          cancelLabel={t("payLaterInstead")}
        />
        <p className="text-center text-[0.65rem] text-muted">
          {payMeta ? t("termPayNowHint") : t("payNowHint")}
        </p>
      </div>
    );
  }

  // ── Summary phase ──────────────────────────────────────────────────────────
  // Lines come from the quote so this screen and the invoice read identically:
  // a combo in bold over the indented classes it covers, or one tuition line
  // for the dancer's week.
  const lines: TuitionQuoteLine[] =
    quote?.lines ??
    classes.map((cls) => ({
      kind: "class",
      classId: cls.classId,
      productId: null,
      description: cls.className,
      chargeCents: cls.priceCents,
      includedReason: null,
    }));

  const allIncluded = lines.length > 0 && lines.every((l) => l.includedReason !== null);

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-base font-bold text-ink">{t("reviewTitle")}</h3>

      <div className="box rounded-xl p-5 space-y-3">
        {/* Class list */}
        {lines.map((line, idx) => (
          <div
            key={`${line.classId ?? line.kind}-${idx}`}
            className={`flex justify-between text-sm ${
              line.kind === "combo_detail" ? "pl-3" : ""
            }`}
          >
            <span
              className={`truncate pr-2 ${
                line.kind === "combo" ? "font-semibold text-ink" : "text-muted"
              }`}
            >
              {line.description}
            </span>
            <span className="font-semibold text-ink shrink-0">
              {line.includedReason
                ? t("programIncluded")
                : line.chargeCents > 0
                ? NZD.format(line.chargeCents / 100)
                : t("free")}
            </span>
          </div>
        ))}

        {/* The sibling discount used to be folded silently into each line. It
            gets its own row now — a family should be able to see the thing
            they were promised. */}
        {quote && quote.siblingDiscountCents > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-muted">{t("siblingDiscount")}</span>
            <span className="font-semibold text-ink shrink-0">
              −{NZD.format(quote.siblingDiscountCents / 100)}
            </span>
          </div>
        )}

        {/* Without this row an hours top-up looks like an arbitrary number. */}
        {quote && quote.priorCreditCents > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-muted">{t("alreadyInvoicedThisTerm")}</span>
            <span className="font-semibold text-ink shrink-0">
              −{NZD.format(quote.priorCreditCents / 100)}
            </span>
          </div>
        )}

        <div className="flex justify-between text-sm">
          <span className="text-muted">{t("summaryDancer")}</span>
          <span className="font-semibold text-ink">{enrollData.childName ?? "—"}</span>
        </div>
        <div className="my-2" />
        <div className="flex justify-between">
          <span className="font-bold text-ink">{t("summaryTotalDue")}</span>
          <span className="font-black text-ink">
            {allIncluded
              ? t("programIncluded")
              : isPaid
              ? NZD.format(totalBillableCents / 100)
              : t("free")}
          </span>
        </div>
      </div>

      {isPaid && projectedTermTotal > totalBillableCents && (
        <p className="text-xs text-muted">
          {t("termAccountTotalHint", { total: NZD.format(projectedTermTotal / 100) })}
        </p>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-3">
        {isPaid ? (
          <>
            {/* Primary: pay online now (single-class only, as before). For a
                multi-class batch the primary becomes the monthly plan. */}
            {isSingleClass ? (
              <button
                type="button"
                disabled={busy}
                onClick={handlePayNow}
                className="w-full rounded-xl py-3 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                style={{ background: "var(--brand)" }}
              >
                {busy ? t("processing") : t("payNow")}
              </button>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={handlePayMonthly}
                className="w-full rounded-xl py-3 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                style={{ background: "var(--brand)" }}
              >
                {busy
                  ? t("processing")
                  : t("payMonthlyWithAmount", {
                      amount: NZD.format(monthlyInstallmentCents / 100),
                    })}
              </button>
            )}

            {isSingleClass && (
              <button
                type="button"
                disabled={busy}
                onClick={handlePayMonthly}
                className="w-full rounded-xl border border-[--brand] bg-[color-mix(in_srgb,var(--brand)_8%,transparent)] py-3 text-sm font-semibold text-ink transition-colors hover:bg-[color-mix(in_srgb,var(--brand)_14%,transparent)] disabled:opacity-40"
              >
                {busy
                  ? t("processing")
                  : t("payMonthlyWithAmount", {
                      amount: NZD.format(monthlyInstallmentCents / 100),
                    })}
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowMoreOptions((v) => !v)}
              className="text-center text-xs font-semibold text-muted underline decoration-dotted transition-colors hover:text-ink"
            >
              {t("morePaymentOptions")}
            </button>

            {showMoreOptions && (
              <div className="flex flex-col gap-2">
                <p className="text-center text-xs text-muted">{t("paymentChoiceHint")}</p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={handlePayLater}
                  className="w-full rounded-xl border border-[--hair] bg-surface py-3 text-sm font-semibold text-ink transition-colors hover:bg-base disabled:opacity-40"
                >
                  {busy ? t("processing") : t("payLater")}
                </button>
              </div>
            )}
          </>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={handleFreeConfirm}
            className="w-full rounded-xl py-3 text-sm font-bold text-white transition-opacity disabled:opacity-40"
            style={{ background: "var(--brand)" }}
          >
            {busy ? t("processing") : t("confirmEnrollment")}
          </button>
        )}

        <button
          type="button"
          onClick={onBack}
          disabled={busy}
          className="w-full rounded-xl border border-[--hair] py-3 text-sm font-semibold text-muted transition-colors hover:text-ink disabled:opacity-40"
        >
          {t("back")}
        </button>
      </div>
    </div>
  );
}
