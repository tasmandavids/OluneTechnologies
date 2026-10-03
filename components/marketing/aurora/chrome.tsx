"use client";

// ============================================================================
//  components/marketing/aurora/chrome.tsx
//  Floating glass nav + dark CTA footer shared by every platform marketing
//  page (Olune Nav / Olune Footer in the design project), and AuroraPage, the
//  shell that wraps a page in the Aurora tokens, fonts and atmosphere.
// ============================================================================

import { useEffect, useRef, useState, useTransition, type ReactNode, type RefObject } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { setLocale } from "@/app/actions/locale";
import { localeLabels, locales, type Locale } from "@/lib/i18n/config";
import { landingFontVars } from "../landing/fonts";
import { CONTACT_EMAIL, TRIAL_HREF, auroraCopy, localeShort } from "./copy";
import { AuroraField, GlassPanel, GlowButton, OluneMark, RippleButton } from "./primitives";

export type NavKey = "home" | "features" | "pricing" | "mobile" | "card" | "faq" | "team" | "none";

// ── Nav ────────────────────────────────────────────────────────────────────

/** Editorial pages don't pass `active`; infer it from the route. */
function navKeyForPath(path: string | null): NavKey {
  if (!path) return "none";
  if (path.startsWith("/pricing")) return "pricing";
  return "none";
}

