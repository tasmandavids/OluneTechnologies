"use client";

// ============================================================================
//  components/website/admin/CustomizeScreen.tsx — the customizer shell: a
//  two-tab sidebar (Design / Content) beside a live preview panel with zoom.
//  Both tabs edit the same working draft, which the preview renders directly.
// ============================================================================

import { useMemo, useState } from "react";
import { SiteRenderer, ARTBOARD_WIDTH } from "@/components/website/SiteRenderer";
import { type WebsiteTemplate } from "@/lib/website/templates";
import { allFontFamilies } from "@/lib/website/typography";
import { useGoogleFontsPreview } from "@/lib/website/useGoogleFonts";
import { publicSubdomainUrl } from "@/lib/domain-setup";
import { IconArrowLeft, IconExternalLink } from "@/components/website/icons";
import type { WebsiteDraft } from "./WebsiteBuilderApp";
import { SwitchTemplateDialog } from "./SwitchTemplateDialog";
import { DesignPanel } from "./DesignPanel";
import { ContentPanel } from "./ContentPanel";

const ZOOMS = [
  { label: "Fit", value: 0.45 },
  { label: "75%", value: 0.62 },
  { label: "100%", value: 0.78 },
];

const TABS = [
  { key: "content", label: "Content" },
  { key: "design", label: "Design" },
] as const;

type Tab = (typeof TABS)[number]["key"];

export function CustomizeScreen({
  draft,
  template,
  studioName,
  studioSlug,
  status,
  saving,
  dirty,
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
  dirty: boolean;
  error: string | null;
  onChange: (patch: Partial<WebsiteDraft>) => void;
  onSave: () => Promise<void>;
  onPublish: () => Promise<void>;
  onUnpublish: () => Promise<void>;
  onBackToGallery: () => void;
}) {
  const [zoom, setZoom] = useState(ZOOMS[1].value);
  const [tab, setTab] = useState<Tab>("content");
  const [switchOpen, setSwitchOpen] = useState(false);

  useGoogleFontsPreview([...allFontFamilies(), draft.fontDisplay, draft.fontBody], "website-customize-fonts");

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
      logoUrl: draft.logoUrl,
      heroImages: draft.heroImages,
    }),
    [draft, studioName],
  );

  const saveState = saving ? "Saving…" : dirty ? "Unsaved changes" : "All changes saved";

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
          <span className="text-[12px] text-muted">{saveState}</span>
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

          <div className="flex rounded-xl border p-1" style={{ borderColor: "var(--hair)", background: "var(--surface)" }}>
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className="flex-1 rounded-lg py-1.5 text-[13px]"
                style={{
                  background: tab === t.key ? "var(--brand)" : "transparent",
                  color: tab === t.key ? "#fff" : "var(--muted)",
                  fontWeight: tab === t.key ? 600 : 400,
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-5">
            {tab === "design" ? (
              <DesignPanel draft={draft} onChange={onChange} />
            ) : (
              <ContentPanel draft={draft} studioName={studioName} onChange={onChange} />
            )}
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
