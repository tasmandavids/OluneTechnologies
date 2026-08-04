"use client";

// ============================================================================
//  AppearancePanel — personal workspace tuning: studio tint (accent colour)
//  plus glass clarity / blur depth / ambience. The accent picker writes --n
//  (the ambient glass tint) only within .admin-glass, never --brand (see
//  lib/portal/admin/appearance.ts) — it's a personal preference, not a
//  change to the studio's actual branding.
// ============================================================================

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";
import { useEscToClose } from "@/lib/useEscToClose";
import { RippleButton } from "./RippleButton";
import {
  applyAppearance,
  loadAppearance,
  saveAppearance,
  DEFAULT_APPEARANCE,
  ACCENT_SWATCHES,
  type AppearanceState,
} from "@/lib/portal/admin/appearance";

type SliderKey = "tint" | "glass" | "blur" | "ambience";

const SLIDERS: { key: SliderKey; min: number; max: number; step: number; unit: string }[] = [
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

  function update(key: SliderKey, value: number) {
    setState((s) => ({ ...s, [key]: value }));
  }

  function setAccent(hex: string | null) {
    setState((s) => ({ ...s, accent: hex }));
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

            <div className="mt-6">
              <p className="mb-1.5 text-[12.5px] font-semibold text-ink">{t("accent.label")}</p>
              <p className="mb-2.5 text-[11px] leading-[1.4] text-muted">{t("accent.hint")}</p>
              <div className="flex flex-wrap gap-2">
                {ACCENT_SWATCHES.map((s) => (
                  <button
                    key={s.hex}
                    type="button"
                    title={s.name}
                    aria-label={s.name}
                    onClick={() => setAccent(s.hex)}
                    className="h-7 w-7 shrink-0 rounded-full transition-transform hover:scale-110"
                    style={{
                      background: s.hex,
                      boxShadow: state.accent === s.hex ? "0 0 0 2px var(--surface), 0 0 0 3.5px var(--n)" : "0 0 0 1px var(--hair)",
                    }}
                  />
                ))}
                <label
                  title={t("accent.custom")}
                  className="relative grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-full text-[10px]"
                  style={{
                    background: "conic-gradient(from 200deg, var(--n), var(--t2), var(--t3), var(--n))",
                    boxShadow: state.accent && !ACCENT_SWATCHES.some((s) => s.hex === state.accent) ? "0 0 0 2px var(--surface), 0 0 0 3.5px var(--n)" : "0 0 0 1px var(--hair)",
                  }}
                >
                  <input
                    type="color"
                    value={state.accent ?? "#b9b5ee"}
                    onChange={(e) => setAccent(e.target.value)}
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                    aria-label={t("accent.custom")}
                  />
                </label>
              </div>
              {state.accent && (
                <button type="button" onClick={() => setAccent(null)} className="mt-2 text-[11px] font-medium text-muted underline">
                  {t("accent.useStudioColor")}
                </button>
              )}
            </div>

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
              <RippleButton
                variant="quiet"
                onClick={reset}
                className="flex-1 !text-ink"
                style={{ border: "1px solid var(--ring)" }}
              >
                {t("reset")}
              </RippleButton>
              <RippleButton variant="solid" onClick={persist} className="flex-1">
                {t("apply")}
              </RippleButton>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
