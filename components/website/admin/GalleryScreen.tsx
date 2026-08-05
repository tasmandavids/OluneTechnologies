"use client";

// ============================================================================
//  components/website/admin/GalleryScreen.tsx — vibe filter + sort + 20-card
//  template grid + "Currently live" summary + Preview modal.
// ============================================================================

import { useMemo, useState } from "react";
import { TEMPLATES, VIBES, sortTemplates, getTemplate, allTemplateFontFamilies, type WebsiteTemplate, type TemplateSort } from "@/lib/website/templates";
import { useGoogleFontsPreview } from "@/lib/website/useGoogleFonts";
import { TemplateCard } from "./TemplateCard";
import { PreviewModal } from "./PreviewModal";

export function GalleryScreen({
  templates = TEMPLATES,
  currentTemplate,
  status,
  onPick,
  onEditCurrent,
}: {
  templates?: WebsiteTemplate[];
  currentTemplate: WebsiteTemplate | null;
  status: "draft" | "published";
  onPick: (templateId: string) => void;
  onEditCurrent?: () => void;
}) {
  const [filter, setFilter] = useState<"All" | (typeof VIBES)[number]>("All");
  const [sort, setSort] = useState<TemplateSort>("popular");
  const [previewId, setPreviewId] = useState<string | null>(null);

  useGoogleFontsPreview(allTemplateFontFamilies(), "website-gallery-fonts");

  const list = useMemo(() => {
    const filtered = filter === "All" ? templates : templates.filter((t) => t.vibe === filter);
    return sortTemplates(filtered, sort);
  }, [templates, filter, sort]);

  const previewTemplate = previewId ? getTemplate(previewId) : null;

  return (
    <div className="mx-auto max-w-[1360px] px-8 pb-16 pt-9">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-6">
        <div className="max-w-[620px]">
          <div className="text-[0.62rem] uppercase tracking-[0.1em]" style={{ color: "var(--brand)" }}>
            Website · Templates
          </div>
          <h1 className="font-display mt-3 text-[42px] leading-[1.06] tracking-tight text-ink">
            Pick the template your studio lives in.
          </h1>
          <p className="mt-3.5 text-[15px] leading-[1.6] text-muted">
            Twenty designs, each one finished. Choose one, then make it yours — your colours, your fonts, your words, your
            photos.
          </p>
        </div>

        {currentTemplate && (
          <div
            className="flex-none rounded-2xl p-4"
            style={{ width: 300, background: "rgba(255,255,255,.58)", backdropFilter: "blur(22px) saturate(150%)", border: "1px solid rgba(255,255,255,.7)" }}
          >
            <div className="text-[0.62rem] uppercase tracking-[0.1em] text-muted">
              {status === "published" ? "Currently live" : "Draft"}
            </div>
            <div className="mt-2.5 flex items-center gap-3">
              <div className="h-[34px] w-11 rounded-lg" style={{ background: `linear-gradient(140deg, ${currentTemplate.accent}, ${currentTemplate.ink})` }} />
              <div>
                <div className="font-display text-[19px] leading-[1.1] text-ink">{currentTemplate.name}</div>
                <div className="mt-0.5 text-[12px] text-muted">{status === "published" ? "Published" : "Not published yet"}</div>
              </div>
            </div>
            {onEditCurrent && (
              <button
                type="button"
                onClick={onEditCurrent}
                className="mt-3.5 w-full rounded-xl py-2 text-[13px] font-semibold text-white"
                style={{ background: "var(--brand)" }}
              >
                Edit content
              </button>
            )}
          </div>
        )}
      </div>

      <div
        className="sticky top-[62px] z-20 mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl px-3.5 py-2.5"
        style={{ background: "rgba(255,255,255,.55)", backdropFilter: "blur(22px) saturate(150%)", border: "1px solid rgba(255,255,255,.7)" }}
      >
        <div className="flex flex-wrap items-center gap-2">
          {(["All", ...VIBES] as const).map((v) => {
            const active = filter === v;
            const count = v === "All" ? templates.length : templates.filter((t) => t.vibe === v).length;
            return (
              <button
                key={v}
                type="button"
                onClick={() => setFilter(v)}
                className="rounded-full px-[15px] py-2 text-[13px] transition-colors"
                style={{
                  background: active ? "var(--brand)" : "transparent",
                  color: active ? "#fff" : "var(--muted)",
                  border: active ? "1px solid transparent" : "1px solid var(--hair)",
                  fontWeight: active ? 600 : 400,
                }}
              >
                {v}
                <span className="ml-1.5 opacity-50">{count}</span>
              </button>
            );
          })}
        </div>
        <div className="flex flex-none items-center gap-2.5">
          <div className="flex flex-none overflow-hidden rounded-full border" style={{ borderColor: "var(--hair)", background: "rgba(255,255,255,.7)" }}>
            {(
              [
                { key: "popular", label: "Most popular" },
                { key: "newest", label: "Newest" },
              ] as const
            ).map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setSort(s.key)}
                className="px-3.5 py-2 text-[13px]"
                style={{ background: sort === s.key ? "var(--brand)" : "transparent", color: sort === s.key ? "#fff" : "var(--muted)", fontWeight: sort === s.key ? 600 : 400 }}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-[26px]" style={{ gridTemplateColumns: "repeat(auto-fill, 320px)", justifyContent: "start" }}>
        {list.map((t) => (
          <TemplateCard key={t.id} template={t} onUse={() => onPick(t.id)} onPreview={() => setPreviewId(t.id)} />
        ))}
      </div>

      <div className="mt-8 flex items-center justify-center text-[13px] text-muted">
        That&apos;s all twenty. Nothing to build from scratch — pick one and make it yours.
      </div>

      {previewTemplate && (
        <PreviewModal
          template={previewTemplate}
          onUse={() => {
            setPreviewId(null);
            onPick(previewTemplate.id);
          }}
          onClose={() => setPreviewId(null)}
        />
      )}
    </div>
  );
}
