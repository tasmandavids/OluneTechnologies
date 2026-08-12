// ============================================================================
//  components/marketing/content/ContentArticle.tsx
//  Shared server-rendered layout for the editorial pages (/guides, /compare).
//
//  Deliberately a Server Component with no animation: these pages exist to be
//  read by crawlers and assistants, so all the prose has to be in the first
//  HTML response, visible without JavaScript. The landing page's reveal-on-
//  scroll treatment would hide most of it behind opacity:0 until an
//  IntersectionObserver fires.
// ============================================================================

import Link from "next/link";
import type { ReactNode } from "react";
import { landingFontVars } from "@/components/marketing/landing/fonts";
import { DevBanner, LandingNav, LandingFooter } from "@/components/marketing/landing/chrome";
import { ACCENT, BODY, DISPLAY, FAINT, HAIRLINE, HERO_BG, MUTED, NAVY, PAGE_BG } from "./tokens";
import type { ContentSection } from "@/lib/content/types";

const NZ_DATE = new Intl.DateTimeFormat("en-NZ", { day: "numeric", month: "long", year: "numeric" });

function formatUpdated(iso: string): string {
  // Parsed as UTC midnight, which is what the ISO date literal means here.
  return NZ_DATE.format(new Date(`${iso}T00:00:00Z`));
}

