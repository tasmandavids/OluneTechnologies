"use client";

// ============================================================================
//  components/website/admin/TemplateCard.tsx — one template in the gallery
//  grid: a cropped live SiteRenderer thumbnail + hover actions.
// ============================================================================

import { useState } from "react";
import { SiteRenderer, ARTBOARD_WIDTH } from "@/components/website/SiteRenderer";
import { defaultSections } from "@/lib/website/sections";
import type { WebsiteTemplate } from "@/lib/website/templates";

const CARD_WIDTH = 320;
const THUMB_HEIGHT = 240;
const SCALE = CARD_WIDTH / ARTBOARD_WIDTH;

export function TemplateCard({
  template,
  onUse,
  onPreview,
}: {
  template: WebsiteTemplate;
  onUse: () => void;
  onPreview: () => void;
}) {
  const [hover, setHover] = useState(false);

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="overflow-hidden rounded-[18px] border transition-transform duration-300"
      style={{
        width: CARD_WIDTH,
        background: "rgba(255,255,255,.62)",
        backdropFilter: "blur(20px) saturate(150%)",
        WebkitBackdropFilter: "blur(20px) saturate(150%)",
        borderColor: hover ? "var(--tb)" : "var(--hair)",
        boxShadow: hover ? "0 26px 54px -28px var(--tg)" : "0 10px 24px -20px rgba(10,10,10,.3)",
        transform: hover ? "translateY(-3px)" : "none",
      }}
    >
      <div className="relative overflow-hidden bg-[#f2efe9]" style={{ height: THUMB_HEIGHT }}>
        <div className="absolute left-0 top-0" style={{ width: ARTBOARD_WIDTH }}>
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
            scale={SCALE}
          />
        </div>
        <div
          className="pointer-events-none absolute inset-0 transition-opacity duration-200"
          style={{
            background: "linear-gradient(180deg, rgba(10,10,10,0) 45%, rgba(10,10,10,.55))",
            opacity: hover ? 1 : 0,
          }}
        />
        <div
          className="absolute bottom-2.5 left-2.5 right-2.5 flex items-center gap-2 transition-all duration-200"
          style={{ opacity: hover ? 1 : 0, transform: hover ? "translateY(0)" : "translateY(6px)" }}
        >
          <button
            type="button"
            onClick={onUse}
            className="flex-1 rounded-xl py-2.5 text-[13px] font-semibold text-white"
            style={{ background: "var(--brand)", boxShadow: "var(--shadow-brand-glow)" }}
          >
            Use this template
          </button>
          <button
            type="button"
            onClick={onPreview}
            className="rounded-xl px-3.5 py-2.5 text-[13px] font-semibold text-[#0a0a0a]"
            style={{ background: "rgba(255,255,255,.88)", backdropFilter: "blur(10px)" }}
          >
            Preview
          </button>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 px-[15px] py-3.5" style={{ borderTop: "1px solid rgba(255,255,255,.7)" }}>
        <div className="min-w-0">
          <div className="truncate font-display text-[19px] leading-[1.15] tracking-[-0.015em] text-ink">
            {template.name}
          </div>
          <div className="mt-0.5 truncate text-[12px] text-muted">{template.blurb}</div>
        </div>
        <div className="flex flex-none items-center gap-1.5">
          <span className="h-[13px] w-[13px] rounded-full" style={{ background: template.accent }} />
          <span className="h-[13px] w-[13px] rounded-full border" style={{ background: template.paper, borderColor: "var(--hair)" }} />
          <span className="ml-0.5 text-[0.62rem] uppercase tracking-[0.1em] text-muted">{template.vibe}</span>
        </div>
      </div>
    </div>
  );
}
