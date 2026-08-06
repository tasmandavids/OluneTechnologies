"use client";

// ============================================================================
//  ActDetailPanel — edit a single act: title, type, duration, music,
//                   participants + costumes, notes, stage cues button
// ============================================================================

import { useState, useTransition, useCallback } from "react";
import {
  updateAct,
  upsertActParticipants,
  updateParticipantCostume,
  type ActData,
  type ActType,
  type ActParticipantDraft,
  type CastGroupDraft,
  type CastMemberDraft,
} from "@/app/portal/admin/events/actions";
import { MusicCue } from "./MusicCue";
import { StageView } from "./StageView";

// ─── Constants ────────────────────────────────────────────────────────────────

const ACT_TYPES: { value: ActType; label: string; icon: string }[] = [
  { value: "number",       label: "Performance number", icon: "🎭" },
  { value: "speech",       label: "Speech",             icon: "🎤" },
  { value: "awards",       label: "Awards",             icon: "🏆" },
  { value: "intermission", label: "Intermission",       icon: "☕" },
  { value: "video",        label: "Video",              icon: "📽" },
  { value: "scene_change", label: "Scene change",       icon: "🌑" },
  { value: "other",        label: "Other",              icon: "✦" },
];

// ─── Shared UI atoms ──────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-bold text-muted uppercase tracking-wide mb-2">{children}</p>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-xl border border-[--hair] bg-surface px-3.5 py-2 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition ${props.className ?? ""}`}
    />
  );
}

function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`w-full rounded-xl border border-[--hair] bg-surface px-3.5 py-2 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition resize-none ${props.className ?? ""}`}
    />
  );
}

// ─── Participant picker modal ─────────────────────────────────────────────────

