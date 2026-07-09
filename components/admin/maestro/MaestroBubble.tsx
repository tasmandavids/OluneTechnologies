"use client";

// ============================================================================
//  Maestro bubble — a floating launcher (bottom-right, every admin page) that
//  opens the chat panel in a popover. Replaces the old dedicated nav page.
// ============================================================================

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { MaestroPanel } from "./MaestroPanel";

export function MaestroBubble({ studioName }: { studioName: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.96 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="fixed bottom-24 right-6 z-50 h-[560px] max-h-[calc(100vh-8rem)] w-[380px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl shadow-2xl"
          >
            <MaestroPanel studioName={studioName} onClose={() => setOpen(false)} />
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        type="button"
        onClick={() => setOpen((o) => !o)}
        whileTap={{ scale: 0.92 }}
        aria-label={open ? "Close Maestro" : "Ask Maestro"}
        aria-expanded={open}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-ink text-white shadow-xl transition hover:scale-105"
      >
        {open ? (
          <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden="true">
            <path
              d="M5 5l10 10M15 5L5 15"
              stroke="currentColor"
              strokeWidth={1.75}
              strokeLinecap="round"
            />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" aria-hidden="true">
            <path
              d="M12 3l1.8 4.9L18.7 9.7 13.8 11.5 12 16.4l-1.8-4.9L5.3 9.7l4.9-1.8L12 3z"
              fill="currentColor"
            />
            <path
              d="M18.5 14l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2z"
              fill="currentColor"
            />
          </svg>
        )}
      </motion.button>
    </>
  );
}
