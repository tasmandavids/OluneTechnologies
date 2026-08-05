"use client";

// ============================================================================
//  components/website/admin/PreviewModal.tsx — full-size template preview
//  with description + "Use this template" CTA.
// ============================================================================

import { SiteRenderer, ARTBOARD_WIDTH } from "@/components/website/SiteRenderer";
import { defaultSections } from "@/lib/website/sections";
import { TEMPLATE_FEATURES } from "@/lib/website/templates";
import type { WebsiteTemplate } from "@/lib/website/templates";
import { IconX } from "@/components/admin/dashboard/icons";

const PREVIEW_SCALE = 0.6;

export function PreviewModal({
  template,
  onUse,
  onClose,
}: {
  template: WebsiteTemplate;
  onUse: () => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-8"
      style={{ background: "rgba(10,10,10,.44)", backdropFilter: "blur(6px)" }}
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-[1140px] overflow-hidden rounded-[22px] border"
        style={{
          background: "rgba(255,255,255,.72)",
          backdropFilter: "blur(28px) saturate(160%)",
          WebkitBackdropFilter: "blur(28px) saturate(160%)",
          borderColor: "rgba(255,255,255,.8)",
          boxShadow: "var(--shadow-dialog)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="min-w-0 flex-1 overflow-auto bg-[#f2efe9]" style={{ height: 680 }}>
          <div style={{ width: ARTBOARD_WIDTH, transformOrigin: "top left", transform: `scale(${PREVIEW_SCALE})` }}>
            <SiteRenderer
              kind={template.kind}
              accent={template.accent}
              paper={template.paper}
              ink={template.ink}
              fontDisplay={template.fontDisplay}
              fontBody={template.fontBody}
              studioName={template.studio}
              headline={template.headline}
              tagline={template.tagline}
              eyebrow={template.eyebrow}
              sections={defaultSections()}
              density={56}
            />
          </div>
        </div>
        <div className="flex flex-none flex-col gap-[18px] p-6" style={{ width: 330 }}>
          <div>
            <div className="flex items-baseline justify-between">
              <div className="font-display text-[32px] tracking-[-0.02em] text-ink">{template.name}</div>
              <button type="button" onClick={onClose} className="text-muted" aria-label="Close">
                <IconX className="h-[18px] w-[18px]" />
              </button>
            </div>
            <div className="mt-1 text-[0.62rem] uppercase tracking-[0.1em]" style={{ color: "var(--brand)" }}>
              {template.vibe} · {template.blurb}
            </div>
            <div className="mt-3 text-[13.5px] leading-[1.6] text-muted">{template.long}</div>
          </div>
          <div style={{ borderTop: "1px solid var(--hair)" }} />
          <div>
            <div className="text-[0.62rem] uppercase tracking-[0.1em] text-muted">Comes with</div>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {TEMPLATE_FEATURES.map((f) => (
                <div
                  key={f}
                  className="rounded-lg border px-2.5 py-1.5 text-[12px]"
                  style={{ background: "color-mix(in srgb, var(--brand) 9%, var(--surface))", borderColor: "var(--hair)" }}
                >
                  {f}
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[0.62rem] uppercase tracking-[0.1em] text-muted">Ships with</div>
            <div className="mt-2.5 flex items-center gap-2.5">
              <div className="flex gap-1.5">
                <span className="h-[22px] w-[22px] rounded-lg" style={{ background: template.accent }} />
                <span className="h-[22px] w-[22px] rounded-lg border" style={{ background: template.paper, borderColor: "var(--hair)" }} />
                <span className="h-[22px] w-[22px] rounded-lg" style={{ background: template.ink }} />
              </div>
              <div className="text-[12.5px] text-muted">
                {template.fontDisplay} + {template.fontBody}
              </div>
            </div>
            <div className="mt-2.5 text-[12px] leading-[1.5] text-muted">
              Every colour and font here is a starting point — change all of it in the next step.
            </div>
          </div>
          <div className="mt-auto flex flex-col gap-2.5">
            <button
              type="button"
              onClick={onUse}
              className="rounded-[13px] py-3.5 text-[14px] font-semibold text-white"
              style={{ background: "var(--brand)", boxShadow: "var(--shadow-brand-glow)" }}
            >
              Use this template →
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-[13px] border py-3 text-[13.5px]"
              style={{ background: "rgba(255,255,255,.7)", borderColor: "var(--hair)" }}
            >
              Keep looking
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