function ParticipantPicker({
  castGroups,
  currentIds,
  onAdd,
  onClose,
}: {
  castGroups:  CastGroupDraft[];
  currentIds:  Set<string>;
  onAdd:       (members: CastMemberDraft[]) => void;
  onClose:     () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch]     = useState("");

  const allMembers = castGroups.flatMap(g =>
    g.members.map(m => ({ ...m, groupName: g.name }))
  );

  const available = allMembers.filter(m =>
    !currentIds.has(m.profileId) &&
    (search === "" || m.displayName.toLowerCase().includes(search.toLowerCase()))
  );

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const confirm = () => {
    const members = allMembers.filter(m => selected.has(m.profileId));
    onAdd(members);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-sm flex flex-col max-h-[80vh] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[--hair]">
          <h3 className="text-sm font-bold text-ink">Add cast members</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-[--subtle] text-muted transition">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-4 py-2 border-b border-[--hair]">
          <Input placeholder="Search name…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        <div className="flex-1 overflow-y-auto py-1">
          {available.length === 0 ? (
            <p className="text-xs text-muted text-center py-6">
              {currentIds.size > 0 ? "All cast members are already in this act" : "No cast members set up yet — add them in Step 4"}
            </p>
          ) : (
            available.map(m => (
              <button
                key={m.profileId}
                onClick={() => toggle(m.profileId)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-brand/5 transition ${selected.has(m.profileId) ? "bg-brand/5" : ""}`}
              >
                <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition ${selected.has(m.profileId) ? "border-brand bg-brand" : "border-[--hair]"}`}>
                  {selected.has(m.profileId) && (
                    <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-ink font-medium truncate">{m.displayName}</p>
                  <p className="text-xs text-muted">{m.groupName} · {m.roleLabel}</p>
                </div>
              </button>
            ))
          )}
        </div>

        <div className="px-4 py-3 border-t border-[--hair] flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-xl py-2 text-sm font-semibold text-ink bg-[--subtle] hover:bg-[--hair] transition">
            Cancel
          </button>
          <button
            onClick={confirm}
            disabled={selected.size === 0}
            className="flex-1 rounded-xl py-2 text-sm font-semibold text-white bg-brand hover:bg-brand/90 transition disabled:opacity-40"
          >
            Add {selected.size > 0 ? `(${selected.size})` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Participant row ──────────────────────────────────────────────────────────

function ParticipantRow({
  participant,
  onCostumeChange,
  onRemove,
  actId,
}: {
  participant:    ActParticipantDraft;
  onCostumeChange: (val: string) => void;
  onRemove:       () => void;
  actId:          string;
}) {
  const [, start] = useTransition();
  const [costume, setCostume] = useState(participant.costumeOverride);

  const commitCostume = (val: string) => {
    onCostumeChange(val);
    start(async () => {
      await updateParticipantCostume(actId, participant.castMemberId, val);
    });
  };

  return (
    <div className="flex items-center gap-2 py-1.5 group">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-ink truncate">{participant.displayName}</p>
      </div>
      <div className="relative w-36">
        <input
          type="text"
          placeholder="Costume override…"
          value={costume}
          onChange={e => setCostume(e.target.value)}
          onBlur={e => commitCostume(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") commitCostume((e.target as HTMLInputElement).value); }}
          className="w-full rounded-lg border border-[--hair] bg-[--subtle]/30 px-2.5 py-1.5 text-xs text-ink placeholder:text-muted/60 focus:outline-none focus:ring-1 focus:ring-brand/30 focus:border-brand transition"
        />
      </div>
      <button
        onClick={onRemove}
        className="p-1 text-muted/40 hover:text-red-500 opacity-0 group-hover:opacity-100 transition shrink-0"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

// ─── Duration input ───────────────────────────────────────────────────────────

function DurationInput({
  value,
  onChange,
}: {
  value:    number | null;
  onChange: (secs: number | null) => void;
}) {
  const mins = value !== null ? Math.floor(value / 60).toString() : "";
  const secs = value !== null ? (value % 60).toString().padStart(2, "0") : "";

  const parse = (m: string, s: string) => {
    const totalSecs = (parseInt(m || "0") * 60) + parseInt(s || "0");
    onChange(totalSecs > 0 ? totalSecs : null);
  };

  return (
    <div className="flex items-center gap-1.5">
      <input
        type="number"
        min="0"
        max="999"
        placeholder="0"
        value={mins}
        onChange={e => parse(e.target.value, secs)}
        className="w-14 rounded-xl border border-[--hair] bg-surface px-2 py-2 text-sm text-center text-ink focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition"
      />
      <span className="text-sm text-muted font-medium">m</span>
      <input
        type="number"
        min="0"
        max="59"
        placeholder="00"
        value={secs}
        onChange={e => parse(mins, e.target.value)}
        className="w-14 rounded-xl border border-[--hair] bg-surface px-2 py-2 text-sm text-center text-ink focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition"
      />
      <span className="text-sm text-muted font-medium">s</span>
      {value !== null && (
        <button
          onClick={() => onChange(null)}
          className="text-xs text-muted hover:text-red-500 transition ml-1"
        >
          ✕
        </button>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface ActDetailPanelProps {
  act:        ActData;
  castGroups: CastGroupDraft[];
  onUpdate:   (patch: Partial<ActData>) => void;
}

export function ActDetailPanel({ act, castGroups, onUpdate }: ActDetailPanelProps) {
  const [stageViewOpen, setStageViewOpen]       = useState(false);
  const [pickerOpen, setPickerOpen]             = useState(false);
  const [, startTransition]                     = useTransition();

  const actId = act.id!;

  // ── Field saves ─────────────────────────────────────────────────────────────

  const saveField = useCallback(
    (patch: Partial<Pick<ActData, "title" | "actType" | "durationSecs" | "notes">>) => {
      onUpdate(patch);
      startTransition(async () => {
        await updateAct(actId, patch);
      });
    },
    [actId, onUpdate]
  );

  // ── Participants ─────────────────────────────────────────────────────────────

  const handleAddParticipants = useCallback((members: CastMemberDraft[]) => {
    const newParts: ActParticipantDraft[] = members.map(m => ({
      castMemberId:    m.profileId,
      displayName:     m.displayName,
      costumeOverride: "",
    }));
    const merged = [...act.participants, ...newParts];
    onUpdate({ participants: merged });
    startTransition(async () => {
      await upsertActParticipants(actId, merged);
    });
  }, [actId, act.participants, onUpdate]);

  const handleRemoveParticipant = useCallback((castMemberId: string) => {
    const updated = act.participants.filter(p => p.castMemberId !== castMemberId);
    onUpdate({ participants: updated });
    startTransition(async () => {
      await upsertActParticipants(actId, updated);
    });
  }, [actId, act.participants, onUpdate]);

  const handleCostumeChange = useCallback((castMemberId: string, val: string) => {
    onUpdate({
      participants: act.participants.map(p =>
        p.castMemberId === castMemberId ? { ...p, costumeOverride: val } : p
      ),
    });
  }, [act.participants, onUpdate]);

  const currentParticipantIds = new Set(act.participants.map(p => p.castMemberId));

  return (
    <div className="relative h-full">
      <div className="p-5 space-y-6 pb-24">

        {/* ── Title ──────────────────────────────────────────────────────────── */}
        <div>
          <SectionLabel>Act title</SectionLabel>
          <Input
            placeholder="e.g. Swan Lake Waltz"
            defaultValue={act.title}
            onBlur={e  => saveField({ title: e.target.value })}
            onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            autoFocus
          />
        </div>

        {/* ── Type ───────────────────────────────────────────────────────────── */}
        <div>
          <SectionLabel>Type</SectionLabel>
          <div className="flex flex-wrap gap-1.5">
            {ACT_TYPES.map(t => (
              <button
                key={t.value}
                onClick={() => saveField({ actType: t.value })}
                className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition flex items-center gap-1 ${
                  act.actType === t.value
                    ? "border-brand bg-brand/10 text-brand"
                    : "border-[--hair] text-muted hover:border-brand/30 hover:text-ink"
                }`}
              >
                <span>{t.icon}</span> {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Duration ───────────────────────────────────────────────────────── */}
        <div>
          <SectionLabel>Duration</SectionLabel>
          <DurationInput
            value={act.durationSecs ?? null}
            onChange={v => saveField({ durationSecs: v ?? undefined })}
          />
          <p className="text-xs text-muted mt-1.5">Used for running time and quick-change detection</p>
        </div>

        {/* ── Music ──────────────────────────────────────────────────────────── */}
        <div>
          <SectionLabel>Music cue</SectionLabel>
          <MusicCue
            actId={actId}
            music={act.music}
            onSave={music => onUpdate({ music })}
            onRemove={() => onUpdate({ music: null })}
          />
        </div>

        {/* ── Participants ────────────────────────────────────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <SectionLabel>Cast in this act</SectionLabel>
            {castGroups.some(g => g.members.length > 0) && (
              <button
                onClick={() => setPickerOpen(true)}
                className="text-xs font-semibold text-brand hover:text-brand/80 transition flex items-center gap-1"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                Add cast
              </button>
            )}
          </div>

          {act.participants.length === 0 ? (
            <div className="box rounded-xl py-4 text-center">
              <p className="text-xs text-muted">No cast assigned yet</p>
              {castGroups.length === 0 && (
                <p className="text-xs text-muted/60 mt-0.5">Set up cast groups in Step 4 first</p>
              )}
            </div>
          ) : (
            <div className="box rounded-xl px-3 py-1">
              {/* Column headers */}
              <div className="flex items-center gap-2 py-1.5 mb-0.5">
                <span className="flex-1 text-[10px] font-semibold text-muted/60 uppercase tracking-wide">Performer</span>
                <span className="w-36 text-[10px] font-semibold text-muted/60 uppercase tracking-wide">Costume override</span>
                <span className="w-5" />
              </div>
              <div className="flex flex-col gap-0.5">
                {act.participants.map(p => (
                  <ParticipantRow
                    key={p.castMemberId}
                    participant={p}
                    actId={actId}
                    onCostumeChange={val => handleCostumeChange(p.castMemberId, val)}
                    onRemove={() => handleRemoveParticipant(p.castMemberId)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Notes ──────────────────────────────────────────────────────────── */}
        <div>
          <SectionLabel>Stage manager notes</SectionLabel>
          <Textarea
            placeholder="Props needed, entrance/exit cues, special instructions…"
            defaultValue={act.notes}
            rows={3}
            onBlur={e  => saveField({ notes: e.target.value })}
          />
        </div>

        {/* ── Stage & lighting button ─────────────────────────────────────────── */}
        <div>
          <SectionLabel>Stage & lighting</SectionLabel>
          <button
            onClick={() => setStageViewOpen(true)}
            className="box w-full rounded-xl hover:bg-brand/5 transition px-4 py-3 flex items-center gap-3"
          >
            {/* Mini stage preview */}
            <div className="w-10 h-8 rounded bg-[--subtle]/40 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-muted/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
              </svg>
            </div>
            <div className="flex-1 text-left">
              <p className="text-sm font-semibold text-ink">Open stage view</p>
              <p className="text-xs text-muted">
                {act.cues && act.cues.lights.filter(l => l.active).length > 0
                  ? `${act.cues.lights.filter(l => l.active).length} light${act.cues.lights.filter(l => l.active).length !== 1 ? "s" : ""} set · ${act.cues.backdrop || "no backdrop"}`
                  : "Set lighting positions, backdrop & scenery notes"
                }
              </p>
            </div>
            <svg className="w-4 h-4 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
            </svg>
          </button>
        </div>
      </div>

      {/* ── Participant picker modal ─────────────────────────────────────────── */}
      {pickerOpen && (
        <ParticipantPicker
          castGroups={castGroups}
          currentIds={currentParticipantIds}
          onAdd={handleAddParticipants}
          onClose={() => setPickerOpen(false)}
        />
      )}

      {/* ── Stage view overlay ───────────────────────────────────────────────── */}
      {stageViewOpen && (
        <div className="absolute inset-0 z-10 bg-surface overflow-y-auto">
          <StageView
            actId={actId}
            actTitle={act.title || "Untitled"}
            cues={act.cues}
            participants={act.participants}
            onSave={cues => onUpdate({ cues })}
            onClose={() => setStageViewOpen(false)}
          />
        </div>
      )}
    </div>
  );
}
