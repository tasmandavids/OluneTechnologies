"use client";

// ============================================================================
//  EnrollModal — 4-step enrollment flow for parents.
//
//  Step 1: Select child + class (browse by day / discipline, capacity check)
//  Step 2: Sign studio waivers (required waivers only)
//  Step 3: Review — confirm enrollment; choose how to pay
//  Step 4: Confirmation
//
//  State machine: uses a simple step index + accumulated data object.
//  Step screens live in ./enroll/ (1.6.1 file split — no logic changes).
//  All server calls use the actions in /app/portal/parent/enroll/actions.ts.
// ============================================================================

import { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations } from "next-intl";
import type { Child } from "@/app/portal/parent/page";
import { getBasketQuote } from "@/app/portal/parent/enroll/actions";
import type { EnrollData } from "@/components/portal/parent/enroll/types";
import { Step1SelectClass } from "@/components/portal/parent/enroll/Step1SelectClass";
import { Step2SignWaivers } from "@/components/portal/parent/enroll/Step2SignWaivers";
import { Step3Review } from "@/components/portal/parent/enroll/Step3Review";
import { Step4Confirmation } from "@/components/portal/parent/enroll/Step4Confirmation";

function StepIndicator({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className="h-1.5 rounded-full transition-all duration-300"
          style={{
            width: i === step ? 24 : 8,
            background: i <= step ? "var(--brand)" : "var(--hair)",
          }}
        />
      ))}
    </div>
  );
}

export function EnrollModal({
  familyChildren,
  onClose,
}: {
  familyChildren: Child[];
  onClose: () => void;
}) {
  const t = useTranslations("parent.enroll");
  const steps = [
    t("steps.selectClass"),
    t("steps.waivers"),
    t("steps.review"),
    t("steps.done"),
  ];
  const [step, setStep] = useState(0);
  const [enrollData, setEnrollData] = useState<Partial<EnrollData>>({ classes: [] });
  const backdropRef = useRef<HTMLDivElement>(null);

  // Close on backdrop click
  function handleBackdropClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === backdropRef.current) onClose();
  }

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-4 backdrop-blur-sm"
    >
      <div className="flex min-h-full items-start justify-center py-2 sm:items-center sm:py-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 8 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          className="relative flex w-full max-w-md max-h-[calc(100dvh-2rem)] flex-col overflow-hidden rounded-2xl border border-[--hair] bg-base shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex shrink-0 items-center justify-between border-b border-[--hair] px-6 py-4">
          <div>
            <p className="text-[0.62rem] font-semibold uppercase tracking-wider text-muted">
              {t("title")}
            </p>
            <p className="text-sm font-bold text-ink">{steps[step]}</p>
          </div>
          <div className="flex items-center gap-4">
            <StepIndicator step={step} total={steps.length} />
            <button
              type="button"
              onClick={onClose}
              className="grid h-8 w-8 place-items-center rounded-full text-muted transition-colors hover:bg-surface hover:text-ink"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.18 }}
            >
              {step === 0 && (
                <Step1SelectClass
                  familyChildren={familyChildren}
                  onNext={({ childId, childName, classes }) => {
                    setEnrollData({
                      childId,
                      childName,
                      classes: classes.map((cls) => ({
                        classId: cls.id,
                        className: cls.name,
                        priceCents: cls.priceCents,
                        recurringGroupId: cls.recurringGroupId,
                      })),
                    });
                    setStep(1);
                  }}
                />
              )}
              {step === 1 && (
                <Step2SignWaivers
                  childName={enrollData.childName ?? null}
                  childId={enrollData.childId!}
                  onNext={async () => {
                    // One authoritative quote for the whole basket. This used
                    // to be a per-class loop that re-derived the linked-series
                    // rule here, in the browser, to stop each sibling zeroing
                    // the others out — a third copy of a rule that already
                    // existed twice. The server prices the basket as a unit,
                    // which is also the only way an hours ladder or a combo
                    // can be expressed at all.
                    const result = await getBasketQuote(
                      enrollData.childId!,
                      (enrollData.classes ?? []).map((c) => c.classId),
                    );
                    if (result.ok) {
                      setEnrollData((prev) => ({ ...prev, quote: result.data }));
                    }
                    setStep(2);
                  }}
                  onBack={() => setStep(0)}
                />
              )}
              {step === 2 && (
                <Step3Review
                  childId={enrollData.childId!}
                  enrollData={{
                    childName: enrollData.childName ?? null,
                    classes: enrollData.classes ?? [],
                    quote: enrollData.quote,
                  }}
                  onComplete={(waitlisted, opts) => {
                    setEnrollData((prev) => ({
                      ...prev,
                      waitlisted,
                      payLater: opts?.payLater,
                      paidOnline: opts?.paidOnline,
                      payMonthly: opts?.payMonthly,
                      installmentCents: opts?.installmentCents,
                    }));
                    setStep(3);
                  }}
                  onBack={() => setStep(1)}
                />
              )}
              {step === 3 && enrollData.childId && (enrollData.classes?.length ?? 0) > 0 && (
                <Step4Confirmation
                  enrollData={enrollData as EnrollData}
                  onClose={onClose}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>
      </div>
    </div>
  );
}
