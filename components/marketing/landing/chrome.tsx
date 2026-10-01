"use client";

// ============================================================================
//  components/marketing/landing/chrome.tsx
//  Chrome for the editorial marketing pages that keep their own layout
//  (pricing, guides, compare, privacy, data deletion). Since the Aurora Glass
//  redesign these delegate to the shared nav/footer in ../aurora/chrome.tsx,
//  so every platform page carries the same floating nav and closing CTA.
// ============================================================================

import type { ReactNode } from "react";
import Link from "next/link";
import { StandaloneAuroraFooter, StandaloneAuroraNav } from "@/components/marketing/aurora/chrome";

const ACCENT = "#6b66c9";
const INK = "#15141a";
export const DISPLAY = "var(--font-landing-display), 'Geist', system-ui, sans-serif";
export const BODY = "var(--font-landing-body), 'Hanken Grotesk', system-ui, sans-serif";

/**
 * The pre-release notice now lives in the footer CTA ("free to use until
 * general release in December"); kept as a no-op so callers needn't change.
 */
export function DevBanner() {
  return null;
}

export function LandingNav() {
  return <StandaloneAuroraNav />;
}

export function LandingFooter() {
  return <StandaloneAuroraFooter />;
}

/** Eyebrow label used above section headings. */
export function Eyebrow({ children, center = false }: { children: ReactNode; center?: boolean }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 10, fontSize: 11, fontWeight: 600, letterSpacing: "0.16em", textTransform: "uppercase", color: "#6c6a7e", justifyContent: center ? "center" : undefined }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: ACCENT, display: "inline-block" }} />
      {children}
    </div>
  );
}

export function PrimaryButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} style={{ display: "inline-flex", alignItems: "center", gap: 10, padding: "16px 30px", borderRadius: 999, background: INK, color: "#ffffff", fontWeight: 600, fontSize: 16, boxShadow: "0 12px 30px -14px rgba(107,102,201,.7)", transition: "transform 0.3s cubic-bezier(.32,.72,0,1)" }}>
      {children} <span aria-hidden>→</span>
    </Link>
  );
}
