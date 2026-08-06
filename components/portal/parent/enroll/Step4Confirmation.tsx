"use client";

// Step 4: Confirmation.
// Pure file split from EnrollModal.tsx (1.6.1) — no logic changes.

import { useTranslations } from "next-intl";
import { TERM_INSTALLMENT_COUNT } from "@/lib/term-payments";
import { NZD, type EnrollData } from "./types";

export function Step4Confirmation({
  enrollData,
  onClose,
}: {
  enrollData: EnrollData;
  onClose: () => void;
}) {
  const t = useTranslations("parent.enroll");
  const dancerName = enrollData.childName ?? t("yourDancer");
  const classes = enrollData.classes;
  const totalBillableCents =
    enrollData.quote?.totalCents ?? classes.reduce((sum, c) => sum + c.priceCents, 0);

  return (
    <div className="flex flex-col items-center gap-5 py-4 text-center">
      <div
        className="grid h-16 w-16 place-items-center rounded-full text-2xl"
        style={{ background: "color-mix(in srgb, var(--brand) 12%, transparent)" }}
      >
        {enrollData.waitlisted ? "⏳" : "🎉"}
      </div>
      <div>
        <h3 className="text-lg font-black text-ink">
          {enrollData.waitlisted ? t("waitlistedTitle") : t("enrolledTitle")}
        </h3>
        {classes.length === 1 ? (
          <p className="mt-1 text-sm text-muted">
            {enrollData.waitlisted
              ? t("waitlistedBody", { name: dancerName, className: classes[0].className })
              : t("enrolledBody", { name: dancerName, className: classes[0].className })}
          </p>
        ) : (
          <div className="mt-2 space-y-0.5">
            {classes.map((cls) => (
              <p key={cls.classId} className="text-sm text-ink font-medium">{cls.className}</p>
            ))}
            <p className="mt-1 text-xs text-muted">{t("enrolledForDancer", { name: dancerName })}</p>
          </div>
        )}
        {totalBillableCents > 0 && !enrollData.waitlisted && (
          <p className="mt-2 text-xs text-muted">
            {enrollData.paidOnline
              ? t("paidOnlineHint", { amount: NZD.format(totalBillableCents / 100) })
              : enrollData.payMonthly
                ? t("termPaidHint", {
                    amount: NZD.format((enrollData.installmentCents ?? 0) / 100),
                    count: TERM_INSTALLMENT_COUNT,
                  })
                : enrollData.payLater
                ? t("payLaterHint", { amount: NZD.format(totalBillableCents / 100) })
                : t("invoiceHint", { amount: NZD.format(totalBillableCents / 100) })}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={onClose}
        className="rounded-xl px-8 py-3 text-sm font-bold text-white"
        style={{ background: "var(--brand)" }}
      >
        {t("done")}
      </button>
    </div>
  );
}
