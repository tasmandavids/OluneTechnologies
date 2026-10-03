"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";

/** Scrollable centered overlay for Stripe checkout — avoids clipping the pay button on small screens. */
export function PaymentModalShell({
  onClose,
  children,
  maxWidthClass = "max-w-md",
}: {
  onClose: () => void;
  children: ReactNode;
  maxWidthClass?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 overflow-y-auto bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div className="flex min-h-full items-start justify-center py-2 sm:items-center sm:py-4">
        <motion.div
          initial={{ scale: 0.96, opacity: 0, y: 8 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.96, opacity: 0, y: 8 }}
          className={`flex w-full ${maxWidthClass} max-h-[calc(100dvh-2rem)] flex-col overflow-hidden rounded-2xl border border-(--hair) bg-surface shadow-2xl`}
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </motion.div>
      </div>
    </motion.div>
  );
}

export function PaymentModalBody({ children }: { children: ReactNode }) {
  return <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5">{children}</div>;
}
