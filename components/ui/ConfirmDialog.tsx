"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useFeedbackStore } from "@/lib/feedback";

/** Global branded confirm dialog — mounted once by FeedbackHost, driven by confirmDialog(). */
export function ConfirmDialog() {
  const tCommon = useTranslations("common");
  const reducedMotion = useReducedMotion();
  const request = useFeedbackStore((s) => s.confirmRequest);
  const resolveConfirm = useFeedbackStore((s) => s.resolveConfirm);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!request) {
      restoreFocusRef.current?.focus();
      restoreFocusRef.current = null;
      return;
    }
    restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cancelRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        resolveConfirm(false);
      } else if (e.key === "Tab") {
        // Two focusables only — keep Tab cycling between them.
        const buttons = Array.from(
          document.querySelectorAll<HTMLButtonElement>("[data-confirm-dialog] button"),
        );
        if (buttons.length === 0) return;
        const idx = buttons.indexOf(document.activeElement as HTMLButtonElement);
        e.preventDefault();
        const next = e.shiftKey ? idx - 1 : idx + 1;
        buttons[(next + buttons.length) % buttons.length]?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [request, resolveConfirm]);

  return (
    <AnimatePresence>
      {request ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) resolveConfirm(false);
          }}
        >
          <motion.div
            data-confirm-dialog
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-dialog-title"
            initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.97 }}
            animate={reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.97 }}
            transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
            className="w-full max-w-sm rounded-2xl border border-[--hair] bg-surface p-6 shadow-[0_24px_60px_-20px_rgba(10,10,10,0.45)]"
          >
            <h2 id="confirm-dialog-title" className="text-base font-semibold text-ink">
              {request.title}
            </h2>
            {request.body ? <p className="mt-2 text-sm text-muted">{request.body}</p> : null}
            <div className="mt-6 flex justify-end gap-2">
              <button
                ref={cancelRef}
                type="button"
                onClick={() => resolveConfirm(false)}
                className="rounded-xl border border-[--hair] bg-surface px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-[color-mix(in_srgb,var(--text)_5%,var(--surface))]"
              >
                {request.cancelLabel ?? tCommon("cancel")}
              </button>
              <button
                type="button"
                onClick={() => resolveConfirm(true)}
                className={`rounded-xl px-4 py-2 text-sm font-semibold text-white transition-[transform,box-shadow] hover:-translate-y-px active:translate-y-0 ${
                  request.destructive
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-brand hover:bg-brand-deep"
                }`}
              >
                {request.confirmLabel ?? tCommon("confirm")}
              </button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
