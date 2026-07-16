"use client";

// ============================================================================
//  components/marketing/landing/legal-prose.tsx — shared heading/paragraph/
//  bullet-list renderer for static legal pages (Privacy Policy, Data
//  Deletion Instructions, ...). Kept separate from chrome.tsx since it's
//  content-shape-specific rather than page-chrome.
// ============================================================================

import { DISPLAY, BODY } from "@/components/marketing/landing/chrome";

const NAVY = "#1a1535";

export type LegalSection = {
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
  subsections?: LegalSection[];
};

export function LegalBullets({ items }: { items: string[] }) {
  return (
    <ul style={{ margin: "0 0 20px", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 12 }}>
      {items.map((item, i) => (
        <li key={i} style={{ display: "flex", gap: 12, fontSize: 16, lineHeight: 1.72, color: "rgba(26,21,53,0.66)" }}>
          <span aria-hidden style={{ flexShrink: 0, marginTop: 10, width: 5, height: 5, borderRadius: "50%", background: "#8b7cf0" }} />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export function LegalSectionBlock({ section, level = 2 }: { section: LegalSection; level?: 2 | 3 }) {
  const HeadingTag = level === 2 ? "h2" : "h3";
  return (
    <div style={{ marginBottom: 40 }}>
      {section.heading && (
        <HeadingTag
          style={{
            fontFamily: level === 2 ? DISPLAY : BODY,
            fontWeight: level === 2 ? 500 : 700,
            fontSize: level === 2 ? "clamp(22px, 2.4vw, 30px)" : 17,
            letterSpacing: level === 2 ? "-0.01em" : "0.01em",
            color: level === 2 ? NAVY : "rgba(26,21,53,0.8)",
            margin: level === 2 ? "0 0 16px" : "0 0 12px",
          }}
        >
          {section.heading}
        </HeadingTag>
      )}
      {section.paragraphs?.map((p, i) => (
        <p key={i} style={{ fontSize: 16, lineHeight: 1.75, color: "rgba(26,21,53,0.66)", margin: "0 0 18px" }}>
          {p}
        </p>
      ))}
      {section.bullets && <LegalBullets items={section.bullets} />}
      {section.subsections?.map((sub, i) => (
        <LegalSectionBlock key={i} level={3} section={sub} />
      ))}
    </div>
  );
}
