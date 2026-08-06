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
  const [, startTransition] = useTransition();
  const { ref: gridRef, width: gridWidth } = useContainerWidth();

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
              layout={layout}
              cols={DASHBOARD_GRID_COLS}
              rowHeight={DASHBOARD_ROW_HEIGHT}
              margin={[16, 16]}
              containerPadding={[0, 0]}
              isDraggable={editing}
              isResizable={editing}
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
                  <div className="h-full overflow-y-auto">{widgets[id]}</div>
                </div>
              ))}
            </GridLayout>
          )}
        </div>
      </div>
    </>
  );
}
