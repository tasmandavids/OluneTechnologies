// ============================================================================
//  Admin dashboard — widget grid registry.
//  Defines the fixed set of "Today" widgets and their default 12-col grid
//  positions. Persisted layouts (dashboard_layouts.layout) are arrays of
//  WidgetLayoutItem keyed by these ids — an unrecognized/missing id is just
//  skipped, so widget rearrangement here doesn't break old saved layouts.
// ============================================================================

export type WidgetId = "attention" | "staff" | "timeline" | "cashin" | "quickactions";

export interface WidgetLayoutItem {
  i: WidgetId;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Mirrors the original static 3-column layout (left/centre/right). */
export const DEFAULT_DASHBOARD_LAYOUT: WidgetLayoutItem[] = [
  { i: "attention", x: 0, y: 0, w: 4, h: 5 },
  { i: "staff", x: 0, y: 5, w: 4, h: 6 },
  { i: "timeline", x: 4, y: 0, w: 4, h: 11 },
  { i: "cashin", x: 8, y: 0, w: 4, h: 5 },
  { i: "quickactions", x: 8, y: 5, w: 4, h: 6 },
];

export const DASHBOARD_GRID_COLS = 12;
export const DASHBOARD_ROW_HEIGHT = 28;

/** Merge a saved layout with the defaults: keep saved positions for known
 *  widgets, fall back to the default slot for anything missing/unknown
 *  (new widget shipped since the layout was saved, or a corrupt row). */
export function normalizeLayout(saved: unknown): WidgetLayoutItem[] {
  const validIds = new Set(DEFAULT_DASHBOARD_LAYOUT.map((w) => w.i));
  const byId = new Map<WidgetId, WidgetLayoutItem>();

  if (Array.isArray(saved)) {
    for (const item of saved) {
      if (
        item &&
        typeof item === "object" &&
        validIds.has((item as { i?: string }).i as WidgetId) &&
        Number.isFinite((item as { x?: number }).x) &&
        Number.isFinite((item as { y?: number }).y) &&
        Number.isFinite((item as { w?: number }).w) &&
        Number.isFinite((item as { h?: number }).h)
      ) {
        const i = (item as { i: WidgetId }).i;
        byId.set(i, item as WidgetLayoutItem);
      }
    }
  }

  return DEFAULT_DASHBOARD_LAYOUT.map((def) => byId.get(def.i) ?? def);
}
