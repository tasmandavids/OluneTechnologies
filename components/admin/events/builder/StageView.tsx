"use client";

// ============================================================================
//  StageView — SVG proscenium stage with 19 clickable light positions,
//              colour presets, backdrop/scenery notes, formation grid
// ============================================================================

import { useState, useTransition } from "react";
import {
  saveActCues,
  type ActCueData,
  type LightState,
  type LightColor,
  type ActParticipantDraft,
} from "@/app/portal/admin/events/actions";

// ─── Light definitions ────────────────────────────────────────────────────────

interface LightDef {
  id:    string;
  label: string;
  x:     number;
  y:     number;
  zone:  "foh" | "sl" | "sr" | "back" | "foot";
}

// SVG viewBox: 0 0 400 320
// Stage opening: x=60 y=90 w=280 h=170 (bottom at y=260)
const LIGHTS: LightDef[] = [
  // Front-of-house (above proscenium arch)
  { id: "FOH-1", label: "FOH L2",   x: 100, y: 48,  zone: "foh"  },
  { id: "FOH-2", label: "FOH L1",   x: 142, y: 40,  zone: "foh"  },
  { id: "FOH-3", label: "FOH C",    x: 200, y: 36,  zone: "foh"  },
  { id: "FOH-4", label: "FOH R1",   x: 258, y: 40,  zone: "foh"  },
  { id: "FOH-5", label: "FOH R2",   x: 300, y: 48,  zone: "foh"  },
  // Stage-left booms
  { id: "SL-1",  label: "SL High",  x: 36,  y: 110, zone: "sl"   },
  { id: "SL-2",  label: "SL Mid",   x: 36,  y: 155, zone: "sl"   },
  { id: "SL-3",  label: "SL Low",   x: 36,  y: 200, zone: "sl"   },
  // Stage-right booms
  { id: "SR-1",  label: "SR High",  x: 364, y: 110, zone: "sr"   },
  { id: "SR-2",  label: "SR Mid",   x: 364, y: 155, zone: "sr"   },
  { id: "SR-3",  label: "SR Low",   x: 364, y: 200, zone: "sr"   },
  // Backlights (from flies)
  { id: "BK-1",  label: "Back L",   x: 128, y: 104, zone: "back" },
  { id: "BK-2",  label: "Back C",   x: 200, y: 98,  zone: "back" },
  { id: "BK-3",  label: "Back R",   x: 272, y: 104, zone: "back" },
  // Footlights (downstage)
  { id: "FL-1",  label: "Foot L2",  x: 100, y: 268, zone: "foot" },
  { id: "FL-2",  label: "Foot L1",  x: 138, y: 275, zone: "foot" },
  { id: "FL-3",  label: "Foot C",   x: 200, y: 278, zone: "foot" },
  { id: "FL-4",  label: "Foot R1",  x: 262, y: 275, zone: "foot" },
  { id: "FL-5",  label: "Foot R2",  x: 300, y: 268, zone: "foot" },
];

// ─── Colour presets ───────────────────────────────────────────────────────────

const COLORS: { value: LightColor; label: string; hex: string; glow: string }[] = [
  { value: "warm",  label: "Warm",  hex: "#F0A830", glow: "#F0A83088" },
  { value: "cool",  label: "Cool",  hex: "#80B8FF", glow: "#80B8FF88" },
  { value: "spot",  label: "Spot",  hex: "#FFFFFF", glow: "#FFFFFF99" },
  { value: "red",   label: "Red",   hex: "#FF3333", glow: "#FF333388" },
  { value: "blue",  label: "Blue",  hex: "#3355FF", glow: "#3355FF88" },
  { value: "green", label: "Green", hex: "#33BB55", glow: "#33BB5588" },
  { value: "amber", label: "Amber", hex: "#FF8800", glow: "#FF880088" },
  { value: "white", label: "White", hex: "#F5F5F5", glow: "#F5F5F599" },
];

const COLOR_HEX: Record<LightColor, string> = Object.fromEntries(COLORS.map(c => [c.value, c.hex])) as Record<LightColor, string>;
const COLOR_GLOW: Record<LightColor, string> = Object.fromEntries(COLORS.map(c => [c.value, c.glow])) as Record<LightColor, string>;

function defaultLights(): LightState[] {
  return LIGHTS.map(l => ({ id: l.id, active: false, colorPreset: "warm" as LightColor }));
}

// ─── Colour swatch picker (shown on click) ────────────────────────────────────