export function AuroraNav({ active: activeProp = "none", dark = false }: { active?: NavKey; dark?: boolean }) {
  const pathname = usePathname();
  const active = activeProp === "none" ? navKeyForPath(pathname) : activeProp;
  const locale = useLocale();
  const t = auroraCopy(locale).nav;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [overCta, setOverCta] = useState(false);
  const navRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 40);
      const cta = document.getElementById("start");
      setOverCta(!!cta && cta.getBoundingClientRect().top < 40);
    };
    const onDown = (e: PointerEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setOpen(false);
        setMenu(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setMenu(false);
      }
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  function pickLocale(next: Locale) {
    setOpen(false);
    if (next === locale) return;
    startTransition(async () => {
      await setLocale(next);
      router.refresh();
    });
  }

  // Pricing is the real /pricing route, not the homepage anchor — an anchor
  // can't rank or be linked to on its own.
  const links: { key: NavKey; label: string; href: string }[] = [
    { key: "features", label: t.features, href: "/#tour" },
    { key: "pricing", label: t.pricing, href: "/pricing" },
    { key: "mobile", label: t.mobile, href: "/mobile" },
    { key: "card", label: t.card, href: "/card" },
    { key: "faq", label: t.faq, href: "/faq" },
    { key: "team", label: t.team, href: "/team" },
  ];
  const isDark = dark || overCta;

  return (
    <nav
      ref={navRef}
      aria-label="Main"
      data-base={isDark ? "dark" : undefined}
      style={{
        position: "fixed",
        top: 14,
        left: "50%",
        zIndex: 60,
        transform: "translateX(-50%)",
        width: scrolled ? "min(calc(100% - 28px), 1120px)" : "min(calc(100% - 28px), 1240px)",
        transition: "width .5s cubic-bezier(.32,.72,0,1)",
        fontFamily: "var(--font-body)",
        color: "var(--ink)",
      }}
    >
      <GlassPanel level="raised" radius={999} padding={8}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, paddingLeft: 12 }}>
          <Link href="/" aria-label="Olune home" style={{ display: "flex", alignItems: "center", flex: "none", color: "inherit" }}>
            <OluneMark variant="crescent" theme={isDark ? "dark" : "light"} size={23} />
          </Link>
          <div className="ol-nav-links" style={{ flex: 1, minWidth: 0, justifyContent: "center", gap: 2, overflow: "hidden" }}>
            {links.map((l) => (
              <Link
                key={l.key}
                href={l.href}
                aria-current={l.key === active ? "page" : undefined}
                className="ol-hover-t1"
                style={{ padding: "8px 13px", borderRadius: 999, fontSize: 14, fontWeight: 500, whiteSpace: "nowrap", color: l.key === active ? "var(--ink)" : "var(--muted)", background: l.key === active ? "var(--t2)" : "transparent", transition: "background .25s cubic-bezier(.32,.72,0,1),color .25s" }}
              >
                {l.label}
              </Link>
            ))}
          </div>
          <div style={{ flex: 1 }} className="ol-nav-burger" aria-hidden />
          <div style={{ display: "flex", alignItems: "center", gap: 4, flex: "none", whiteSpace: "nowrap" }}>
            <button
              type="button"
              onClick={() => {
                setOpen((o) => !o);
                setMenu(false);
              }}
              aria-haspopup="listbox"
              aria-expanded={open}
              aria-label={t.language}
              disabled={pending}
              className="ol-hover-t2"
              style={{ all: "unset", cursor: "pointer", display: "flex", alignItems: "center", gap: 7, height: 36, padding: "0 12px", borderRadius: 999, fontSize: 13, fontWeight: 600, letterSpacing: ".04em", color: "var(--ink)", background: open ? "var(--t2)" : "transparent", opacity: pending ? 0.6 : 1 }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
                <circle cx="12" cy="12" r="9" />
                <path d="M3 12h18M12 3c2.6 2.6 3.8 5.6 3.8 9s-1.2 6.4-3.8 9c-2.6-2.6-3.8-5.6-3.8-9S9.4 5.6 12 3z" />
              </svg>
              <span className="ol-nav-lang-code">{localeShort(locale)}</span>
              <svg aria-hidden width="9" height="9" viewBox="0 0 10 10" style={{ opacity: 0.55, transform: `rotate(${open ? 180 : 0}deg)`, transition: "transform .25s cubic-bezier(.32,.72,0,1)" }}>
                <path d="M1.5 3.5L5 7l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <Link href="/login" className="ol-nav-signin" style={{ fontSize: 14, fontWeight: 600, padding: "0 12px", color: "var(--ink)" }}>
              {t.signIn}
            </Link>
            <span className="ol-nav-trial">
              <RippleButton href={TRIAL_HREF} variant="solid" size="sm" sweep>
                {t.trial}
              </RippleButton>
            </span>
            <button
              type="button"
              onClick={() => {
                setMenu((m) => !m);
                setOpen(false);
              }}
              aria-label={t.menu}
              aria-expanded={menu}
              className="ol-nav-burger ol-hover-t2"
              // No `all: unset` here — it would override the class that hides
              // the burger on wide screens.
              style={{ border: "none", padding: 0, margin: 0, font: "inherit", cursor: "pointer", width: 38, height: 38, borderRadius: 999, placeItems: "center", color: "var(--ink)", background: menu ? "var(--t2)" : "transparent" }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
                <path d={menu ? "M6 6l12 12M18 6L6 18" : "M4 8h16M4 16h16"} />
              </svg>
            </button>
          </div>
        </div>
      </GlassPanel>

      {open && (
        <div role="listbox" aria-label={t.language} style={{ position: "absolute", right: "clamp(8px,10vw,170px)", top: "calc(100% + 10px)", width: 232, animation: "olune-sheet .26s cubic-bezier(.32,.72,0,1) backwards" }}>
          <GlassPanel level="raised" radius={20} padding={6}>
            <div style={{ padding: "10px 12px 8px", fontSize: 10.5, fontWeight: 600, letterSpacing: ".16em", textTransform: "uppercase", color: "var(--muted)" }}>{t.language}</div>
            {locales.map((code) => (
              <button
                key={code}
                type="button"
                role="option"
                aria-selected={code === locale}
                onClick={() => pickLocale(code)}
                className="ol-hover-t1"
                style={{ all: "unset", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 13, fontSize: 14, fontWeight: 500, color: "var(--ink)", background: code === locale ? "var(--t2)" : "transparent", transition: "background .2s" }}
              >
                <span style={{ flex: 1 }}>{localeLabels[code]}</span>
                <span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: ".12em", color: "var(--muted)" }}>{localeShort(code)}</span>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--iris)", opacity: code === locale ? 1 : 0 }} />
              </button>
            ))}
          </GlassPanel>
        </div>
      )}

      {menu && (
        <div className="ol-nav-menu" style={{ position: "absolute", left: 0, right: 0, top: "calc(100% + 10px)", animation: "olune-sheet .3s cubic-bezier(.32,.72,0,1) backwards" }}>
          <GlassPanel level="raised" radius={26} padding={10}>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {links.map((l) => (
                <Link
                  key={l.key}
                  href={l.href}
                  onClick={() => setMenu(false)}
                  className="ol-hover-t1"
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", borderRadius: 16, fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 600, letterSpacing: "-.03em", color: "var(--ink)", background: l.key === active ? "var(--t2)" : "transparent" }}
                >
                  {l.label}
                  <span aria-hidden style={{ fontSize: 16, color: "var(--muted)" }}>→</span>
                </Link>
              ))}
              <Link href="/login" style={{ padding: "14px 16px", fontSize: 15, fontWeight: 600, color: "var(--muted)" }}>
                {t.signIn} →
              </Link>
              <div className="ol-nav-menu-trial" style={{ padding: "4px 6px 6px" }}>
                <RippleButton href={TRIAL_HREF} variant="solid" size="lg" sweep style={{ width: "100%" }}>
                  {t.trial}
                </RippleButton>
              </div>
            </div>
          </GlassPanel>
        </div>
      )}
    </nav>
  );
}

// ── Footer ─────────────────────────────────────────────────────────────────

const footLink = { color: "var(--halo)" } as const;

/**
 * Dark closing CTA + site footer. `id="start"` is what the nav watches to
 * flip itself dark as the CTA scrolls under it.
 */
