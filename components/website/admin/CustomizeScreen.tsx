"use client";

// ============================================================================
//  components/website/admin/CustomizeScreen.tsx — sidebar (colours, fonts,
//  density, sections, logo) + live preview panel with zoom.
// ============================================================================

import { useMemo, useState } from "react";
import { SiteRenderer, ARTBOARD_WIDTH } from "@/components/website/SiteRenderer";
import { BRAND_SWATCHES, PAPER_SWATCHES, DENSITIES, type WebsiteTemplate } from "@/lib/website/templates";
import { TYPOGRAPHY_PAIRS, allFontFamilies } from "@/lib/website/typography";
import { SECTION_PICKER_LABELS } from "@/lib/website/sections";
import { useGoogleFontsPreview } from "@/lib/website/useGoogleFonts";
import { publicSubdomainUrl } from "@/lib/domain-setup";
import { IconArrowLeft, IconChevronUp, IconExternalLink, IconGripVertical } from "@/components/website/icons";
import { IconChevronDown } from "@/components/admin/dashboard/icons";
import type { SectionKey } from "@/lib/website/types";
import type { WebsiteDraft } from "./WebsiteBuilderApp";
import { SwitchTemplateDialog } from "./SwitchTemplateDialog";
import { LogoDropzone } from "./LogoDropzone";

const ZOOMS = [
  { label: "Fit", value: 0.45 },
  { label: "75%", value: 0.62 },
  { label: "100%", value: 0.78 },
];

