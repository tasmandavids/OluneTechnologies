"use client";

// ============================================================================
//  ActCanvas — draggable act list with arrow connectors + quick-change warnings
// ============================================================================

import { useState } from "react";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { type ActData, type ActType } from "@/app/portal/admin/events/actions";

// ─── Constants ────────────────────────────────────────────────────────────────

const ACT_TYPE_META: Record<ActType, { label: string; color: string }> = {
  number:       { label: "Number",       color: "bg-brand/10 text-brand" },
  speech:       { label: "Speech",       color: "bg-blue-100 text-blue-700" },
  awards:       { label: "Awards",       color: "bg-yellow-100 text-yellow-700" },
  intermission: { label: "Intermission", color: "bg-gray-100 text-gray-600" },
  video:        { label: "Video",        color: "bg-purple-100 text-purple-700" },
  scene_change: { label: "Scene",        color: "bg-orange-100 text-orange-700" },
  other:        { label: "Other",        color: "bg-gray-100 text-gray-500" },
};

const ADD_ACT_TYPES: { type: ActType; label: string; icon: string }[] = [
  { type: "number",       label: "Dance / performance number", icon: "🎭" },
  { type: "intermission", label: "Intermission",               icon: "☕" },
  { type: "speech",       label: "Speech / announcement",      icon: "🎤" },
  { type: "awards",       label: "Awards presentation",        icon: "🏆" },
  { type: "video",        label: "Video / projection",         icon: "📽" },
  { type: "scene_change", label: "Scene change / blackout",    icon: "🌑" },
];

