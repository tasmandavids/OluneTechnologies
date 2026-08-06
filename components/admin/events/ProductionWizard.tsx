"use client";

// ============================================================================
//  ProductionWizard — full-screen overlay wizard
//  Steps: 1 Details → 2 Venue → 3 Team → 4 Cast → 5 Builder → 6 Review
// ============================================================================

import { useState, useTransition, useCallback } from "react";
import {
  type WizardFormState,
  type EventType,
  type StageType,
  type PerformanceDraft,
  type CrewDraft,
  type CastGroupDraft,
  type CastMemberDraft,
  initProductionEvent,
  saveVenueStep,
  saveTeamStep,
  saveCastStep,
  finalizeEvent,
} from "@/app/portal/admin/events/actions";
import type { ProfileRow, ClassRow } from "./EventsManager";
import { BuilderStep } from "./builder/BuilderStep";

// ─── Constants ────────────────────────────────────────────────────────────────

const STEPS = [
  { id: 1, label: "Details"  },
  { id: 2, label: "Venue"    },
  { id: 3, label: "Team"     },
  { id: 4, label: "Cast"     },
  { id: 5, label: "Builder"  },
  { id: 6, label: "Review"   },
] as const;

const EVENT_TYPES: { value: EventType; label: string }[] = [
  { value: "recital",     label: "Recital"     },
  { value: "showcase",    label: "Showcase"    },
  { value: "concert",     label: "Concert"     },
  { value: "competition", label: "Competition" },
  { value: "workshop",    label: "Workshop"    },
  { value: "other",       label: "Other"       },
];

const STAGE_TYPES: { value: StageType; label: string; desc: string }[] = [
  { value: "proscenium",   label: "Proscenium",     desc: "Classic arch stage, audience faces front" },
  { value: "thrust",       label: "Thrust",          desc: "Stage extends into audience" },
  { value: "in_the_round", label: "In the Round",    desc: "Audience surrounds the stage" },
  { value: "black_box",    label: "Black Box",       desc: "Flexible seating arrangement" },
  { value: "other",        label: "Other",            desc: "Custom / outdoor / non-traditional" },
];

// ─── Shared UI helpers ────────────────────────────────────────────────────────

