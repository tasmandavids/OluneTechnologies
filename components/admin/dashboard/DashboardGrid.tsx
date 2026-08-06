"use client";

// ============================================================================
//  DashboardGrid — wraps the Today screen's widgets in a draggable/resizable,
//  snap-to-grid layout (react-grid-layout) that persists per studio.
//  Locked by default; "Customize layout" reveals drag handles + resize grips.
//  Below lg it falls back to a plain stacked column — dragging on a phone
//  isn't a real use case and this keeps the original mobile behaviour.
//
//  Measures its own container width instead of react-grid-layout's
//  WidthProvider HOC — v2's WidthProvider has a generic-inference bug against
//  the legacy component's plain function type (infers `{width:number}` only,
//  dropping every other prop), so a small ResizeObserver does the same job.
//
//  Widget heights are content-driven, not user-set: each widget is measured
//  (ResizeObserver) and its layout item is sized to exactly that height, so a
//  box can never clip or leave dead space when its content changes. Rows are
//  1px for that reason, and resizing is horizontal-only — width and position
//  are the user's, height belongs to the content.
// ============================================================================

import { useCallback, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import GridLayout, { type Layout } from "react-grid-layout/legacy";
import "react-grid-layout/css/styles.css";
import { saveDashboardLayout } from "@/app/portal/admin/dashboard-actions";
import {
  DASHBOARD_GRID_COLS,
  DASHBOARD_ROW_HEIGHT,
  normalizeLayout,
  type WidgetId,
  type WidgetLayoutItem,
} from "./widget-registry";
import { IconLayoutGrid, IconGrip, IconCheck } from "./icons";

const WIDGET_ORDER: WidgetId[] = ["attention", "staff", "timeline", "cashin", "quickactions"];

/** Column gutter between widgets. */
const GRID_GUTTER = 16;
/** Vertical gap, baked into each item's height (rows carry no margin). */
const GRID_ROW_GAP = 16;

/** Rows (= px) an item needs to hold `height` px of content plus the gap. */
function rowsForHeight(height: number) {
  return Math.max(1, Math.ceil(height) + GRID_ROW_GAP);
}

/** One grid cell: reports its own natural height so the slot can size to it. */
function MeasuredWidget({
  id,
  onMeasure,
  children,
}: {
  id: WidgetId;
  onMeasure: (id: WidgetId, height: number) => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    onMeasure(id, el.offsetHeight);
    const ro = new ResizeObserver((entries) => {
      const h = entries[0]?.borderBoxSize?.[0]?.blockSize ?? entries[0]?.contentRect.height;
      if (h) onMeasure(id, h);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [id, onMeasure]);

  // No h-full here: the wrapper stays at its natural height so what we measure
  // is the content, not the slot we're about to size from it.
  return <div ref={ref}>{children}</div>;
}

function useContainerWidth() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.offsetWidth);
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return { ref, width };
}

export function DashboardGrid({
  savedLayout,
  widgets,
  labels,
}: {
  savedLayout: unknown;
  widgets: Record<WidgetId, ReactNode>;
  /** "Customize" / "Done" button copy. */
  labels: { customize: string; done: string };
}) {
  const [layout, setLayout] = useState<WidgetLayoutItem[]>(() => normalizeLayout(savedLayout));
  const [editing, setEditing] = useState(false);
  const [contentRows, setContentRows] = useState<Partial<Record<WidgetId, number>>>({});
  const [, startTransition] = useTransition();
  const { ref: gridRef, width: gridWidth } = useContainerWidth();

  const handleMeasure = useCallback((id: WidgetId, height: number) => {
    const rows = rowsForHeight(height);
    setContentRows((prev) => (prev[id] === rows ? prev : { ...prev, [id]: rows }));
  }, []);

  /** Saved/dragged positions, with every item sized to its measured content
   *  (the saved `h` is only the first-paint estimate). */
  const sizedLayout = layout.map((item) => {
    const rows = contentRows[item.i];
    return rows ? { ...item, h: rows, minH: rows, maxH: rows } : item;
  });

  const commitLayout = useCallback((next: Layout) => {
    const normalized: WidgetLayoutItem[] = next.map((l) => ({
      i: l.i as WidgetId,
      x: l.x,
      y: l.y,
      w: l.w,
      h: l.h,
    }));
    setLayout(normalized);
    startTransition(() => {
      void saveDashboardLayout(normalized);
    });
  }, []);

  return (
    <>
      {/* Mobile / narrow: plain stacked list, no drag */}
      <div className="flex flex-col gap-4 lg:hidden">
        {WIDGET_ORDER.map((id) => (
          <div key={id}>{widgets[id]}</div>
        ))}
      </div>

      {/* Desktop: draggable, resizable, snap-to-grid */}
      <div className="hidden lg:block">
        <div className="mb-2.5 flex justify-end">
          <button
            type="button"
            onClick={() => setEditing((e) => !e)}
            className="box flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-medium text-ink transition-transform duration-300 hover:bg-[color-mix(in_srgb,var(--brand)_8%,var(--surface))]"
          >
            {editing ? <IconCheck className="h-3.5 w-3.5" /> : <IconLayoutGrid className="h-3.5 w-3.5" />}
            {editing ? labels.done : labels.customize}
          </button>
        </div>

        <div ref={gridRef}>
          {gridWidth > 0 && (
            <GridLayout
              width={gridWidth}
              className="layout"
              layout={sizedLayout}
              cols={DASHBOARD_GRID_COLS}
              rowHeight={DASHBOARD_ROW_HEIGHT}
              margin={[GRID_GUTTER, 0]}
              containerPadding={[0, 0]}
              isDraggable={editing}
              isResizable={editing}
              resizeHandles={["e"]}
              draggableHandle=".widget-drag-handle"
              onDragStop={commitLayout}
              onResizeStop={commitLayout}
              compactType="vertical"
            >
              {WIDGET_ORDER.map((id) => (
                <div key={id} className="relative">
                  {editing && (
                    <div
                      className="widget-drag-handle absolute left-1/2 top-1.5 z-10 flex h-6 w-9 -translate-x-1/2 cursor-grab items-center justify-center rounded-full text-muted active:cursor-grabbing"
                      style={{ background: "var(--surface)", border: "1px solid var(--edge)" }}
                    >
                      <IconGrip className="h-4 w-4" />
                    </div>
                  )}
                  <MeasuredWidget id={id} onMeasure={handleMeasure}>
                    {widgets[id]}
                  </MeasuredWidget>
                </div>
              ))}
            </GridLayout>
          )}
        </div>
      </div>
    </>
  );
}
