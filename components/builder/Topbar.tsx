// ============================================================================
//  components/builder/Topbar.tsx — viewport switcher, history, zoom, save.
// ============================================================================

"use client";

import { useEffect, useState } from "react";
import { useBuilder } from "@/lib/builder/store";
import { BREAKPOINTS, type BreakpointId } from "@/lib/builder/schema";
import { useStudioHost } from "./HostContext";

const BP_ICON: Record<string, string> = { desktop: "🖥", tablet: "▭", mobile: "▯" };

function PublishMenu() {
  const host = useStudioHost();
  const [open, setOpen] = useState(false);
  const [asHome, setAsHome] = useState(host.isHome);
  const [showInNav, setShowInNav] = useState(host.showInNav);

  // Keep the draft toggles in sync when the server state changes underneath us.
  useEffect(() => {
    setAsHome(host.isHome);
    setShowInNav(host.showInNav);
  }, [host.isHome, host.showInNav]);

  const live = host.status === "published";
  const publicPath = (asHome ? true : host.isHome) ? "/" : `/${host.slug}`;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium ${
          live ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-neutral-200 text-neutral-600 hover:bg-neutral-50"
        }`}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${live ? "bg-emerald-500" : "bg-neutral-400"}`} />
        {live ? "Live" : "Draft"}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-9 z-20 w-64 rounded-lg border border-neutral-200 bg-white p-3 text-xs shadow-xl">
            {live && (
              <a href={publicPath} target="_blank" rel="noreferrer" className="mb-2 block truncate text-violet-600 hover:underline">
                View live → {publicPath}
              </a>
            )}
            <label className="mb-1.5 flex items-center gap-2 text-neutral-600">
              <input type="checkbox" checked={asHome} onChange={(e) => setAsHome(e.target.checked)} />
              Set as home page
            </label>
            <label className="mb-2 flex items-center gap-2 text-neutral-600">
              <input type="checkbox" checked={showInNav} onChange={(e) => setShowInNav(e.target.checked)} />
              Show in navigation
            </label>
            {host.publishError && <p className="mb-2 text-red-600">{host.publishError}</p>}
            <div className="flex gap-2">
              <button
                disabled={host.publishing}
                onClick={() => void host.publish({ asHome, showInNav })}
                className="flex-1 rounded-md bg-emerald-600 px-2 py-1.5 font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {host.publishing ? "…" : live ? "Update" : "Publish"}
              </button>
              {live && (
                <button
                  disabled={host.publishing}
                  onClick={() => void host.unpublish()}
                  className="rounded-md border border-neutral-200 px-2 py-1.5 text-neutral-500 hover:bg-neutral-50 disabled:opacity-50"
                >
                  Unpublish
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function Topbar({
  saving,
  onSave,
  onExit,
}: {
  saving: boolean;
  onSave: () => void;
  onExit?: () => void;
}) {
  const breakpoint = useBuilder((s) => s.breakpoint);
  const setBreakpoint = useBuilder((s) => s.setBreakpoint);
  const zoom = useBuilder((s) => s.zoom);
  const setZoom = useBuilder((s) => s.setZoom);
  const mode = useBuilder((s) => s.mode);
  const setMode = useBuilder((s) => s.setMode);
  const cascade = useBuilder((s) => s.doc.cascade);
  const setCascade = useBuilder((s) => s.setCascade);
  const canUndo = useBuilder((s) => s.past.length > 0);
  const canRedo = useBuilder((s) => s.future.length > 0);
  const dirty = useBuilder((s) => s.dirty);
  const undo = useBuilder((s) => s.undo);
  const redo = useBuilder((s) => s.redo);

  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-black/10 bg-white px-3 text-sm">
      <div className="flex items-center gap-2">
        {onExit && (
          <button onClick={onExit} className="rounded-md px-2 py-1 text-neutral-500 hover:bg-neutral-100" title="Back">
            ←
          </button>
        )}
        <span className="font-semibold text-neutral-800">Studio</span>
        <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-700">v2</span>
      </div>

      {/* breakpoint switcher */}
      <div className="flex items-center gap-1 rounded-lg bg-neutral-100 p-0.5">
        {BREAKPOINTS.map((bp) => (
          <button
            key={bp.id}
            onClick={() => setBreakpoint(bp.id as BreakpointId)}
            title={`${bp.label} (${bp.width}px)`}
            className={`rounded-md px-2.5 py-1 text-xs transition ${
              breakpoint === bp.id ? "bg-white shadow-sm text-neutral-900" : "text-neutral-500 hover:text-neutral-800"
            }`}
          >
            {BP_ICON[bp.icon]} <span className="hidden lg:inline">{bp.label.split(" ")[0]}</span>
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        {/* cascade direction */}
        <button
          onClick={() => setCascade(cascade === "desktop-first" ? "mobile-first" : "desktop-first")}
          className="rounded-md border border-neutral-200 px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-50"
          title="Responsive cascade direction"
        >
          {cascade === "desktop-first" ? "Desktop-first" : "Mobile-first"}
        </button>

        {/* history */}
        <div className="flex items-center">
          <button disabled={!canUndo} onClick={undo} className="rounded-md px-2 py-1 text-neutral-600 disabled:opacity-30 hover:bg-neutral-100" title="Undo (⌘Z)">↶</button>
          <button disabled={!canRedo} onClick={redo} className="rounded-md px-2 py-1 text-neutral-600 disabled:opacity-30 hover:bg-neutral-100" title="Redo (⌘⇧Z)">↷</button>
        </div>

        {/* zoom */}
        <div className="flex items-center gap-1 text-xs text-neutral-500">
          <button onClick={() => setZoom(zoom - 0.1)} className="rounded px-1 hover:bg-neutral-100">−</button>
          <span className="w-9 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom(zoom + 0.1)} className="rounded px-1 hover:bg-neutral-100">+</button>
        </div>

        {/* preview toggle */}
        <button
          onClick={() => setMode(mode === "design" ? "preview" : "design")}
          className="rounded-md border border-neutral-200 px-3 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
        >
          {mode === "design" ? "▶ Preview" : "✎ Design"}
        </button>

        <PublishMenu />

        <button
          onClick={onSave}
          disabled={saving}
          className="rounded-md bg-violet-600 px-3 py-1 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
        >
          {saving ? "Saving…" : dirty ? "Save" : "Saved"}
        </button>
      </div>
    </header>
  );
}