export function Breadcrumbs({ trail }: { trail: { name: string; path: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" style={{ fontSize: 13.5, color: FAINT, marginBottom: 18 }}>
      {trail.map((crumb, i) => (
        <span key={crumb.path}>
          {i > 0 ? <span style={{ padding: "0 8px" }}>/</span> : null}
          {i === trail.length - 1 ? (
            <span style={{ color: MUTED }}>{crumb.name}</span>
          ) : (
            <Link href={crumb.path} style={{ color: FAINT, textDecoration: "underline", textUnderlineOffset: 3 }}>
              {crumb.name}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}

/** Outer shell — nav, footer, fonts. Used by index pages and article pages. */
export function ContentShell({ children }: { children: ReactNode }) {
  return (
    <div
      id="olune-landing-root"
      className={landingFontVars}
      style={{ fontFamily: BODY, background: PAGE_BG, color: NAVY, overflowX: "hidden", width: "100%", position: "relative" }}
    >
      <DevBanner />
      <LandingNav />
      {children}
      <LandingFooter />
    </div>
  );
}

export function ContentHero({
  eyebrow,
  title,
  intro,
  trail,
  updated,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  trail: { name: string; path: string }[];
  updated?: string;
}) {
  return (
    <section style={{ background: HERO_BG, padding: "150px 24px 64px" }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <Breadcrumbs trail={trail} />
        <div style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: ACCENT, marginBottom: 16 }}>
          {eyebrow}
        </div>
        <h1 style={{ fontFamily: DISPLAY, fontWeight: 500, fontSize: "clamp(34px, 4.8vw, 60px)", lineHeight: 1.1, letterSpacing: "-0.02em", color: NAVY, margin: 0 }}>
          {title}
        </h1>
        <p style={{ fontSize: 19, lineHeight: 1.65, color: MUTED, margin: "24px 0 0" }}>{intro}</p>
        {updated ? (
          <p style={{ fontSize: 13.5, color: FAINT, margin: "28px 0 0" }}>
            Last updated <time dateTime={updated}>{formatUpdated(updated)}</time>
          </p>
        ) : null}
      </div>
    </section>
  );
}

export function ContentBody({ sections }: { sections: ContentSection[] }) {
  return (
    <section style={{ background: PAGE_BG, padding: "16px 24px 8px" }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        {sections.map((section) => (
          <div key={section.h} style={{ marginTop: 56 }}>
            <h2 style={{ fontFamily: DISPLAY, fontWeight: 500, fontSize: "clamp(24px, 3vw, 34px)", lineHeight: 1.2, letterSpacing: "-0.01em", color: NAVY, margin: "0 0 20px" }}>
              {section.h}
            </h2>
            {section.p.map((para) => (
              <p key={para.slice(0, 48)} style={{ fontSize: 17, lineHeight: 1.75, color: MUTED, margin: "0 0 18px" }}>
                {para}
              </p>
            ))}
            {section.list ? (
              <ul style={{ margin: "4px 0 0", padding: "0 0 0 22px", display: "flex", flexDirection: "column", gap: 10 }}>
                {section.list.map((item) => (
                  <li key={item} style={{ fontSize: 17, lineHeight: 1.65, color: MUTED }}>
                    {item}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

export function CompareTable({ them, rows }: { them: string; rows: { label: string; them: string; olune: string }[] }) {
  const cell: React.CSSProperties = { padding: "16px 18px", fontSize: 15.5, borderBottom: HAIRLINE, verticalAlign: "top" };
  return (
    <section style={{ background: PAGE_BG, padding: "48px 24px 0" }}>
      <div style={{ maxWidth: 760, margin: "0 auto", overflowX: "auto" }}>
        <table style={{ width: "100%", minWidth: 520, borderCollapse: "collapse", background: "#ffffff", borderRadius: 16, overflow: "hidden", boxShadow: "0 18px 40px -30px rgba(26,21,53,0.4)" }}>
          <caption style={{ captionSide: "top", textAlign: "left", fontSize: 13.5, color: FAINT, paddingBottom: 12 }}>
            Olune compared with {them}
          </caption>
          <thead>
            <tr>
              <th scope="col" style={{ ...cell, fontWeight: 600, color: FAINT, textAlign: "left" }} />
              <th scope="col" style={{ ...cell, fontWeight: 700, color: NAVY, textAlign: "left" }}>{them}</th>
              <th scope="col" style={{ ...cell, fontWeight: 700, color: ACCENT, textAlign: "left" }}>Olune</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label}>
                <th scope="row" style={{ ...cell, fontWeight: 600, color: NAVY, textAlign: "left" }}>{row.label}</th>
                <td style={{ ...cell, color: MUTED }}>{row.them}</td>
                <td style={{ ...cell, color: NAVY }}>{row.olune}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function ContentFaq({ items }: { items: { q: string; a: string }[] }) {
  return (
    <section style={{ background: PAGE_BG, padding: "64px 24px 0" }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <h2 style={{ fontFamily: DISPLAY, fontWeight: 500, fontSize: "clamp(24px, 3vw, 34px)", color: NAVY, margin: "0 0 28px" }}>
          Common questions
        </h2>
        <dl style={{ margin: 0 }}>
          {items.map((item) => (
            <div key={item.q} style={{ padding: "22px 0", borderTop: HAIRLINE }}>
              <dt style={{ fontSize: 17.5, fontWeight: 600, color: NAVY, marginBottom: 10 }}>{item.q}</dt>
              <dd style={{ margin: 0, fontSize: 16.5, lineHeight: 1.7, color: MUTED }}>{item.a}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

export function RelatedLinks({ links }: { links: { title: string; description: string; href: string }[] }) {
  if (!links.length) return null;
  return (
    <section style={{ background: PAGE_BG, padding: "64px 24px 0" }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <h2 style={{ fontFamily: DISPLAY, fontWeight: 500, fontSize: 26, color: NAVY, margin: "0 0 22px" }}>Keep reading</h2>
        <div style={{ display: "grid", gap: 14 }}>
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              style={{ display: "block", padding: "20px 22px", background: "#ffffff", border: HAIRLINE, borderRadius: 14, textDecoration: "none" }}
            >
              <div style={{ fontSize: 17, fontWeight: 600, color: NAVY, marginBottom: 6 }}>{link.title}</div>
              <div style={{ fontSize: 15, lineHeight: 1.55, color: MUTED }}>{link.description}</div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

export function ContentCta({ note }: { note?: string }) {
  return (
    <section style={{ background: PAGE_BG, padding: "72px 24px 96px" }}>
      <div style={{ maxWidth: 760, margin: "0 auto", background: "linear-gradient(135deg, #efeafb, #f7f6fb)", border: HAIRLINE, borderRadius: 22, padding: "44px 38px", textAlign: "center" }}>
        <h2 style={{ fontFamily: DISPLAY, fontWeight: 500, fontSize: "clamp(24px, 3vw, 34px)", color: NAVY, margin: "0 0 14px" }}>
          Run your whole studio from one calm place
        </h2>
        <p style={{ fontSize: 16.5, lineHeight: 1.65, color: MUTED, margin: "0 auto 26px", maxWidth: 480 }}>
          {note ?? "Enrolments, timetables, attendance and term fees in one place — free to use until general release in December."}
        </p>
        <Link
          href="/onboarding"
          className="dcl-cta-primary"
          style={{ display: "inline-flex", alignItems: "center", gap: 10, background: NAVY, color: "#ffffff", padding: "15px 30px", borderRadius: 999, fontSize: 15.5, fontWeight: 600, textDecoration: "none" }}
        >
          Start free <span aria-hidden>→</span>
        </Link>
      </div>
    </section>
  );
}
