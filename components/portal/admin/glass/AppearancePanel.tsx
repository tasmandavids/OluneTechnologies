"use client";

// ============================================================================
//  AppearancePanel — personal glass-intensity tuning (tint / glass clarity /
//  blur depth / ambience). See lib/portal/admin/appearance.ts for why this
//  deliberately has no accent-colour picker: --brand already comes from the
//  studio's branding settings.
// ============================================================================

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";
import { useEscToClose } from "@/lib/useEscToClose";
import {
  applyAppearance,
  loadAppearance,
  saveAppearance,
  DEFAULT_APPEARANCE,
  type AppearanceState,
} from "@/lib/portal/admin/appearance";

const SLIDERS: { key: keyof AppearanceState; min: number; max: number; step: number; unit: string }[] = [
  { key: "tint", min: 0, max: 180, step: 5, unit: "%" },
  { key: "glass", min: 12, max: 92, step: 2, unit: "%" },
  { key: "blur", min: 6, max: 70, step: 2, unit: "px" },
  { key: "ambience", min: 0, max: 150, step: 5, unit: "%" },
];

export function AppearancePanel({
  open,
  onClose,
  portalTheme,
}: {
  open: boolean;
  onClose: () => void;
  /** Re-applies the slider state whenever light/dark changes — otherwise the
   *  inline custom properties set below get stuck at whichever mode was
   *  active on mount (inline styles beat the CSS [data-base="dark"] rules
   *  in app/globals.css, so a stale value silently wins forever). */
  portalTheme: string;
}) {
  const t = useTranslations("shell.appearance");
  const [state, setState] = useState<AppearanceState>(DEFAULT_APPEARANCE);

  useEscToClose(onClose, open);

  useEffect(() => {
    setState(loadAppearance());
  }, []);

  useEffect(() => {
    const root = document.querySelector(".admin-glass") as HTMLElement | null;
    if (root) applyAppearance(root, state);
  }, [state, portalTheme]);

  function update(key: keyof AppearanceState, value: number) {
    setState((s) => ({ ...s, [key]: value }));
  }

  function persist() {
    saveAppearance(state);
    onClose();
  }

  function reset() {
    setState(DEFAULT_APPEARANCE);
    saveAppearance(DEFAULT_APPEARANCE);
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[90]"
            style={{ background: "color-mix(in srgb, var(--text) 25%, transparent)" }}
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 24 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="fixed bottom-3.5 right-3.5 top-3.5 z-[91] w-[314px] overflow-y-auto rounded-[26px] border p-5"
            style={{
              background: "linear-gradient(148deg, var(--refract), transparent 42%), var(--glass)",
              borderColor: "var(--edge)",
              backdropFilter: "blur(var(--blur-lg)) saturate(1.9)",
              WebkitBackdropFilter: "blur(var(--blur-lg)) saturate(1.9)",
              boxShadow: "var(--shadow), inset 0 1px 0 var(--sheen), inset 0 -1px 0 var(--sheen2)",
            }}
          >
            <h2 className="font-display text-xl font-medium text-ink">{t("title")}</h2>
            <p className="mt-1.5 text-[12.5px] leading-[1.5] text-muted">{t("subtitle")}</p>

            <div className="mt-6 flex flex-col gap-5">
              {SLIDERS.map(({ key, min, max, step, unit }) => (
                <div key={key}>
                  <div className="mb-1.5 flex items-center justify-between">
                    <label htmlFor={`appearance-${key}`} className="text-[12.5px] font-semibold text-ink">
                      {t(`sliders.${key}.label`)}
                    </label>
                    <span className="text-[11.5px] tabular-nums text-muted">
                      {state[key]}
                      {unit}
                    </span>
                  </div>
                  <input
                    id={`appearance-${key}`}
                    type="range"
                    min={min}
                    max={max}
                    step={step}
                    value={state[key]}
                    onChange={(e) => update(key, Number(e.target.value))}
                    className="w-full accent-[--brand]"
                  />
                  <p className="mt-1 text-[11px] leading-[1.4] text-muted">{t(`sliders.${key}.hint`)}</p>
                </div>
              ))}
            </div>

            <div className="mt-6 flex gap-2 border-t pt-4" style={{ borderColor: "var(--hair)" }}>
              <button
                type="button"
                onClick={reset}
                className="flex-1 rounded-[10px] border px-3 py-2 text-[12.5px] font-semibold text-ink transition hover:bg-[--glass2]"
                style={{ borderColor: "var(--ring)" }}
              >
                {t("reset")}
              </button>
              <button
                type="button"
                onClick={persist}
                className="flex-1 rounded-[10px] px-3 py-2 text-[12.5px] font-semibold"
                style={{ background: "var(--ink, var(--text))", color: "var(--base)" }}
              >
                {t("apply")}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
