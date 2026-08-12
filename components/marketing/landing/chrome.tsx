"use client";

// ============================================================================
//  components/marketing/landing/chrome.tsx
//  Design-exact shared chrome for the Olune platform marketing pages
//  (landing, FAQ, Team). Announcement bar + fixed nav + footer, ported 1:1
//  from the Claude Design Studio export. Inline styles like the export;
//  hover states + keyframes live in styles/landing-design.css.
// ============================================================================

import { useEffect, useRef, useState, useTransition, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { setLocale } from "@/app/actions/locale";
import { localeLabels, locales, type Locale } from "@/lib/i18n/config";
import { useRouter } from "next/navigation";

const ACCENT = "#8b7cf0";
const NAVY = "#1a1535";
export const DISPLAY = "var(--font-landing-display), 'Bodoni Moda', serif";
export const BODY = "var(--font-landing-body), 'Archivo', sans-serif";

const navLinkStyle: CSSProperties = { color: "rgba(26,21,53,0.66)", fontSize: 15, fontWeight: 500, transition: "color 0.25s ease" };

export function DevBanner() {
  return (
    <div style={{ background: "#efeafb", color: "rgba(26,21,53,0.6)", textAlign: "center", padding: "10px 20px", fontSize: 13, letterSpacing: "0.01em", position: "relative", zIndex: 60, borderBottom: "1px solid rgba(26,21,53,0.07)" }}>
      Olune is currently under development — general release is due in December. All plans are free to try as much as you like until then.
    </div>
  );
}

/** Fixed nav; goes translucent + blurred on scroll (design behaviour). */
export function LandingNav() {
  const t = useTranslations("marketing");
  const [scrolled, setScrolled] = useState(false);
  const sentinel = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const obs = new IntersectionObserver((entries) => setScrolled(!entries[0].isIntersecting), { threshold: 0 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Pricing points at the real /pricing route rather than the homepage anchor:
  // an anchor can't rank, can't be linked to, and can't be shared.
  const links = [
    { label: t("features"), href: "/#features" },
    { label: t("pricing"), href: "/pricing" },
    { label: "Guides", href: "/guides" },
    { label: "Mobile", href: "/mobile" },
    { label: "Card", href: "/card" },
    { label: "FAQ", href: "/faq" },
    { label: "Team", href: "/team" },
    { label: t("about"), href: "/#about" },
  ];

  return (
    <>
      <div ref={sentinel} style={{ position: "absolute", top: 0, left: 0, width: 1, height: 1, pointerEvents: "none" }} />
      <nav
        className="dcl-nav"
        style={{
          position: "fixed", top: 0, left: 0, right: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: scrolled ? "15px 48px" : "24px 48px",
          background: scrolled ? "rgba(247,246,251,0.82)" : "transparent",
          backdropFilter: scrolled ? "blur(16px) saturate(1.4)" : "none", WebkitBackdropFilter: scrolled ? "blur(16px) saturate(1.4)" : "none",
          borderBottom: scrolled ? "1px solid rgba(26,21,53,0.07)" : "1px solid transparent", transition: "all 450ms cubic-bezier(.16,1,.3,1)",
        }}
      >
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 11, fontFamily: DISPLAY, fontSize: 24, color: NAVY, letterSpacing: "0.005em", transition: "color 0.4s ease" }}>
          <span style={{ position: "relative", width: 22, height: 22, display: "inline-block", animation: "bobY 6s ease-in-out infinite" }}>
            <span style={{ position: "absolute", top: "15%", left: "17%", width: "76%", height: "76%", borderRadius: "50%", background: ACCENT }} />
            <span style={{ position: "absolute", top: "6%", left: "5%", width: "76%", height: "76%", borderRadius: "50%", background: NAVY }} />
          </span>
          olune
        </Link>
        <div className="dcl-nav-links" style={{ display: "flex", alignItems: "center", gap: 40, flexWrap: "wrap" }}>
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="dcl-navlink" style={navLinkStyle}>{l.label}</Link>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <Link href="/login" className="dcl-navlink" style={navLinkStyle}>{t("signIn")}</Link>
          <Link href="/onboarding" className="dcl-cta-primary" style={{ padding: "10px 22px", borderRadius: 999, background: NAVY, color: "#ffffff", fontSize: 14.5, fontWeight: 700, transition: "transform 0.3s ease, box-shadow 0.3s ease" }}>{t("startFree")}</Link>
        </div>
      </nav>
    </>
  );
}

export function LandingFooter() {
  const t = useTranslations("marketing");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function switchLocale(next: Locale) {
    if (next === locale) return;
    startTransition(async () => {
      await setLocale(next);
      router.refresh();
    });
  }

  const footerLinks = [
    { label: t("features"), href: "/#features" },
    { label: t("pricing"), href: "/pricing" },
    { label: "Guides", href: "/guides" },
    { label: "Compare", href: "/compare" },
    { label: "Mobile", href: "/mobile" },
    { label: "Card", href: "/card" },
    { label: "FAQ", href: "/faq" },
    { label: "Team", href: "/team" },
    { label: "Updates", href: "/#updates" },
    { label: "Privacy", href: "/privacy" },
    { label: "Data Deletion", href: "/data-deletion" },
    { label: t("signIn"), href: "/login" },
    { label: t("startFree"), href: "/onboarding" },
  ];

  const footerStars: CSSProperties[] = [];
  for (let i = 0; i < 14; i++) {
    const s = 1.5 + (i % 3);
    footerStars.push({ position: "absolute", top: `${(i * 37) % 100}%`, left: `${(i * 53) % 100}%`, width: s, height: s, borderRadius: "50%", background: i % 3 === 0 ? ACCENT : "#ffffff", opacity: 0.5, boxShadow: `0 0 7px ${ACCENT}`, animation: `twinkle ${2.4 + (i % 5) * 0.5}s ease-in-out ${(i % 7) * 0.35}s infinite`, pointerEvents: "none" });
  }

  return (
    <footer className="dcl-section" style={{ background: "#16112e", padding: "96px 48px 56px", position: "relative", overflow: "hidden", borderRadius: "48px 48px 0 0", marginTop: -48, boxShadow: "0 -34px 80px -34px rgba(26,21,53,0.4)" }}>
      <div aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        {footerStars.map((s, i) => <div key={i} style={s} />)}
        <div style={{ position: "absolute", top: "10%", left: "10%", width: 130, height: 2, borderRadius: 2, background: "linear-gradient(90deg, rgba(255,255,255,0), #ffffff)", boxShadow: "0 0 6px rgba(255,255,255,0.5)", opacity: 0, animation: "shootStar 8s linear 1.8s infinite", pointerEvents: "none" }} />
      </div>
      <div style={{ maxWidth: 1180, margin: "0 auto", position: "relative", zIndex: 2 }}>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <p style={{ fontSize: 16, color: "rgba(255,255,255,0.5)", margin: "0 0 32px" }}>{t("tagline")}</p>
        </div>
        <h2 style={{ fontFamily: DISPLAY, fontStyle: "italic", fontWeight: 500, fontSize: "clamp(80px, 16vw, 260px)", lineHeight: 1, textAlign: "center", margin: "0 0 60px", letterSpacing: "-0.02em", background: `linear-gradient(90deg, rgba(255,255,255,0.12), ${ACCENT}, rgba(255,255,255,0.12))`, backgroundSize: "200% auto", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", WebkitTextFillColor: "transparent", animation: "shimmer 7s linear infinite" }}>olune</h2>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 24, paddingTop: 40, borderTop: "1px solid rgba(255,255,255,0.12)" }}>
          <div style={{ display: "flex", gap: 22, flexWrap: "wrap" }}>
            {locales.map((code) => (
              <button key={code} type="button" disabled={pending} onClick={() => switchLocale(code)} className="dcl-lang" style={{ fontSize: 14, color: code === locale ? ACCENT : "rgba(255,255,255,0.75)", fontWeight: 700, background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: BODY, transition: "color 0.25s ease" }}>{localeLabels[code]}</button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
            {footerLinks.map((l) => (
              <Link key={l.label} href={l.href} className="dcl-footer-link" style={{ color: "rgba(255,255,255,0.55)", fontSize: 14.5, fontWeight: 500, transition: "color 0.25s ease" }}>{l.label}</Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}

/** Eyebrow label used above section headings. */
export function Eyebrow({ children, center = false }: { children: ReactNode; center?: boolean }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 10, fontSize: 13, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(26,21,53,0.46)", justifyContent: center ? "center" : undefined }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: ACCENT, display: "inline-block" }} />
      {children}
    </div>
  );
}

export function PrimaryButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="dcl-cta-primary" style={{ display: "inline-flex", alignItems: "center", gap: 10, padding: "18px 36px", borderRadius: 999, background: NAVY, color: "#ffffff", fontWeight: 700, fontSize: 16.5, boxShadow: "0 18px 40px -18px rgba(26,21,53,0.7)", transition: "transform 0.35s cubic-bezier(.16,1,.3,1), box-shadow 0.35s ease" }}>
      {children} <span aria-hidden>→</span>
    </Link>
  );
}