function ColorPicker({
  current,
  onSelect,
}: {
  current:  LightColor;
  onSelect: (c: LightColor) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {COLORS.map(c => (
        <button
          key={c.value}
          onClick={() => onSelect(c.value)}
          title={c.label}
          className={`w-7 h-7 rounded-full border-2 transition ${
            current === c.value ? "border-ink scale-110 shadow" : "border-transparent hover:scale-105"
          }`}
          style={{ backgroundColor: c.hex }}
        />
      ))}
    </div>
  );
}

// ─── SVG stage ────────────────────────────────────────────────────────────────

function StageSVG({
  lights,
  selectedLightId,
  onClickLight,
}: {
  lights:          LightState[];
  selectedLightId: string | null;
  onClickLight:    (id: string) => void;
}) {
  const lightMap = new Map(lights.map(l => [l.id, l]));

  return (
    <svg
      viewBox="0 0 400 320"
      xmlns="http://www.w3.org/2000/svg"
      className="w-full max-w-sm mx-auto"
      style={{ userSelect: "none" }}
    >
      {/* ── Stage backdrop / sky ─────────────────────────────────── */}
      <rect x="60" y="90" width="280" height="170" fill="#0a0a0f" rx="2" />

      {/* Stage floor line */}
      <rect x="60" y="255" width="280" height="5" fill="#1a1a2e" />

      {/* Proscenium arch sides */}
      <rect x="52" y="82" width="8"   height="178" fill="#2a2a3a" rx="2" />
      <rect x="340" y="82" width="8"  height="178" fill="#2a2a3a" rx="2" />

      {/* Proscenium arch top */}
      <rect x="52" y="78" width="296" height="8"  fill="#2a2a3a" rx="2" />

      {/* Leg curtains */}
      <rect x="60" y="90" width="18"  height="165" fill="#1e0808" opacity="0.8" />
      <rect x="322" y="90" width="18" height="165" fill="#1e0808" opacity="0.8" />

      {/* Centre back wall / cyclorama */}
      <rect x="78" y="90" width="244" height="165" fill="#0d0d1a" />

      {/* Upstage line (implied) */}
      <line x1="78" y1="108" x2="322" y2="108" stroke="#1a1a2e" strokeWidth="1" />

      {/* Stage labels */}
      <text x="200" y="190" textAnchor="middle" fill="#ffffff22" fontSize="11" fontFamily="sans-serif" fontWeight="bold" letterSpacing="4">STAGE</text>
      <text x="200" y="248" textAnchor="middle" fill="#ffffff18" fontSize="8" fontFamily="sans-serif">DOWNSTAGE</text>
      <text x="200" y="106" textAnchor="middle" fill="#ffffff18" fontSize="8" fontFamily="sans-serif">UPSTAGE</text>
      <text x="75"  y="178" textAnchor="middle" fill="#ffffff15" fontSize="7" fontFamily="sans-serif" transform="rotate(-90 75 178)">STAGE LEFT</text>
      <text x="325" y="178" textAnchor="middle" fill="#ffffff15" fontSize="7" fontFamily="sans-serif" transform="rotate(90 325 178)">STAGE RIGHT</text>

      {/* ── Light glows (rendered behind circles) ─────────────────── */}
      {LIGHTS.map(def => {
        const state = lightMap.get(def.id);
        if (!state?.active) return null;
        const glow = COLOR_GLOW[state.colorPreset];
        // Only render glow for stage-area lights
        return (
          <ellipse
            key={`glow-${def.id}`}
            cx={def.x}
            cy={def.y}
            rx="16"
            ry="16"
            fill={glow}
            style={{ filter: "blur(6px)" }}
          />
        );
      })}

      {/* ── Light circles ─────────────────────────────────────────── */}
      {LIGHTS.map(def => {
        const state    = lightMap.get(def.id);
        const active   = state?.active ?? false;
        const color    = active ? COLOR_HEX[state!.colorPreset] : "transparent";
        const selected = selectedLightId === def.id;

        return (
          <g
            key={def.id}
            onClick={() => onClickLight(def.id)}
            style={{ cursor: "pointer" }}
          >
            {/* Selection ring */}
            {selected && (
              <circle
                cx={def.x}
                cy={def.y}
                r="11"
                fill="none"
                stroke="#FFFFFF"
                strokeWidth="2"
                strokeDasharray="3 2"
              />
            )}
            {/* Outer (inactive) ring */}
            <circle
              cx={def.x}
              cy={def.y}
              r="7"
              fill={color}
              stroke={active ? color : "#444466"}
              strokeWidth="1.5"
            />
            {/* Inner dot for active lights */}
            {active && (
              <circle cx={def.x} cy={def.y} r="3" fill="white" opacity="0.7" />
            )}
            {/* Hover zone (invisible) */}
            <circle cx={def.x} cy={def.y} r="10" fill="transparent" />
          </g>
        );
      })}

      {/* Lighting bar (above proscenium) */}
      <rect x="80" y="58" width="240" height="3" fill="#333344" rx="1" />
      {/* Side boom poles */}
      <line x1="36" y1="88" x2="36" y2="220" stroke="#333344" strokeWidth="2" />
      <line x1="364" y1="88" x2="364" y2="220" stroke="#333344" strokeWidth="2" />
      {/* Footlight trough */}
      <rect x="78" y="262" width="244" height="4" fill="#111122" rx="2" />
    </svg>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface StageViewProps {
  actId:        string;
  actTitle:     string;
  cues:         ActCueData | null;
  participants: ActParticipantDraft[];
  onSave:       (cues: ActCueData) => void;
  onClose:      () => void;
}

export function StageView({ actId, actTitle, cues, participants, onSave, onClose }: StageViewProps) {
  const [lights, setLights]               = useState<LightState[]>(cues?.lights?.length ? cues.lights : defaultLights());
  const [backdrop, setBackdrop]           = useState(cues?.backdrop ?? "");
  const [sceneryNotes, setSceneryNotes]   = useState(cues?.sceneryNotes ?? "");
  const [selectedLightId, setSelectedLightId] = useState<string | null>(null);
  const [isPending, start]                = useTransition();
  const [saved, setSaved]                 = useState(false);

  const selectedLight = lights.find(l => l.id === selectedLightId);
  const selectedDef   = LIGHTS.find(d => d.id === selectedLightId);

  const patchLight = (id: string, patch: Partial<LightState>) => {
    setLights(prev => prev.map(l => l.id === id ? { ...l, ...patch } : l));
    setSaved(false);
  };

  const handleClickLight = (id: string) => {
    if (selectedLightId === id) {
      // Toggle off/on
      const curr = lights.find(l => l.id === id);
      if (curr) patchLight(id, { active: !curr.active });
    } else {
      setSelectedLightId(id);
      // Auto-activate on first selection
      const curr = lights.find(l => l.id === id);
      if (curr && !curr.active) patchLight(id, { active: true });
    }
  };

  const handleColorSelect = (color: LightColor) => {
    if (!selectedLightId) return;
    patchLight(selectedLightId, { colorPreset: color, active: true });
  };

  const handleDeactivateLight = () => {
    if (!selectedLightId) return;
    patchLight(selectedLightId, { active: false });
  };

  const handleSave = () => {
    const cueData: ActCueData = {
      lights,
      backdrop,
      sceneryNotes,
      formations: cues?.formations ?? [],
    };
    onSave(cueData);
    start(async () => {
      await saveActCues(actId, cueData);
      setSaved(true);
    });
  };

  const activeLightCount = lights.filter(l => l.active).length;

  // Quick presets
  const applyPreset = (preset: "blackout" | "full_warm" | "wash_cool" | "spot_c") => {
    setLights(prev => prev.map(l => {
      const def = LIGHTS.find(d => d.id === l.id);
      const zone = def?.zone ?? "";
      switch (preset) {
        case "blackout":   return { ...l, active: false };
        case "full_warm":  return { ...l, active: true,  colorPreset: "warm" as LightColor };
        case "wash_cool":  return { ...l, active: zone === "foh" || zone === "back", colorPreset: "cool" as LightColor };
        case "spot_c":     return { ...l, active: l.id === "FOH-3", colorPreset: "spot" as LightColor };
        default:           return l;
      }
    }));
    setSaved(false);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-[--hair] bg-surface shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[--subtle] text-muted hover:text-ink transition"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
          </button>
          <div>
            <h2 className="text-sm font-bold text-ink">Stage & Lighting</h2>
            <p className="text-xs text-muted">{actTitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {saved && (
            <span className="text-xs text-green-600 font-medium flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              Saved
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={isPending}
            className="rounded-xl bg-brand text-white px-4 py-2 text-sm font-semibold hover:bg-brand/90 transition disabled:opacity-40"
          >
            {isPending ? "Saving…" : "Save cues"}
          </button>
        </div>
      </div>

      {/* Body: stage + controls */}
      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] min-h-full">

          {/* ── Left: stage SVG ──────────────────────────────────────── */}
          <div className="p-5 flex flex-col items-center justify-start bg-[#0a0a14]">
            {/* Presets */}
            <div className="flex flex-wrap gap-2 mb-4 w-full max-w-sm">
              {[
                { key: "blackout",  label: "Blackout",    icon: "⬛" },
                { key: "full_warm", label: "Full warm",   icon: "🟡" },
                { key: "wash_cool", label: "Cool wash",   icon: "🔵" },
                { key: "spot_c",    label: "Centre spot", icon: "⭕" },
              ].map(p => (
                <button
                  key={p.key}
                  onClick={() => applyPreset(p.key as Parameters<typeof applyPreset>[0])}
                  className="rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-white/70 hover:text-white px-3 py-1 text-xs font-medium transition"
                >
                  {p.icon} {p.label}
                </button>
              ))}
            </div>

            <StageSVG
              lights={lights}
              selectedLightId={selectedLightId}
              onClickLight={handleClickLight}
            />

            {/* Legend */}
            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 max-w-sm">
              <p className="w-full text-xs text-white/30 mb-1">
                {activeLightCount > 0
                  ? `${activeLightCount} of ${LIGHTS.length} lights active`
                  : "Click a light to activate · Click again to toggle off"}
              </p>
              {[
                { zone: "foh",  label: "FOH (Front of House)" },
                { zone: "sl",   label: "Stage Left booms" },
                { zone: "sr",   label: "Stage Right booms" },
                { zone: "back", label: "Back / overhead" },
                { zone: "foot", label: "Footlights" },
              ].map(z => (
                <span key={z.zone} className="text-[10px] text-white/25">{z.label}</span>
              ))}
            </div>
          </div>

          {/* ── Right: controls panel ─────────────────────────────────── */}
          <div className="border-l border-[--hair] p-5 space-y-6 bg-surface">

            {/* Selected light */}
            {selectedLight && selectedDef ? (
              <div>
                <p className="text-[11px] font-bold text-muted uppercase tracking-wide mb-3">
                  {selectedDef.label}
                  <span className={`ml-2 font-normal lowercase ${selectedLight.active ? "text-green-600" : "text-muted/60"}`}>
                    {selectedLight.active ? "active" : "off"}
                  </span>
                </p>
                <ColorPicker current={selectedLight.colorPreset} onSelect={handleColorSelect} />
                <button
                  onClick={handleDeactivateLight}
                  className="mt-3 w-full rounded-xl border border-[--hair] py-2 text-xs font-semibold text-muted hover:text-red-600 hover:border-red-300 transition"
                >
                  Turn off this light
                </button>
              </div>
            ) : (
              <div className="box rounded-xl py-4 text-center">
                <p className="text-xs text-muted">Click a light on the stage to select it</p>
              </div>
            )}

            <div className="border-t border-[--hair]" />

            {/* Backdrop */}
            <div>
              <p className="text-[11px] font-bold text-muted uppercase tracking-wide mb-2">Backdrop / cyclorama</p>
              <select
                value={backdrop}
                onChange={e => { setBackdrop(e.target.value); setSaved(false); }}
                className="w-full rounded-xl border border-[--hair] bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition appearance-none"
              >
                <option value="">No backdrop set</option>
                <option value="black">Black / full blackout</option>
                <option value="white">White / neutral</option>
                <option value="blue">Blue sky</option>
                <option value="forest">Forest / nature</option>
                <option value="stars">Stars / night sky</option>
                <option value="abstract">Abstract projection</option>
                <option value="custom">Custom (see notes)</option>
              </select>
            </div>

            {/* Scenery notes */}
            <div>
              <p className="text-[11px] font-bold text-muted uppercase tracking-wide mb-2">Scenery & props notes</p>
              <textarea
                placeholder="Furniture, set pieces, special props, quick-change curtains…"
                value={sceneryNotes}
                onChange={e => { setSceneryNotes(e.target.value); setSaved(false); }}
                rows={4}
                className="w-full rounded-xl border border-[--hair] bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition resize-none"
              />
            </div>

            {/* Performer count */}
            {participants.length > 0 && (
              <div>
                <p className="text-[11px] font-bold text-muted uppercase tracking-wide mb-2">Cast in this act</p>
                <div className="space-y-1.5">
                  {participants.map(p => (
                    <div key={p.castMemberId} className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-brand/15 flex items-center justify-center text-xs font-bold text-brand shrink-0">
                        {p.displayName.charAt(0).toUpperCase()}
                      </div>
                      <span className="text-xs text-ink truncate">{p.displayName}</span>
                      {p.costumeOverride && (
                        <span className="text-xs text-muted truncate">· {p.costumeOverride}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
