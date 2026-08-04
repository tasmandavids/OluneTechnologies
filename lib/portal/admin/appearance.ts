// ============================================================================
//  Admin "Appearance" panel state — personal, cosmetic workspace preferences
//  (studio tint, glass clarity, blur depth, ambience). `accent` is a
//  *personal* override of --brand scoped to .admin-glass only — it doesn't
//  touch the studio's actual branding settings (used on the public site and
//  the rest of the portal), it just lets this one person re-tint their own
//  admin workspace. `null` means "use the studio's brand colour as-is".
// ============================================================================

export type AppearanceState = {
  accent: string | null; // hex, e.g. "#b9b5ee" — null = inherit studio --brand
  tint: number; // 0–180, %, default 100
  glass: number; // 12–92, %, default 56
  blur: number; // 6–70, px, default 32
  ambience: number; // 0–150, %, default 100
};

export const APPEARANCE_STORAGE_KEY = "olune.admin.appearance";

export const DEFAULT_APPEARANCE: AppearanceState = {
  accent: null,
  tint: 100,
  glass: 56,
  blur: 32,
  ambience: 100,
};

export const ACCENT_SWATCHES = [
  { name: "Lumen", hex: "#b9b5ee" },
  { name: "Iris", hex: "#6b66c9" },
  { name: "Seafoam", hex: "#9fd8c8" },
  { name: "Apricot", hex: "#f2b788" },
  { name: "Blush", hex: "#eec4d8" },
  { name: "Sky", hex: "#bcd8f0" },
  { name: "Sand", hex: "#e3d6bf" },
  { name: "Sage", hex: "#c8d6bd" },
  { name: "Slate", hex: "#b6b8c4" },
] as const;

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

  if (state.accent) {
    root.style.setProperty("--brand", state.accent);
    root.style.setProperty("--brand-hot", `color-mix(in srgb, white 22%, ${state.accent})`);
    root.style.setProperty("--brand-deep", `color-mix(in srgb, black 28%, ${state.accent})`);
  } else {
    root.style.removeProperty("--brand");
    root.style.removeProperty("--brand-hot");
    root.style.removeProperty("--brand-deep");
  }

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
