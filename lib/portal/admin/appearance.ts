// ============================================================================
//  Admin "Appearance" panel state — personal, cosmetic glass-intensity
//  preferences (tint / glass clarity / blur depth / ambience). Deliberately
//  does NOT include an accent-colour picker: the studio's brand colour
//  (--brand) already comes from the studio's branding settings and flows
//  through the whole portal, not just admin — a second accent control here
//  would fight it. These sliders instead scale --brand's existing presence
//  in the glass tokens defined in app/globals.css (.admin-glass).
// ============================================================================

export type AppearanceState = {
  tint: number; // 0–180, %, default 100
  glass: number; // 12–92, %, default 56
  blur: number; // 6–70, px, default 32
  ambience: number; // 0–150, %, default 100
};

export const APPEARANCE_STORAGE_KEY = "olune.admin.appearance";

export const DEFAULT_APPEARANCE: AppearanceState = {
  tint: 100,
  glass: 56,
  blur: 32,
  ambience: 100,
};

const TINT_BASE_PERCENTS = { t1: 13, t2: 22, t3: 34, tb: 46, tg: 62 } as const;

export function loadAppearance(): AppearanceState {
  if (typeof window === "undefined") return DEFAULT_APPEARANCE;
  try {
    const raw = window.localStorage.getItem(APPEARANCE_STORAGE_KEY);
    if (!raw) return DEFAULT_APPEARANCE;
    const parsed = JSON.parse(raw) as Partial<AppearanceState>;
    return { ...DEFAULT_APPEARANCE, ...parsed };
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

export function saveAppearance(state: AppearanceState) {
  try {
    window.localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore (private browsing / storage full) */
  }
}

const clampPct = (n: number) => Math.max(0, Math.min(100, n));

/** Writes the slider state as inline CSS custom properties onto `root`
 *  (the .admin-glass shell element). Reads the live light/dark base off
 *  root's closest [data-base] ancestor so tint/glass scale the same way
 *  the design's own applyProps() did. */
export function applyAppearance(root: HTMLElement, state: AppearanceState) {
  const isDark = (root.closest("[data-base]") as HTMLElement | null)?.dataset.base === "dark";
  const darkTintFactor = isDark ? 0.78 : 1;
  const tintFactor = (state.tint / 100) * darkTintFactor;

  for (const [key, basePercent] of Object.entries(TINT_BASE_PERCENTS)) {
    root.style.setProperty(`--${key}`, `color-mix(in srgb, var(--brand) ${clampPct(basePercent * tintFactor)}%, transparent)`);
  }

  const glassFactor = (state.glass / 100) * (isDark ? 0.14 : 1);
  root.style.setProperty("--glass", `rgba(255, 255, 255, ${Math.max(0, glassFactor).toFixed(3)})`);
  root.style.setProperty("--glass2", `rgba(255, 255, 255, ${Math.max(0, glassFactor * (32 / 56)).toFixed(3)})`);

  root.style.setProperty("--blur", `${state.blur}px`);
  root.style.setProperty("--blur-lg", `${Math.round(state.blur * 1.4375)}px`);
  root.style.setProperty("--amb", `${state.ambience / 100}`);
}