export function AuroraFooter({ title, accent, body }: { title?: string; accent?: string; body?: string }) {
  const locale = useLocale();
  const t = auroraCopy(locale).footer;
  const microHead = { fontSize: 11, fontWeight: 600, letterSpacing: ".16em", textTransform: "uppercase", color: "var(--muted)" } as const;

  return (
    <section id="start" data-base="dark" aria-label="Get started" style={{ position: "relative", zIndex: 2, background: "var(--midnight)", color: "var(--halo)", padding: "clamp(80px,14vh,160px) 24px 0", overflow: "hidden", fontFamily: "var(--font-body)" }}>
      <div aria-hidden style={{ position: "absolute", left: "50%", top: "-10%", width: "min(120vw,1200px)", aspectRatio: "1", transform: "translateX(-50%)", borderRadius: "50%", background: "radial-gradient(circle,rgba(140,132,255,.28),transparent 60%)", pointerEvents: "none" }} />
      <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
        <OluneMark variant="corona" theme="dark" word={false} markSize="clamp(120px,13vw,190px)" />
        <h2 style={{ margin: "40px 0 0", fontFamily: "var(--font-display)", fontWeight: 600, fontSize: "clamp(44px,7vw,112px)", lineHeight: 1.02, letterSpacing: "-.05em", maxWidth: "14ch", textWrap: "balance" }}>
          {title ?? "Lose the chaos."} <span style={{ color: "#c9c6f5" }}>{accent ?? "Keep the dancing."}</span>
        </h2>
        <p style={{ margin: "24px 0 0", maxWidth: 520, fontSize: 18, lineHeight: 1.6, color: "#c9c6dc", textWrap: "pretty" }}>
          {body ?? "Everything is free to use until general release in December — set your studio up now."}
        </p>
        <div style={{ marginTop: 36, display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 12 }}>
          <GlowButton href={TRIAL_HREF} solid>
            <span style={{ whiteSpace: "nowrap" }}>{t.trial} →</span>
          </GlowButton>
          <GlowButton href={`mailto:${CONTACT_EMAIL}`}>
            <span style={{ whiteSpace: "nowrap" }}>{t.talk}</span>
          </GlowButton>
        </div>
        <div style={{ marginTop: 18, fontSize: 13, color: "#a9a6c4" }}>{t.note}</div>
      </div>
      <footer style={{ position: "relative", maxWidth: 1180, margin: "clamp(100px,16vh,180px) auto 0", padding: "40px 0 36px", borderTop: "1px solid var(--hair)", display: "flex", flexWrap: "wrap", gap: 40, justifyContent: "space-between" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 280 }}>
          <OluneMark variant="crescent" theme="dark" size={28} />
          <span style={{ fontSize: 14, lineHeight: 1.6, color: "var(--muted)" }}>{t.tag}</span>
        </div>
        <nav aria-label="Footer" style={{ display: "flex", flexWrap: "wrap", gap: "clamp(32px,6vw,80px)", fontSize: 14 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <span style={microHead}>{t.product}</span>
            <Link href="/#tour" style={footLink}>{t.features}</Link>
            <Link href="/pricing" style={footLink}>{t.pricing}</Link>
            <Link href="/compare" style={footLink}>Compare</Link>
            <Link href="/mobile" style={footLink}>Olune Mobile</Link>
            <Link href="/card" style={footLink}>{t.card}</Link>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <span style={microHead}>Olune</span>
            <Link href="/team" style={footLink}>{t.team}</Link>
            <Link href="/faq" style={footLink}>FAQ</Link>
            <Link href="/instructors" style={footLink}>Find an instructor</Link>
            <a href={`mailto:${CONTACT_EMAIL}`} style={footLink}>{CONTACT_EMAIL}</a>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <span style={microHead}>{t.legal}</span>
            <Link href="/privacy" style={footLink}>{t.privacy}</Link>
            <Link href="/data-deletion" style={footLink}>{t.deletion}</Link>
          </div>
        </nav>
        <div style={{ flexBasis: "100%", display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 12, fontSize: 12.5, color: "var(--muted)", paddingTop: 24 }}>
          <span>© 2026 Olune · {t.nz}</span>
          <span>{t.release}</span>
        </div>
      </footer>
    </section>
  );
}

// ── Page shell ─────────────────────────────────────────────────────────────

/** Aurora tokens + fonts + drifting atmosphere + nav, around one page. */
export function AuroraPage({
  active,
  navDark,
  rootRef,
  footer,
  children,
}: {
  active: NavKey;
  navDark?: boolean;
  rootRef?: RefObject<HTMLDivElement | null>;
  footer: { title: string; accent: string; body: string };
  children: ReactNode;
}) {
  return (
    <div ref={rootRef} className={`ol-aurora ol-page ${landingFontVars}`}>
      <AuroraField />
      <AuroraNav active={active} dark={navDark} />
      <main style={{ position: "relative" }}>{children}</main>
      <AuroraFooter title={footer.title} accent={footer.accent} body={footer.body} />
    </div>
  );
}

/**
 * Nav/footer for pages that keep their own layout (pricing, guides, compare,
 * legal): carries the Aurora token scope itself since the page doesn't.
 */
export function StandaloneAuroraNav({ active = "none" }: { active?: NavKey }) {
  return (
    <div className={`ol-aurora ${landingFontVars}`} style={{ position: "relative", zIndex: 60 }}>
      <AuroraNav active={active} />
    </div>
  );
}

export function StandaloneAuroraFooter(props: { title?: string; accent?: string; body?: string }) {
  return (
    <div className={`ol-aurora ${landingFontVars}`}>
      <AuroraFooter {...props} />
    </div>
  );
}
