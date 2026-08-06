"use client";

// ============================================================================
//  components/website/admin/DesignPanel.tsx — the "Design" tab of the
//  customizer sidebar: brand colour, page/ink pair, font pairing, density,
//  logo. Everything here is look-and-feel; words and photos live in
//  ContentPanel.
// ============================================================================

import { BRAND_SWATCHES, PAPER_SWATCHES, DENSITIES } from "@/lib/website/templates";
import { TYPOGRAPHY_PAIRS } from "@/lib/website/typography";
import { FieldLabel } from "./Fields";
import { ImageDropzone } from "./ImageDropzone";
import type { WebsiteDraft } from "./WebsiteBuilderApp";

export function DesignPanel({
  draft,
  onChange,
}: {
  draft: WebsiteDraft;
  onChange: (patch: Partial<WebsiteDraft>) => void;
}) {
  return (
    <>
      <div>
        <FieldLabel>Brand colour</FieldLabel>
        <div className="flex flex-wrap gap-2">
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
          <label className="relative h-[18px] w-[18px] cursor-pointer overflow-hidden rounded-md" style={{ background: draft.accentColor }}>
            <input
              type="color"
              value={draft.accentColor}
              onChange={(e) => onChange({ accentColor: e.target.value })}
              className="absolute inset-0 cursor-pointer opacity-0"
              aria-label="Custom brand colour"
            />
          </label>
          <span className="text-[13px] uppercase tabular-nums">{draft.accentColor}</span>
          <span className="ml-auto text-[12px] text-muted">Everything derives</span>
        </div>
      </div>

      <div>
        <FieldLabel>Page &amp; ink</FieldLabel>
        <div className="flex gap-2">
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
        <FieldLabel>Font pairing</FieldLabel>
        <div className="flex max-h-[220px] flex-col gap-1.5 overflow-y-auto pr-1">
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
        <FieldLabel>Density</FieldLabel>
        <div className="flex gap-1.5">
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
        <FieldLabel>Logo</FieldLabel>
        <ImageDropzone
          value={draft.logoUrl}
          onChange={(url) => onChange({ logoUrl: url })}
          slot="logo"
          hint="SVG or PNG · transparent works best. Replaces your studio name in the header."
          height={84}
        />
      </div>
    </>
  );
}
