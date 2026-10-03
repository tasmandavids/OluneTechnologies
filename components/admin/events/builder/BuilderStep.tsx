"use client";

// ============================================================================
//  BuilderStep — Step 5: the full show builder
//  Split pane: act list (left) + detail panel (right)
//  Running time bar sits above both panes.
// ============================================================================

import { useState, useEffect, useCallback, useTransition } from "react";
import {
  loadBuilderData,
  createAct,
  deleteAct,
  reorderActs,
  type ActData,
  type CastGroupDraft,
  type ActType,
} from "@/app/portal/admin/events/actions";
import { ActCanvas } from "./ActCanvas";
import { ActDetailPanel } from "./ActDetailPanel";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRunningTime(totalSecs: number): string {
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return s > 0 ? `${m}m ${s}s` : `${m}m`;
  return `${s}s`;
}

/** Returns pairs of consecutive act indices where the same performer appears */
function findQuickChanges(
  acts: ActData[],
  thresholdMins: number
): Set<number> {
  const warningIndices = new Set<number>();
  const thresholdSecs = thresholdMins * 60;

  for (let i = 0; i < acts.length - 1; i++) {
    const curr = acts[i];
    const next = acts[i + 1];
    const gap  = curr.durationSecs ?? null;

    // Only flag if we know the gap (duration of current act)
    if (gap === null) continue;
    if (gap >= thresholdSecs) continue;

    const currIds = new Set(curr.participants.map(p => p.castMemberId));
    const hasSharedPerformer = next.participants.some(p => currIds.has(p.castMemberId));
    if (hasSharedPerformer) warningIndices.add(i);
  }
  return warningIndices;
}

// ─── Running time bar ─────────────────────────────────────────────────────────

function RunningTimeBar({
  acts,
  quickChangeCount,
}: {
  acts: ActData[];
  quickChangeCount: number;
}) {
  const totalSecs   = acts.reduce((sum, a) => sum + (a.durationSecs ?? 0), 0);
  const actsWithDur = acts.filter(a => a.durationSecs).length;
  const estimated   = actsWithDur < acts.length;

  return (
    <div className="flex items-center gap-4 px-4 py-2.5 border-b border-(--hair) bg-(--t1)/30 shrink-0">
      <div className="flex items-center gap-2">
        <svg className="w-4 h-4 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span className="text-sm font-semibold text-ink">
          {totalSecs > 0 ? formatRunningTime(totalSecs) : "—"}
        </span>
        {estimated && totalSecs > 0 && (
          <span className="text-xs text-muted">(partial)</span>
        )}
      </div>

      <div className="h-3 w-px bg-(--hair)" />

      <div className="flex items-center gap-1.5">
        <div className="w-2 h-2 rounded-full bg-brand/60" />
        <span className="text-xs text-muted">{acts.length} act{acts.length !== 1 ? "s" : ""}</span>
      </div>

      {quickChangeCount > 0 && (
        <>
          <div className="h-3 w-px bg-(--hair)" />
          <div className="flex items-center gap-1.5">
            <svg className="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            <span className="text-xs font-semibold text-amber-600">
              {quickChangeCount} quick change{quickChangeCount !== 1 ? "s" : ""}
            </span>
          </div>
        </>
      )}

      <div className="ml-auto text-xs text-muted">
        Click an act to edit · Drag to reorder
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface BuilderStepProps {
  eventId:                  string;
  castGroups:               CastGroupDraft[];
  quickChangeThresholdMins: number;
}

export function BuilderStep({ eventId, castGroups, quickChangeThresholdMins }: BuilderStepProps) {
  const [acts, setActs]           = useState<ActData[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [, startTransition]       = useTransition();

  // Load acts + cast groups on mount
  useEffect(() => {
    loadBuilderData(eventId).then(res => {
      if (res.ok) {
        setActs(res.acts);
        if (res.acts.length > 0) setSelectedId(res.acts[0].id ?? null);
      } else {
        setError(res.error);
      }
      setLoading(false);
    });
  }, [eventId]);

  // Derive quick-change warnings
  const quickChangeSet   = findQuickChanges(acts, quickChangeThresholdMins);
  const quickChangeCount = quickChangeSet.size;

  const selectedAct = acts.find(a => a.id === selectedId) ?? null;

  // ── Act CRUD ────────────────────────────────────────────────────────────────

  const handleAddAct = useCallback((actType: ActType = "number") => {
    startTransition(async () => {
      const res = await createAct(eventId, {
        title:      "",
        actType,
        notes:      "",
        orderIndex: acts.length,
      });
      if (res.ok) {
        setActs(prev => [...prev, res.act]);
        setSelectedId(res.act.id ?? null);
      }
    });
  }, [eventId, acts.length]);

  const handleDeleteAct = useCallback((actId: string) => {
    startTransition(async () => {
      await deleteAct(actId);
      setActs(prev => {
        const next = prev.filter(a => a.id !== actId);
        // Select previous act (or first)
        if (selectedId === actId) {
          const idx = prev.findIndex(a => a.id === actId);
          const newSel = next[Math.max(0, idx - 1)]?.id ?? null;
          setSelectedId(newSel);
        }
        return next;
      });
    });
  }, [selectedId]);

  const handleReorder = useCallback((newActs: ActData[]) => {
    setActs(newActs);
    const ids = newActs.map(a => a.id).filter((id): id is string => !!id);
    startTransition(async () => {
      await reorderActs(ids);
    });
  }, []);

  // Patch a single act in local state (called from ActDetailPanel after server saves)
  const handleActUpdate = useCallback((actId: string, patch: Partial<ActData>) => {
    setActs(prev => prev.map(a => a.id === actId ? { ...a, ...patch } : a));
  }, []);

  // ── Loading / error states ──────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex items-center gap-3 text-muted">
          <svg className="w-5 h-5 animate-spin text-brand" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-sm font-medium">Loading builder…</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="rounded-xl bg-red-50 border border-red-200 px-6 py-4 text-sm text-red-700 max-w-sm text-center">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Running time bar */}
      <RunningTimeBar acts={acts} quickChangeCount={quickChangeCount} />

      {/* Split pane */}
      <div className="flex-1 overflow-hidden grid grid-cols-[340px_1fr]">
        {/* Act list */}
        <div className="overflow-y-auto border-r border-(--hair) bg-(--t1)/10">
          <ActCanvas
            acts={acts}
            selectedId={selectedId}
            quickChangeIndices={quickChangeSet}
            onSelect={id => setSelectedId(id)}
            onReorder={handleReorder}
            onAddAct={handleAddAct}
            onDeleteAct={handleDeleteAct}
          />
        </div>

        {/* Detail panel */}
        <div className="overflow-y-auto">
          {selectedAct ? (
            <ActDetailPanel
              act={selectedAct}
              castGroups={castGroups}
              onUpdate={patch => handleActUpdate(selectedAct.id!, patch)}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center px-8">
              <div className="w-14 h-14 rounded-2xl bg-brand/10 flex items-center justify-center mb-4">
                <svg className="w-7 h-7 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-ink mb-1">No act selected</p>
              <p className="text-xs text-muted mb-4">Add an act on the left, then click it to edit details.</p>
              <button
                onClick={() => handleAddAct("number")}
                className="rounded-xl bg-brand text-white px-4 py-2 text-sm font-semibold hover:bg-brand/90 transition"
              >
                Add first act
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