function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">
      {children}{required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-xl border border-[--hair] bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition ${props.className ?? ""}`}
    />
  );
}

function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`w-full rounded-xl border border-[--hair] bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition resize-none ${props.className ?? ""}`}
    />
  );
}

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`w-full rounded-xl border border-[--hair] bg-surface px-3.5 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition appearance-none cursor-pointer ${props.className ?? ""}`}
    />
  );
}

function ErrorMsg({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return (
    <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-start gap-2">
      <svg className="w-4 h-4 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
      </svg>
      {msg}
    </div>
  );
}

// ─── Step 1: Details ─────────────────────────────────────────────────────────

function Step1Details({
  state,
  update,
}: {
  state: WizardFormState;
  update: (patch: Partial<WizardFormState>) => void;
}) {
  const addPerf = () =>
    update({
      performances: [
        ...state.performances,
        { date: "", doorsOpen: "", curtainUp: "", expectedEnd: "", notes: "" },
      ],
    });

  const removePerf = (i: number) =>
    update({ performances: state.performances.filter((_, idx) => idx !== i) });

  const patchPerf = (i: number, patch: Partial<PerformanceDraft>) =>
    update({
      performances: state.performances.map((p, idx) =>
        idx === i ? { ...p, ...patch } : p
      ),
    });

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div>
        <Label required>Event name</Label>
        <Input
          placeholder="e.g. Spring Showcase 2026"
          value={state.name}
          onChange={e => update({ name: e.target.value })}
          autoFocus
        />
      </div>

      <div>
        <Label required>Event type</Label>
        <div className="grid grid-cols-3 gap-2">
          {EVENT_TYPES.map(t => (
            <button
              key={t.value}
              type="button"
              onClick={() => update({ eventType: t.value })}
              className={`rounded-xl border py-2.5 text-sm font-medium transition ${
                state.eventType === t.value
                  ? "border-brand bg-brand/10 text-brand"
                  : "border-[--hair] bg-surface text-ink hover:border-brand/40"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <Label>Description</Label>
        <Textarea
          placeholder="Brief overview of the event…"
          value={state.description}
          onChange={e => update({ description: e.target.value })}
          rows={3}
        />
      </div>

      {/* Performances */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <Label>Performance dates</Label>
          <button
            type="button"
            onClick={addPerf}
            className="text-xs font-semibold text-brand hover:text-brand/80 transition flex items-center gap-1"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add date
          </button>
        </div>

        <div className="space-y-4">
          {state.performances.map((p, i) => (
            <div key={i} className="box rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-muted uppercase tracking-wide">
                  {state.performances.length > 1 ? `Performance ${i + 1}` : "Performance date"}
                </span>
                {state.performances.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removePerf(i)}
                    className="text-xs text-red-500 hover:text-red-700 transition"
                  >
                    Remove
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label required>Date</Label>
                  <Input type="date" value={p.date} onChange={e => patchPerf(i, { date: e.target.value })} />
                </div>
                <div>
                  <Label>Doors open</Label>
                  <Input type="time" value={p.doorsOpen} onChange={e => patchPerf(i, { doorsOpen: e.target.value })} />
                </div>
                <div>
                  <Label required>Curtain up</Label>
                  <Input type="time" value={p.curtainUp} onChange={e => patchPerf(i, { curtainUp: e.target.value })} />
                </div>
                <div>
                  <Label>Expected end</Label>
                  <Input type="time" value={p.expectedEnd} onChange={e => patchPerf(i, { expectedEnd: e.target.value })} />
                </div>
              </div>
              <div>
                <Label>Notes for this performance</Label>
                <Input placeholder="e.g. Matinee, No interval" value={p.notes} onChange={e => patchPerf(i, { notes: e.target.value })} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Step 2: Venue ────────────────────────────────────────────────────────────

function Step2Venue({
  state,
  update,
}: {
  state: WizardFormState;
  update: (patch: Partial<WizardFormState>) => void;
}) {
  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div>
        <Label>Venue name</Label>
        <Input
          placeholder="e.g. Wellington Town Hall"
          value={state.venueName}
          onChange={e => update({ venueName: e.target.value })}
        />
      </div>
      <div>
        <Label>Address</Label>
        <Input
          placeholder="Full address"
          value={state.venueAddress}
          onChange={e => update({ venueAddress: e.target.value })}
        />
      </div>

      <div>
        <Label>Stage type</Label>
        <div className="grid grid-cols-1 gap-2">
          {STAGE_TYPES.map(s => (
            <button
              key={s.value}
              type="button"
              onClick={() => update({ stageType: s.value })}
              className={`rounded-xl border px-4 py-3 text-left transition ${
                state.stageType === s.value
                  ? "border-brand bg-brand/10"
                  : "border-[--hair] bg-surface hover:border-brand/40"
              }`}
            >
              <div className={`text-sm font-semibold ${state.stageType === s.value ? "text-brand" : "text-ink"}`}>{s.label}</div>
              <div className="text-xs text-muted mt-0.5">{s.desc}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Stage width (m)</Label>
          <Input
            type="number"
            placeholder="e.g. 12"
            value={state.stageWidthM}
            onChange={e => update({ stageWidthM: e.target.value })}
            min="0" step="0.5"
          />
        </div>
        <div>
          <Label>Stage depth (m)</Label>
          <Input
            type="number"
            placeholder="e.g. 8"
            value={state.stageDepthM}
            onChange={e => update({ stageDepthM: e.target.value })}
            min="0" step="0.5"
          />
        </div>
      </div>

      <div>
        <Label>Venue notes</Label>
        <Textarea
          placeholder="Parking, accessibility, load-in dock, key contacts at venue…"
          value={state.venueNotes}
          onChange={e => update({ venueNotes: e.target.value })}
          rows={3}
        />
      </div>
      <div>
        <Label>Technical notes</Label>
        <Textarea
          placeholder="Sound system specs, lighting rig details, AV contacts, special requirements…"
          value={state.techNotes}
          onChange={e => update({ techNotes: e.target.value })}
          rows={3}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Ticket price (NZD)</Label>
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted text-sm">$</span>
            <Input
              type="number"
              className="pl-7"
              placeholder="0.00"
              value={state.ticketPrice > 0 ? (state.ticketPrice / 100).toFixed(2) : ""}
              onChange={e => update({ ticketPrice: Math.round(parseFloat(e.target.value || "0") * 100) })}
              min="0" step="0.01"
            />
          </div>
          <p className="text-xs text-muted mt-1">Leave at $0 for free entry</p>
        </div>
        <div>
          <Label>Total tickets</Label>
          <Input
            type="number"
            placeholder="100"
            value={state.totalTickets || ""}
            onChange={e => update({ totalTickets: parseInt(e.target.value || "100") })}
            min="1"
          />
        </div>
      </div>
    </div>
  );
}

// ─── Step 3: Team ─────────────────────────────────────────────────────────────

const CREW_ROLE_PRESETS = [
  "Stage Manager", "Technical Director", "Lighting Designer",
  "Sound Operator", "Choreographer", "Costume Coordinator",
  "Front of House", "Backstage Assistant",
];

function Step3Team({
  state,
  update,
  profiles,
}: {
  state: WizardFormState;
  update: (patch: Partial<WizardFormState>) => void;
  profiles: ProfileRow[];
}) {
  const addCrew = () =>
    update({
      crew: [
        ...state.crew,
        { displayName: "", roleLabel: "", phone: "", email: "", isExternal: false },
      ],
    });

  const removeCrew = (i: number) =>
    update({ crew: state.crew.filter((_, idx) => idx !== i) });

  const patchCrew = (i: number, patch: Partial<CrewDraft>) =>
    update({ crew: state.crew.map((c, idx) => (idx === i ? { ...c, ...patch } : c)) });

  const staffProfiles = profiles.filter(p => p.role === "admin" || p.role === "teacher");

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="box rounded-xl px-4 py-3">
        <p className="text-xs text-muted">
          Add the production team — stage manager, tech director, choreographers, backstage crew. You can link Olune staff or add external people.
        </p>
      </div>

      <div className="space-y-4">
        {state.crew.map((c, i) => (
          <div key={i} className="box rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-muted uppercase tracking-wide">Team member {i + 1}</span>
              <button
                type="button"
                onClick={() => removeCrew(i)}
                className="text-xs text-red-500 hover:text-red-700 transition"
              >
                Remove
              </button>
            </div>

            {/* Link to existing profile or enter manually */}
            <div>
              <Label>From your team (optional)</Label>
              <Select
                value={c.profileId ?? ""}
                onChange={e => {
                  const pid = e.target.value;
                  if (pid) {
                    const prof = staffProfiles.find(p => p.id === pid);
                    patchCrew(i, {
                      profileId:   pid,
                      displayName: prof?.full_name ?? "",
                      email:       prof?.email ?? "",
                      isExternal:  false,
                    });
                  } else {
                    patchCrew(i, { profileId: undefined, isExternal: true });
                  }
                }}
              >
                <option value="">External / manual entry</option>
                {staffProfiles.map(p => (
                  <option key={p.id} value={p.id}>{p.full_name ?? p.email ?? p.id}</option>
                ))}
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label required>Name</Label>
                <Input
                  placeholder="Full name"
                  value={c.displayName}
                  onChange={e => patchCrew(i, { displayName: e.target.value })}
                />
              </div>
              <div>
                <Label required>Role</Label>
                <div className="relative">
                  <Input
                    placeholder="e.g. Stage Manager"
                    list={`crew-roles-${i}`}
                    value={c.roleLabel}
                    onChange={e => patchCrew(i, { roleLabel: e.target.value })}
                  />
                  <datalist id={`crew-roles-${i}`}>
                    {CREW_ROLE_PRESETS.map(r => <option key={r} value={r} />)}
                  </datalist>
                </div>
              </div>
              <div>
                <Label>Phone</Label>
                <Input
                  type="tel"
                  placeholder="+64 21 000 0000"
                  value={c.phone}
                  onChange={e => patchCrew(i, { phone: e.target.value })}
                />
              </div>
              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  placeholder="name@example.com"
                  value={c.email}
                  onChange={e => patchCrew(i, { email: e.target.value })}
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addCrew}
        className="w-full rounded-xl border-2 border-dashed border-[--hair] py-3 text-sm text-muted hover:border-brand/40 hover:text-brand transition flex items-center justify-center gap-2"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        Add team member
      </button>

      {state.crew.length === 0 && (
        <p className="text-center text-xs text-muted">You can add team members later. This step is optional.</p>
      )}
    </div>
  );
}

// ─── Step 4: Cast ─────────────────────────────────────────────────────────────

function CastMemberRow({
  member,
  onUpdate,
  onRemove,
}: {
  member: CastMemberDraft;
  onUpdate: (patch: Partial<CastMemberDraft>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-2 py-1.5">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-ink truncate">{member.displayName}</p>
      </div>
      <Input
        placeholder="Role (e.g. Lead)"
        value={member.roleLabel}
        onChange={e => onUpdate({ roleLabel: e.target.value })}
        className="w-36 text-xs py-1.5 px-2.5"
      />
      <Input
        placeholder="Costume"
        value={member.baseCostume}
        onChange={e => onUpdate({ baseCostume: e.target.value })}
        className="w-40 text-xs py-1.5 px-2.5"
      />
      <button
        type="button"
        onClick={onRemove}
        className="p-1 text-muted hover:text-red-500 transition shrink-0"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

function Step4Cast({
  state,
  update,
  profiles,
  classes,
}: {
  state: WizardFormState;
  update: (patch: Partial<WizardFormState>) => void;
  profiles: ProfileRow[];
  classes: ClassRow[];
}) {
  const [showImport, setShowImport] = useState<string | null>(null); // group id being imported to
  const [addGroupName, setAddGroupName] = useState("");

  const studentProfiles = profiles.filter(p => p.role === "student");

  const addGroup = () => {
    if (!addGroupName.trim()) return;
    update({
      castGroups: [
        ...state.castGroups,
        { name: addGroupName.trim(), sortOrder: state.castGroups.length, members: [] },
      ],
    });
    setAddGroupName("");
  };

  const removeGroup = (gi: number) =>
    update({ castGroups: state.castGroups.filter((_, i) => i !== gi) });

  const patchGroup = (gi: number, patch: Partial<CastGroupDraft>) =>
    update({ castGroups: state.castGroups.map((g, i) => (i === gi ? { ...g, ...patch } : g)) });

  const addMemberToGroup = (gi: number, profileId: string) => {
    const prof = studentProfiles.find(p => p.id === profileId);
    if (!prof) return;
    // Don't add duplicate
    if (state.castGroups[gi].members.some(m => m.profileId === profileId)) return;
    const newMember: CastMemberDraft = {
      profileId,
      displayName: prof.full_name ?? prof.email ?? profileId,
      roleLabel: "Ensemble",
      baseCostume: "",
      sortOrder: state.castGroups[gi].members.length,
    };
    patchGroup(gi, { members: [...state.castGroups[gi].members, newMember] });
  };

  const removeMemberFromGroup = (gi: number, mi: number) =>
    patchGroup(gi, { members: state.castGroups[gi].members.filter((_, i) => i !== mi) });

  const patchMember = (gi: number, mi: number, patch: Partial<CastMemberDraft>) =>
    patchGroup(gi, {
      members: state.castGroups[gi].members.map((m, i) => (i === mi ? { ...m, ...patch } : m)),
    });

  // Import all students from a class into a group
  const importFromClass = (gi: number, classId: string) => {
    const cls = classes.find(c => c.id === classId);
    if (!cls) return;
    cls.enrollments.forEach(enr => {
      const prof = Array.isArray(enr.profiles) ? enr.profiles[0] : enr.profiles;
      if (prof?.id) addMemberToGroup(gi, prof.id);
    });
    setShowImport(null);
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="box rounded-xl px-4 py-3">
        <p className="text-xs text-muted">
          Organise performers into groups (e.g. &ldquo;Junior Ensemble&rdquo;, &ldquo;Senior Company&rdquo;). Each cast member gets a role label and base costume note. You can override costumes per-act in the Builder.
        </p>
      </div>

      {/* Groups */}
      {state.castGroups.map((group, gi) => (
        <div key={gi} className="box rounded-xl overflow-hidden">
          {/* Group header */}
          <div className="flex items-center gap-3 px-4 py-3 bg-[--subtle]/40 border-b border-[--hair]">
            <Input
              placeholder="Group name"
              value={group.name}
              onChange={e => patchGroup(gi, { name: e.target.value })}
              className="flex-1 text-sm font-semibold"
            />
            <span className="text-xs text-muted shrink-0">{group.members.length} members</span>
            <button
              type="button"
              onClick={() => setShowImport(showImport === `${gi}` ? null : `${gi}`)}
              className="text-xs font-semibold text-brand hover:text-brand/80 transition shrink-0"
            >
              Import class
            </button>
            <button
              type="button"
              onClick={() => removeGroup(gi)}
              className="text-xs text-red-500 hover:text-red-700 transition shrink-0"
            >
              Remove group
            </button>
          </div>

          {/* Import class dropdown */}
          {showImport === `${gi}` && (
            <div className="box-tint px-4 py-3">
              <p className="text-xs text-muted mb-2">Import all enrolled students from a class:</p>
              <div className="flex gap-2 flex-wrap">
                {classes.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => importFromClass(gi, c.id)}
                    className="rounded-lg border border-brand/30 bg-surface px-3 py-1.5 text-xs font-medium text-brand hover:bg-brand/10 transition"
                  >
                    {c.name} ({c.enrollments.length})
                  </button>
                ))}
                {classes.length === 0 && <span className="text-xs text-muted">No classes found</span>}
              </div>
            </div>
          )}

          {/* Members list */}
          <div className="px-4 py-2">
            {group.members.length === 0 ? (
              <p className="text-xs text-muted text-center py-3">No members yet — add from below or import a class</p>
            ) : (
              <>
                <div className="flex items-center gap-2 py-1 mb-1">
                  <span className="flex-1 text-[10px] font-semibold text-muted uppercase tracking-wide">Name</span>
                  <span className="w-36 text-[10px] font-semibold text-muted uppercase tracking-wide">Role</span>
                  <span className="w-40 text-[10px] font-semibold text-muted uppercase tracking-wide">Base costume</span>
                  <span className="w-5" />
                </div>
                <div className="flex flex-col gap-0.5">
                  {group.members.map((m, mi) => (
                    <CastMemberRow
                      key={mi}
                      member={m}
                      onUpdate={patch => patchMember(gi, mi, patch)}
                      onRemove={() => removeMemberFromGroup(gi, mi)}
                    />
                  ))}
                </div>
              </>
            )}

            {/* Add individual member picker */}
            <div className="pt-2 mt-1">
              <Select
                value=""
                onChange={e => { if (e.target.value) addMemberToGroup(gi, e.target.value); }}
              >
                <option value="">+ Add student…</option>
                {studentProfiles
                  .filter(p => !group.members.some(m => m.profileId === p.id))
                  .map(p => (
                    <option key={p.id} value={p.id}>{p.full_name ?? p.email ?? p.id}</option>
                  ))
                }
              </Select>
            </div>
          </div>
        </div>
      ))}

      {/* Add group */}
      <div className="flex gap-2">
        <Input
          placeholder="New group name (e.g. Junior Ensemble)"
          value={addGroupName}
          onChange={e => setAddGroupName(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addGroup(); } }}
        />
        <button
          type="button"
          onClick={addGroup}
          disabled={!addGroupName.trim()}
          className="rounded-xl bg-brand text-white px-4 py-2.5 text-sm font-semibold hover:bg-brand/90 transition disabled:opacity-40 shrink-0"
        >
          Add group
        </button>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <Label>Quick-change warning threshold (minutes)</Label>
        <Input
          type="number"
          className="w-24"
          value={state.quickChangeThresholdMins}
          onChange={e => update({ quickChangeThresholdMins: parseInt(e.target.value || "10") })}
          min="1" max="60"
        />
        <p className="text-xs text-muted">Flag when a performer appears in consecutive acts with less than this gap</p>
      </div>
    </div>
  );
}

// ─── Step 6: Review + Publish ─────────────────────────────────────────────────

function Step6Review({
  state,
}: {
  state: WizardFormState;
}) {
  const totalCastMembers = state.castGroups.reduce((sum, g) => sum + g.members.length, 0);

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="box rounded-2xl overflow-hidden">
        <div className="px-5 py-4 bg-[--subtle]/30 border-b border-[--hair]">
          <h3 className="text-sm font-bold text-ink">{state.name || "Unnamed event"}</h3>
          <p className="text-xs text-muted capitalize mt-0.5">{state.eventType}</p>
        </div>
        <div className="flex flex-col">
          <ReviewRow
            label="Performances"
            value={`${state.performances.length} date${state.performances.length !== 1 ? "s" : ""}`}
          />
          <ReviewRow label="Venue" value={state.venueName || "—"} />
          <ReviewRow label="Stage" value={state.stageType.replace("_", " ")} />
          <ReviewRow label="Team members" value={`${state.crew.length}`} />
          <ReviewRow label="Cast groups" value={`${state.castGroups.length} groups · ${totalCastMembers} performers`} />
          <ReviewRow
            label="Tickets"
            value={`${state.ticketPrice === 0 ? "Free" : `$${(state.ticketPrice / 100).toFixed(2)}`} · ${state.totalTickets} capacity`}
          />
        </div>
      </div>

      <div className="rounded-xl bg-green-50 border border-green-200 px-4 py-3">
        <p className="text-sm text-green-800 font-medium">Ready to publish?</p>
        <p className="text-xs text-green-700 mt-0.5">
          Publishing makes this event visible to parents and enables ticket sales. You can unpublish at any time.
        </p>
      </div>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-5 py-3">
      <span className="text-xs text-muted font-medium">{label}</span>
      <span className="text-sm text-ink font-medium capitalize">{value}</span>
    </div>
  );
}

// ─── Wizard shell ─────────────────────────────────────────────────────────────

interface ProductionWizardProps {
  initialState: WizardFormState;
  profiles:     ProfileRow[];
  classes:      ClassRow[];
  onClose:      () => void;
}

export function ProductionWizard({ initialState, profiles, classes, onClose }: ProductionWizardProps) {
  const [state, setState]   = useState<WizardFormState>(initialState);
  const [step, setStep]     = useState(initialState.eventId ? 5 : 1);
  const [error, setError]   = useState<string | null>(null);
  const [isPending, start]  = useTransition();

  const update = useCallback((patch: Partial<WizardFormState>) => {
    setState(prev => ({ ...prev, ...patch }));
    setError(null);
  }, []);

  const isEditing = !!state.eventId;

  // ── Navigation ──────────────────────────────────────────────────────────────

  const goNext = () => {
    setError(null);
    if (step === 1) {
      if (!state.name.trim()) { setError("Event name is required"); return; }
      if (state.performances.some(p => !p.date || !p.curtainUp)) {
        setError("Each performance needs a date and curtain-up time"); return;
      }
      if (!isEditing) {
        // Create the event on step 1 completion
        start(async () => {
          const res = await initProductionEvent(state);
          if (!res.ok) { setError(res.error); return; }
          setState(prev => ({ ...prev, eventId: res.eventId }));
          setStep(2);
        });
        return;
      }
    }
    if (step === 2) {
      start(async () => {
        if (!state.eventId) return;
        const res = await saveVenueStep(state.eventId, state);
        if (!res.ok) { setError(res.error); return; }
        setStep(3);
      });
      return;
    }
    if (step === 3) {
      start(async () => {
        if (!state.eventId) return;
        const res = await saveTeamStep(state.eventId, state.crew);
        if (!res.ok) { setError(res.error); return; }
        setStep(4);
      });
      return;
    }
    if (step === 4) {
      start(async () => {
        if (!state.eventId) return;
        const res = await saveCastStep(state.eventId, state.castGroups);
        if (!res.ok) { setError(res.error); return; }
        setStep(5);
      });
      return;
    }
    if (step < 6) setStep(s => s + 1);
  };

  const goBack = () => {
    setError(null);
    if (step > 1) setStep(s => s - 1);
  };

  const handlePublish = (publish: boolean) => {
    start(async () => {
      if (!state.eventId) return;
      const res = await finalizeEvent(state.eventId, {
        ticketPrice:  state.ticketPrice,
        totalTickets: state.totalTickets,
        status:       publish ? "published" : "draft",
      });
      if (!res.ok) { setError(res.error); return; }
      onClose();
    });
  };

  const isBuilderStep = step === 5;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-surface overflow-hidden">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-[--hair] bg-surface">
        <div className="flex items-center gap-4">
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[--subtle] text-muted hover:text-ink transition"
            title="Close wizard"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <h1 className="text-base font-bold text-ink">
            {isEditing ? `Editing: ${state.name || "Event"}` : "New Event"}
          </h1>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-1">
          {STEPS.map((s, i) => {
            const done    = step > s.id;
            const current = step === s.id;
            return (
              <button
                key={s.id}
                onClick={() => {
                  // Allow jumping back to any completed step, or to step 5 if event exists
                  if (done || (s.id === 5 && state.eventId)) setStep(s.id);
                }}
                disabled={!done && !(s.id === 5 && state.eventId)}
                className="flex items-center gap-1 disabled:cursor-default"
              >
                <div className={`
                  w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold transition
                  ${current ? "bg-brand text-white"
                    : done    ? "bg-brand/20 text-brand cursor-pointer hover:bg-brand/30"
                    : "bg-[--subtle] text-muted"}
                `}>
                  {done ? (
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  ) : s.id}
                </div>
                <span className={`text-xs font-medium hidden sm:block ${current ? "text-brand" : done ? "text-muted" : "text-muted/60"}`}>
                  {s.label}
                </span>
                {i < STEPS.length - 1 && (
                  <div className={`w-4 h-0.5 rounded-full mx-1 ${done ? "bg-brand/30" : "bg-[--hair]"}`} />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Content ────────────────────────────────────────────────────────── */}
      <div className={`flex-1 overflow-hidden ${isBuilderStep ? "" : "overflow-y-auto"}`}>
        {!isBuilderStep && (
          <div className="max-w-full px-6 py-8">
            {/* Step heading */}
            <div className="mb-8 max-w-2xl mx-auto">
              <h2 className="text-xl font-bold text-ink">
                {step === 1 && "Event details"}
                {step === 2 && "Venue & stage"}
                {step === 3 && "Production team"}
                {step === 4 && "Cast"}
                {step === 6 && "Review & publish"}
              </h2>
              <p className="text-sm text-muted mt-1">
                {step === 1 && "Give your event a name, type, and schedule the performance dates."}
                {step === 2 && "Where is the show happening? Set up the venue and stage specs."}
                {step === 3 && "Add the people running the production — stage managers, tech crew, choreographers."}
                {step === 4 && "Set up cast groups and assign performers. You can import from your class roster."}
                {step === 6 && "Everything looks good — save as draft or publish to go live."}
              </p>
            </div>

            <ErrorMsg msg={error} />

            {step === 1 && <Step1Details state={state} update={update} />}
            {step === 2 && <Step2Venue   state={state} update={update} />}
            {step === 3 && <Step3Team    state={state} update={update} profiles={profiles} />}
            {step === 4 && <Step4Cast    state={state} update={update} profiles={profiles} classes={classes} />}
            {step === 6 && <Step6Review  state={state} />}
          </div>
        )}

        {/* Builder fills the full content area */}
        {isBuilderStep && state.eventId && (
          <BuilderStep
            eventId={state.eventId}
            castGroups={state.castGroups}
            quickChangeThresholdMins={state.quickChangeThresholdMins}
          />
        )}
      </div>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <div className="shrink-0 flex items-center justify-between px-6 py-4 border-t border-[--hair] bg-surface">
        <button
          onClick={goBack}
          disabled={step === 1 || isPending}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-ink bg-[--subtle] hover:bg-[--hair] transition disabled:opacity-40"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          Back
        </button>

        <div className="flex items-center gap-3">
          {step === 6 ? (
            <>
              <button
                onClick={() => handlePublish(false)}
                disabled={isPending}
                className="px-5 py-2.5 rounded-xl text-sm font-semibold text-ink bg-[--subtle] hover:bg-[--hair] transition disabled:opacity-40"
              >
                Save draft
              </button>
              <button
                onClick={() => handlePublish(true)}
                disabled={isPending}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-green-600 hover:bg-green-700 transition disabled:opacity-40"
              >
                {isPending ? "Publishing…" : "Publish event"}
                {!isPending && (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                )}
              </button>
            </>
          ) : (
            <button
              onClick={goNext}
              disabled={isPending}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-brand hover:bg-brand/90 transition disabled:opacity-40"
            >
              {isPending ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Saving…
                </>
              ) : (
                <>
                  {step === 5 ? "Review" : "Next"}
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Error for builder step / footer area */}
      {error && isBuilderStep && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50">
          <div className="rounded-xl bg-red-600 text-white px-4 py-2.5 text-sm font-medium shadow-lg">
            {error}
          </div>
        </div>
      )}
    </div>
  );
}