export function CustomizeScreen({
  draft,
  template,
  studioName,
  studioSlug,
  status,
  saving,
  error,
  onChange,
  onSave,
  onPublish,
  onUnpublish,
  onBackToGallery,
}: {
  draft: WebsiteDraft;
  template: WebsiteTemplate;
  studioName: string;
  studioSlug: string;
  status: "draft" | "published";
  saving: boolean;
  error: string | null;
  onChange: (patch: Partial<WebsiteDraft>) => void;
  onSave: () => Promise<void>;
  onPublish: () => Promise<void>;
  onUnpublish: () => Promise<void>;
  onBackToGallery: () => void;
}) {
  const [zoom, setZoom] = useState(ZOOMS[1].value);
  const [switchOpen, setSwitchOpen] = useState(false);

  useGoogleFontsPreview([...allFontFamilies(), draft.fontDisplay, draft.fontBody], "website-customize-fonts");

  // draft.sections' array ORDER is the user-chosen section order (moveSection
  // swaps positions in place) — SiteRenderer/SectionBlocks filters by
  // `.visible` itself, so pass the array through as-is, unsorted.
  const moveSection = (key: SectionKey, dir: -1 | 1) => {
    const idx = draft.sections.findIndex((s) => s.key === key);
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= draft.sections.length) return;
    const next = draft.sections.slice();
    [next[idx], next[j]] = [next[j], next[idx]];
    onChange({ sections: next });
  };

  const toggleSection = (key: SectionKey) => {
    onChange({ sections: draft.sections.map((s) => (s.key === key ? { ...s, visible: !s.visible } : s)) });
  };

  const publicUrl = studioSlug ? publicSubdomainUrl(studioSlug, process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "localhost", "3000") : null;

  const previewProps = useMemo(
    () => ({
      kind: draft.kind,
      accent: draft.accentColor,
      paper: draft.paperColor,
      ink: draft.inkColor,
      fontDisplay: draft.fontDisplay,
      fontBody: draft.fontBody,
      studioName: draft.studioNameOverride || studioName,
      headline: draft.headline,
      tagline: draft.tagline,
      eyebrow: draft.eyebrow,
      sections: draft.sections,
      density: draft.density,
    }),
    [draft, studioName],
  );

  return (
    <div>
      <div
        className="sticky top-0 z-30 flex items-center justify-between gap-5 px-8 py-3.5"
        style={{
          borderBottom: "1px solid var(--edge)",
          background: "linear-gradient(148deg, var(--refract), transparent 42%), var(--glass)",
          backdropFilter: "blur(var(--blur)) saturate(1.85)",
          WebkitBackdropFilter: "blur(var(--blur)) saturate(1.85)",
        }}
      >
        <div className="flex items-center gap-2.5 text-[13px] text-muted">
          <button type="button" onClick={onBackToGallery} className="cursor-pointer">
            Website
          </button>
          <span className="opacity-50">›</span>
          <span className="font-semibold text-ink">{template.name}</span>
        </div>
        <div className="flex items-center gap-2.5">
          {saving && <span className="text-[12px] text-muted">Saving…</span>}
          {error && <span className="text-[12px] text-[var(--error)]">{error}</span>}
          {publicUrl && (
            <a
              href={publicUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 rounded-lg border px-3 py-1.5 text-[13px]"
              style={{ borderColor: "var(--hair)" }}
            >
              View live site <IconExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
          <button
            type="button"
            onClick={onSave}
            className="rounded-lg border px-3 py-1.5 text-[13px]"
            style={{ borderColor: "var(--hair)" }}
          >
            Save draft
          </button>
          {status === "published" ? (
            <button type="button" onClick={onUnpublish} className="rounded-lg px-3 py-1.5 text-[13px] font-semibold text-white" style={{ background: "var(--muted)" }}>
              Unpublish
            </button>
          ) : (
            <button type="button" onClick={onPublish} className="rounded-lg px-3.5 py-1.5 text-[13px] font-semibold text-white" style={{ background: "var(--brand)" }}>
              Publish
            </button>
          )}
        </div>
      </div>

      <div className="flex items-stretch" style={{ minHeight: "calc(100vh - 63px)" }}>
        <div
          className="flex flex-none flex-col gap-5 p-5"
          style={{
            width: 330,
            borderRight: "1px solid var(--edge)",
            background: "linear-gradient(148deg, var(--refract), transparent 42%), var(--glass)",
            backdropFilter: "blur(var(--blur)) saturate(1.85)",
            WebkitBackdropFilter: "blur(var(--blur)) saturate(1.85)",
          }}
        >
          <div>
            <button type="button" onClick={onBackToGallery} className="flex items-center gap-1 text-[13px] text-muted">
              <IconArrowLeft className="h-3.5 w-3.5" /> All templates
            </button>
            <div className="mt-2.5 flex items-baseline gap-2">
              <div className="font-display text-[27px] tracking-[-0.02em] text-ink">{template.name}</div>
              <div className="text-[0.62rem] uppercase tracking-[0.1em] text-muted">{template.vibe}</div>
            </div>
            <div className="mt-1.5 text-[12.5px] leading-[1.5] text-muted">{template.blurb}</div>
          </div>

          <div style={{ height: 1, background: "var(--hair)" }} />

          <div>
            <div className="text-[0.62rem] uppercase tracking-[0.1em] text-muted">Brand colour</div>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {BRAND_SWATCHES.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  onClick={() => onChange({ accentColor: hex })}
                  className="h-[30px] w-[30px] rounded-[10px]"
                  style={{ background: hex, boxShadow: draft.accentColor === hex ? "0 0 0 2px var(--surface), 0 0 0 4px var(--brand)" : "none" }}
                  aria-label={hex}
                />
              ))}
            </div>
            <div className="mt-3 flex items-center gap-2 rounded-xl border px-2.5 py-2" style={{ borderColor: "var(--hair)", background: "var(--surface)" }}>
              <div className="h-[18px] w-[18px] rounded-md" style={{ background: draft.accentColor }} />
              <span className="text-[13px] uppercase tabular-nums">{draft.accentColor}</span>
              <span className="ml-auto text-[12px] text-muted">Everything derives</span>
            </div>
          </div>

          <div>
            <div className="text-[0.62rem] uppercase tracking-[0.1em] text-muted">Page &amp; ink</div>
            <div className="mt-2.5 flex gap-2">
              {PAPER_SWATCHES.map((p) => (
                <button
                  key={p.paper}
                  type="button"
                  onClick={() => onChange({ paperColor: p.paper, inkColor: p.ink })}
                  className="flex h-[38px] flex-1 items-center justify-center rounded-[11px] border text-[11px]"
                  style={{
                    background: p.paper,
                    color: p.ink,
                    borderColor: draft.paperColor === p.paper ? "var(--brand)" : "var(--hair)",
                  }}
                >
                  Aa
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="text-[0.62rem] uppercase tracking-[0.1em] text-muted">Font pairing</div>
            <div className="mt-2.5 flex max-h-[220px] flex-col gap-1.5 overflow-y-auto pr-1">
              {TYPOGRAPHY_PAIRS.map((p) => {
                const active = p.display === draft.fontDisplay && p.body === draft.fontBody;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => onChange({ fontDisplay: p.display, fontBody: p.body })}
                    className="flex items-baseline justify-between gap-2.5 rounded-xl border px-3 py-2.5 text-left"
                    style={{ background: active ? "color-mix(in srgb, var(--brand) 10%, var(--surface))" : "transparent", borderColor: active ? "var(--brand)" : "var(--hair)" }}
                  >
                    <span className="text-[17px]" style={{ fontFamily: `'${p.display}'` }}>{p.display}</span>
                    <span className="text-[12px] text-muted" style={{ fontFamily: `'${p.body}'` }}>{p.body}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="text-[0.62rem] uppercase tracking-[0.1em] text-muted">Density</div>
            <div className="mt-2.5 flex gap-1.5">
              {DENSITIES.map((d) => (
                <button
                  key={d.label}
                  type="button"
                  onClick={() => onChange({ density: d.value })}
                  className="flex-1 rounded-[11px] border py-2 text-[12.5px]"
                  style={{
                    background: draft.density === d.value ? "var(--brand)" : "transparent",
                    color: draft.density === d.value ? "#fff" : "var(--muted)",
                    borderColor: draft.density === d.value ? "transparent" : "var(--hair)",
                    fontWeight: draft.density === d.value ? 600 : 400,
                  }}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-baseline justify-between">
              <div className="text-[0.62rem] uppercase tracking-[0.1em] text-muted">Sections</div>
              <div className="text-[12px] text-muted">Use ↑↓</div>
            </div>
            <div className="mt-2.5 flex flex-col gap-1.5">
              {draft.sections.map((s) => (
                <div key={s.key} className="flex items-center gap-2 rounded-xl border px-2.5 py-2" style={{ borderColor: "var(--hair)" }}>
                  <IconGripVertical className="h-3.5 w-3.5 text-muted" />
                  <span className="flex-1 text-[13px]" style={{ color: s.visible ? "var(--text)" : "var(--muted)" }}>
                    {SECTION_PICKER_LABELS[s.key]}
                  </span>
                  <button type="button" onClick={() => moveSection(s.key, -1)} className="px-0.5 text-muted">
                    <IconChevronUp className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" onClick={() => moveSection(s.key, 1)} className="px-0.5 text-muted">
                    <IconChevronDown className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleSection(s.key)}
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
              ))}
            </div>
          </div>

          <div>
            <div className="text-[0.62rem] uppercase tracking-[0.1em] text-muted">Logo</div>
            <LogoDropzone logoUrl={draft.logoUrl} onChange={(url) => onChange({ logoUrl: url })} />
          </div>

          <div className="mt-auto flex gap-2 pt-1.5">
            <button
              type="button"
              onClick={() => setSwitchOpen(true)}
              className="flex-1 rounded-xl border py-2.5 text-[13px]"
              style={{ borderColor: "var(--hair)", background: "var(--surface)" }}
            >
              Change template
            </button>
            <button type="button" onClick={onSave} className="flex-1 rounded-xl py-2.5 text-[13px] font-semibold text-white" style={{ background: "var(--brand)" }}>
              Save draft
            </button>
          </div>
        </div>

        <div className="min-w-0 flex-1 box-border p-5">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              {ZOOMS.map((z) => (
                <button
                  key={z.label}
                  type="button"
                  onClick={() => setZoom(z.value)}
                  className="rounded-full border px-3.5 py-1.5 text-[12.5px]"
                  style={{
                    background: zoom === z.value ? "var(--brand)" : "transparent",
                    color: zoom === z.value ? "#fff" : "var(--muted)",
                    borderColor: zoom === z.value ? "transparent" : "var(--hair)",
                    fontWeight: zoom === z.value ? 600 : 400,
                  }}
                >
                  {z.label}
                </button>
              ))}
            </div>
            <div className="text-[12.5px] text-muted">Live preview · changes apply as you make them</div>
          </div>

          <div className="max-w-full overflow-hidden rounded-[20px] border bg-white" style={{ borderColor: "rgba(255,255,255,.7)", boxShadow: "0 24px 60px -34px rgba(10,10,10,.45)" }}>
            <div className="flex items-center gap-2 px-3.5 py-2.5" style={{ borderBottom: "1px solid var(--hair)", background: "rgba(250,248,243,.9)" }}>
              <div className="flex gap-1.5">
                <span className="block h-2.5 w-2.5 rounded-full" style={{ background: "#e0dcd4" }} />
                <span className="block h-2.5 w-2.5 rounded-full" style={{ background: "#e0dcd4" }} />
                <span className="block h-2.5 w-2.5 rounded-full" style={{ background: "#e0dcd4" }} />
              </div>
              <div className="flex-1 text-center text-[11.5px] text-muted">
                {studioSlug ? `${studioSlug}.olune.site` : "your-studio.olune.site"}
              </div>
            </div>
            <div className="relative overflow-auto" style={{ height: 660 }}>
              <div style={{ width: ARTBOARD_WIDTH, transformOrigin: "top left", transform: `scale(${zoom})` }}>
                <SiteRenderer {...previewProps} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {switchOpen && (
        <SwitchTemplateDialog
          onCancel={() => setSwitchOpen(false)}
          onConfirm={() => {
            setSwitchOpen(false);
            onBackToGallery();
          }}
        />
      )}
    </div>
  );
}
