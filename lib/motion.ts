// Shared motion vocabulary. Spread these into <motion.*> so panels, modals,
// tabs, and toasts move identically everywhere:
//
//   <motion.aside {...panelSlide} className="...">
//
// Decorative/one-off animations (landing page, dashboard flourishes) are
// exempt — these tokens are for the interactive chrome.

export const EASE_OUT = [0.32, 0.72, 0, 1] as const;

export const DUR = {
  fast: 0.15,
  base: 0.22,
  slow: 0.32,
} as const;

/** The one panel spring — right-hand slide-over view/edit panels. */
export const PANEL_SPRING = { type: "spring", stiffness: 380, damping: 38 } as const;

export const panelSlide = {
  initial: { x: "100%" },
  animate: { x: 0 },
  exit: { x: "100%" },
  transition: PANEL_SPRING,
} as const;

/** Backdrop behind panels and modals. */
export const overlayFade = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: DUR.fast },
} as const;

/** Modals, cards, toasts — subtle lift in, settle out. */
export const fadeLift = {
  initial: { opacity: 0, y: 12, scale: 0.97 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: 8, scale: 0.97 },
  transition: { duration: DUR.base, ease: EASE_OUT },
} as const;

/** Tab-content swap. */
export const tabSwitch = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
  transition: { duration: DUR.fast, ease: EASE_OUT },
} as const;
