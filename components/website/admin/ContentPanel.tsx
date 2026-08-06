"use client";

// ============================================================================
//  components/website/admin/ContentPanel.tsx — the "Content" tab of the
//  customizer sidebar: studio name, hero copy, hero photos, and a per-section
//  editor (show/hide, reorder, headline, body, photos).
//
//  Every edit goes straight into the working draft, so the live preview beside
//  it re-renders as you type; WebsiteBuilderApp owns saving.
// ============================================================================

import { useState } from "react";
import { SECTION_PICKER_LABELS, SECTION_DEFAULTS } from "@/lib/website/sections";
import { SECTION_IMAGE_MAX, heroSlots } from "@/lib/website/images";
import type { SectionKey, WebsiteSection } from "@/lib/website/types";
import { IconChevronUp, IconGripVertical } from "@/components/website/icons";
import { IconChevronDown } from "@/components/admin/dashboard/icons";
import { FieldLabel, TextArea, TextField } from "./Fields";
import { ImageSlotGrid } from "./ImageDropzone";
import type { WebsiteDraft } from "./WebsiteBuilderApp";

export function ContentPanel({
  draft,
  studioName,
  onChange,
}: {
  draft: WebsiteDraft;
  /** The studio's real name — the placeholder when there's no override. */
  studioName: string;
  onChange: (patch: Partial<WebsiteDraft>) => void;
}) {
  const [openSection, setOpenSection] = useState<SectionKey | null>(null);
  const slots = heroSlots(draft.kind);

  const patchSection = (key: SectionKey, patch: Partial<WebsiteSection>) => {
    onChange({ sections: draft.sections.map((s) => (s.key === key ? { ...s, ...patch } : s)) });
  };

  // The array's order IS the page order — moveSection swaps in place, and
  // SectionBlocks filters by `.visible` rather than re-sorting.
  const moveSection = (key: SectionKey, dir: -1 | 1) => {
    const idx = draft.sections.findIndex((s) => s.key === key);
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= draft.sections.length) return;
    const next = draft.sections.slice();
    [next[idx], next[j]] = [next[j], next[idx]];
    onChange({ sections: next });
  };

  return (
    <>
      <div>
        <FieldLabel>Studio name</FieldLabel>
        <input
          type="text"
          value={draft.studioNameOverride ?? ""}
          onChange={(e) => onChange({ studioNameOverride: e.target.value || null })}
          placeholder={studioName}
          className="w-full rounded-xl border px-3 py-2 text-[13px] text-ink outline-none focus:border-[var(--brand)]"
          style={{ borderColor: "var(--hair)", background: "var(--surface)" }}
        />
        <div className="mt-1.5 text-[11.5px] leading-[1.4] text-muted">
          Leave blank to use “{studioName}”. Only affects the website.
        </div>
      </div>

      <div style={{ height: 1, background: "var(--hair)" }} />

      <div className="flex flex-col gap-3">
        <FieldLabel>Hero</FieldLabel>
        <TextField
          label="Eyebrow"
          value={draft.eyebrow}
          onChange={(eyebrow) => onChange({ eyebrow })}
          placeholder="Est. 1998"
          maxLength={60}
        />
        <TextArea
          label="Headline"
          value={draft.headline}
          onChange={(headline) => onChange({ headline })}
          placeholder="Where your dancer grows up."
          rows={2}
          maxLength={120}
        />
        <TextArea
          label="Tagline"
          value={draft.tagline}
          onChange={(tagline) => onChange({ tagline })}
          placeholder="Small classes, real teachers."
          rows={3}
          maxLength={240}
        />
      </div>

      <div>
        <FieldLabel>Hero photos</FieldLabel>
        <div className="mb-2 text-[11.5px] leading-[1.4] text-muted">
          {slots.length === 1
            ? "This template has one hero image slot."
            : `This template has ${slots.length} hero image slots.`}{" "}
          Empty slots keep the template&apos;s colour blocks.
        </div>
        <ImageSlotGrid
          values={draft.heroImages}
          count={slots.length}
          onChange={(heroImages) => onChange({ heroImages })}
          slot="hero"
          labels={slots.map((s) => s.label)}
          hints={slots.map((s) => s.hint)}
          columns={slots.length > 1 ? 2 : 1}
          height={slots.length > 1 ? 74 : 110}
        />
      </div>

      <div style={{ height: 1, background: "var(--hair)" }} />

      <div>
        <div className="flex items-baseline justify-between">
          <FieldLabel>Sections</FieldLabel>
          <div className="mb-1.5 text-[12px] text-muted">Use ↑↓ to reorder</div>
        </div>
        <div className="flex flex-col gap-1.5">
          {draft.sections.map((s) => {
            const open = openSection === s.key;
            const defaults = SECTION_DEFAULTS[s.key];
            const max = SECTION_IMAGE_MAX[s.key] ?? 1;
            return (
              <div key={s.key} className="rounded-xl border" style={{ borderColor: open ? "var(--brand)" : "var(--hair)" }}>
                <div className="flex items-center gap-2 px-2.5 py-2">
                  <IconGripVertical className="h-3.5 w-3.5 text-muted" />
                  <button
                    type="button"
                    onClick={() => setOpenSection(open ? null : s.key)}
                    className="flex-1 text-left text-[13px]"
                    style={{ color: s.visible ? "var(--text)" : "var(--muted)" }}
                  >
                    {SECTION_PICKER_LABELS[s.key]}
                  </button>
                  <button type="button" onClick={() => moveSection(s.key, -1)} className="px-0.5 text-muted" aria-label="Move up">
                    <IconChevronUp className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" onClick={() => moveSection(s.key, 1)} className="px-0.5 text-muted" aria-label="Move down">
                    <IconChevronDown className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => patchSection(s.key, { visible: !s.visible })}
                    className="relative h-[18px] w-8 rounded-full"
                    style={{ background: s.visible ? "var(--brand)" : "var(--hair)" }}
                    aria-label={s.visible ? "Hide section" : "Show section"}
                  >
                    <span
                      className="absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white"
                      style={{ left: s.visible ? 16 : 2, transition: "left .18s ease" }}
                    />
                  </button>
                </div>

                {open && (
                  <div className="flex flex-col gap-3 border-t px-2.5 py-3" style={{ borderColor: "var(--hair)" }}>
                    <TextArea
                      label="Headline"
                      value={s.headline ?? ""}
                      onChange={(headline) => patchSection(s.key, { headline })}
                      placeholder={defaults.headline}
                      rows={2}
                      maxLength={120}
                    />
                    <TextArea
                      label="Body"
                      value={s.body ?? ""}
                      onChange={(body) => patchSection(s.key, { body })}
                      placeholder={defaults.body}
                      rows={3}
                      maxLength={400}
                    />
                    <div>
                      <FieldLabel>{max > 1 ? `Photos · up to ${max}` : "Photo"}</FieldLabel>
                      <ImageSlotGrid
                        values={s.images ?? []}
                        count={max}
                        onChange={(images) => patchSection(s.key, { images })}
                        slot={s.key}
                        columns={max > 1 ? 3 : 1}
                        height={max > 1 ? 60 : 96}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