function formatDuration(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m}:${s.toString().padStart(2, "0")}` : `${s}s`;
}

// ─── Arrow connector between acts ─────────────────────────────────────────────

function ActConnector({ hasWarning }: { hasWarning: boolean }) {
  return (
    <div className="flex flex-col items-center py-0.5">
      <div className={`w-px h-3 ${hasWarning ? "bg-amber-400" : "bg-(--hair)"}`} />
      {hasWarning ? (
        <div className="flex flex-col items-center gap-0.5">
          <svg className="w-3.5 h-3.5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
          </svg>
          <span className="text-[9px] font-bold text-amber-600 uppercase tracking-wide">Quick change</span>
        </div>
      ) : (
        // Arrow tip
        <svg width="10" height="6" viewBox="0 0 10 6" className="text-(--hair)">
          <path d="M5 6L0 0h10L5 6z" fill="currentColor" />
        </svg>
      )}
      <div className={`w-px h-3 ${hasWarning ? "bg-amber-400" : "bg-(--hair)"}`} />
    </div>
  );
}

// ─── Single act card ──────────────────────────────────────────────────────────

function ActCard({
  act,
  index,
  isSelected,
  hasWarning,
  dragHandleProps,
  onClick,
}: {
  act:              ActData;
  index:            number;
  isSelected:       boolean;
  hasWarning:       boolean;
  dragHandleProps?: object;
  onClick:          () => void;
}) {
  const meta = ACT_TYPE_META[act.actType];

  return (
    <div
      onClick={onClick}
      className={`
        mx-3 rounded-xl border cursor-pointer transition-all select-none
        ${isSelected
          ? "border-brand bg-brand/5 shadow-sm"
          : "border-(--hair) bg-surface hover:border-brand/40 hover:shadow-sm"
        }
      `}
    >
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        {/* Drag handle */}
        <span
          {...dragHandleProps}
          className="text-muted/40 hover:text-muted cursor-grab active:cursor-grabbing text-xs leading-none"
          onClick={e => e.stopPropagation()}
        >
          ⠿
        </span>

        {/* Number */}
        <span className="text-xs font-bold text-muted w-5 shrink-0 text-center">
          {index + 1}
        </span>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-semibold text-ink truncate">
              {act.title || <span className="text-muted font-normal italic">Untitled</span>}
            </span>
            <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${meta.color}`}>
              {meta.label}
            </span>
          </div>
          {/* Sub-info row */}
          <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted">
            {act.participants.length > 0 && (
              <span>{act.participants.length} cast</span>
            )}
            {act.durationSecs && (
              <span>⏱ {formatDuration(act.durationSecs)}</span>
            )}
            {act.music && (
              <span className="truncate">🎵 {act.music.trackTitle}</span>
            )}
            {act.cues && act.cues.lights.some(l => l.active) && (
              <span>💡</span>
            )}
          </div>
        </div>

        {/* Selected indicator */}
        <svg
          className={`w-3.5 h-3.5 shrink-0 transition ${isSelected ? "text-brand" : "text-transparent"}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
      </div>
    </div>
  );
}

// ─── Add act menu ─────────────────────────────────────────────────────────────

function AddActMenu({ onAdd }: { onAdd: (type: ActType) => void }) {
  const [open, setOpen] = useState<boolean>(false);

  return (
    <div className="relative mx-3 mt-2">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full rounded-xl border-2 border-dashed border-(--hair) py-2.5 text-xs font-semibold text-muted hover:border-brand/40 hover:text-brand transition flex items-center justify-center gap-1.5"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        Add act
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full mb-1 left-0 right-0 z-20 rounded-xl border border-(--hair) bg-surface shadow-lg overflow-hidden">
            {ADD_ACT_TYPES.map(({ type, label, icon }) => (
              <button
                key={type}
                onClick={() => { onAdd(type); setOpen(false); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-ink hover:bg-brand/5 transition text-left"
              >
                <span className="text-base">{icon}</span>
                {label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}


// ─── Main component ───────────────────────────────────────────────────────────

interface ActCanvasProps {
  acts:                ActData[];
  selectedId:          string | null;
  quickChangeIndices:  Set<number>;
  onSelect:            (id: string) => void;
  onReorder:           (acts: ActData[]) => void;
  onAddAct:            (type: ActType) => void;
  onDeleteAct:         (id: string) => void;
}

export function ActCanvas({
  acts,
  selectedId,
  quickChangeIndices,
  onSelect,
  onReorder,
  onAddAct,
}: ActCanvasProps) {

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    if (result.destination.index === result.source.index) return;

    const next = [...acts];
    const [moved] = next.splice(result.source.index, 1);
    next.splice(result.destination.index, 0, moved);
    onReorder(next);
  };

  return (
    <div className="py-3 pb-6 min-h-full flex flex-col">
      {acts.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-4 py-8">
          <p className="text-xs font-semibold text-muted mb-1">No acts yet</p>
          <p className="text-xs text-muted/70 mb-4">Your show lineup appears here</p>
        </div>
      ) : (
        <DragDropContext onDragEnd={handleDragEnd}>
          <Droppable droppableId="acts">
            {(droppableProvided) => (
              <div
                ref={droppableProvided.innerRef}
                {...droppableProvided.droppableProps}
                className="flex flex-col"
              >
                {acts.map((act, i) => (
                  <Draggable
                    key={act.id ?? `tmp-${i}`}
                    draggableId={act.id ?? `tmp-${i}`}
                    index={i}
                  >
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        className={snapshot.isDragging ? "opacity-90 rotate-1 scale-[1.02]" : ""}
                      >
                        <ActCard
                          act={act}
                          index={i}
                          isSelected={act.id === selectedId}
                          hasWarning={quickChangeIndices.has(i)}
                          dragHandleProps={provided.dragHandleProps ?? undefined}
                          onClick={() => act.id && onSelect(act.id)}
                        />
                        {/* Arrow connector */}
                        {i < acts.length - 1 && !snapshot.isDragging && (
                          <ActConnector hasWarning={quickChangeIndices.has(i)} />
                        )}
                      </div>
                    )}
                  </Draggable>
                ))}
                {droppableProvided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      )}

      <AddActMenu onAdd={onAddAct} />
    </div>
  );
}
