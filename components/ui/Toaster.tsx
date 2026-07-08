"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useFeedbackStore, type Toast, type ToastVariant } from "@/lib/feedback";

const AUTO_DISMISS_MS: Record<ToastVariant, number> = {
  success: 4000,
  info: 5000,
  error: 7000,
};

const VARIANT_ACCENT: Record<ToastVariant, string> = {
  success: "#16a34a",
  error: "#dc2626",
  info: "var(--brand)",
};

function VariantIcon({ variant }: { variant: ToastVariant }) {
  const stroke = VARIANT_ACCENT[variant];
  if (variant === "success") {
    return (
      <svg viewBox="0 0 20 20" className="h-5 w-5 shrink-0" fill="none" aria-hidden>
        <circle cx="10" cy="10" r="8.25" stroke={stroke} strokeWidth="1.5" />
        <path d="m6.5 10.2 2.3 2.3 4.7-4.9" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (variant === "error") {
    return (
      <svg viewBox="0 0 20 20" className="h-5 w-5 shrink-0" fill="none" aria-hidden>
        <circle cx="10" cy="10" r="8.25" stroke={stroke} strokeWidth="1.5" />
        <path d="M10 6.2v4.6" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="10" cy="13.8" r="0.9" fill={stroke} />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 20 20" className="h-5 w-5 shrink-0" fill="none" aria-hidden>
      <circle cx="10" cy="10" r="8.25" stroke={stroke} strokeWidth="1.5" />
      <path d="M10 9.2v4.4" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="10" cy="6.4" r="0.9" fill={stroke} />
    </svg>
  );
}

function ToastCard({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const tCommon = useTranslations("common");
  const reducedMotion = useReducedMotion();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remainingRef = useRef(AUTO_DISMISS_MS[toast.variant]);
  const startedAtRef = useRef(0);

  const pause = () => {
    if (timerRef.current === null) return;
    clearTimeout(timerRef.current);
    timerRef.current = null;
    remainingRef.current -= Date.now() - startedAtRef.current;
  };

  const resume = () => {
    if (timerRef.current !== null) return;
    startedAtRef.current = Date.now();
    timerRef.current = setTimeout(onDismiss, Math.max(remainingRef.current, 400));
  };

  useEffect(() => {
    resume();
    return pause;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <motion.div
      layout={!reducedMotion}
      initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.97 }}
      animate={reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
      exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.97 }}
      transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
      role={toast.variant === "error" ? "alert" : "status"}
      onMouseEnter={pause}
      onMouseLeave={resume}
      onFocus={pause}
      onBlur={resume}
      className="pointer-events-auto flex w-full items-start gap-3 rounded-2xl border border-[--hair] bg-surface px-4 py-3 text-sm text-ink shadow-[0_16px_40px_-16px_rgba(10,10,10,0.35)]"
      style={{ borderLeft: `3px solid ${VARIANT_ACCENT[toast.variant]}` }}
    >
      <VariantIcon variant={toast.variant} />
      <p className="min-w-0 flex-1 break-words pt-px">{toast.message}</p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label={tCommon("close")}
        className="-m-1 rounded-lg p-1 text-muted transition-colors hover:text-ink"
      >
        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden>
          <path d="m6 6 8 8m0-8-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
    </motion.div>
  );
}

/** Global toast outlet — mounted once by FeedbackHost. */
export function Toaster() {
  const toasts = useFeedbackStore((s) => s.toasts);
  const dismissToast = useFeedbackStore((s) => s.dismissToast);

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-4 z-[90] mx-auto flex w-full max-w-sm flex-col items-stretch gap-2 px-4 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:mx-0 sm:px-0"
    >
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <ToastCard key={t.id} toast={t} onDismiss={() => dismissToast(t.id)} />
        ))}
      </AnimatePresence>
    </div>
  );
}
