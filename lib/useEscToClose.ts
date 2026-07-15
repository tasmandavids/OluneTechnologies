"use client";

import { useEffect } from "react";

/**
 * Escape closes the panel/modal. The global ConfirmDialog listens in the
 * capture phase and stops propagation, so a confirm stacked on top of a
 * panel swallows the first Esc instead of closing both.
 */
export function useEscToClose(onClose: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, enabled]);
}
