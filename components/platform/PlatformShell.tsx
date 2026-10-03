"use client";

// Platform console shell — Olune staff navigation on the apex domain.
// Uses the studio owner portal's Aurora Glass shell (.admin-glass tokens,
// ambient background, floating rail, single glass top bar) so operators and
// studio owners work in the same product. Mobile keeps a compact top bar with
// a drop-down menu listing every console page.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { signOut } from "@/app/portal/actions";
import { OluneMark } from "@/components/brand/OluneLogo";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { PortalThemeSync } from "@/components/portal/PortalThemeSync";
import { AmbientBackground } from "@/components/portal/admin/glass/AmbientBackground";
import type { ThemeBase } from "@/lib/types";
import { PlatformRail, resolvePlatformSpaces } from "./glass/PlatformRail";
import { PlatformTopBar } from "./glass/PlatformTopBar";

function MobileMenu({
  operatorName,
  pathname,
  onNavClick,
}: {
  operatorName: string | null;
  pathname: string;
  onNavClick: () => void;
}) {
  const t = useTranslations();
  const tCommon = useTranslations("common");
  const spaces = resolvePlatformSpaces();

  return (
    <div className="space-y-4 p-4">
      {spaces.map(({ space, primary, subs }) => (
        <div key={space.id}>
          {[primary, ...subs].map((item, i) => {
            const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch={false}
                onClick={onNavClick}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition ${i === 0 ? "font-semibold" : "pl-9"} ${
                  active ? "text-ink" : "text-muted hover:text-ink"
                }`}
                style={active ? { background: "var(--t2)" } : undefined}
              >
                {i === 0 && <space.icon className="h-4 w-4 shrink-0" strokeWidth={1.7} />}
                {t(item.labelKey as Parameters<typeof t>[0])}
              </Link>
            );
          })}
        </div>
      ))}
      <div className="border-t border-[--hair] pt-4">
        <LanguageSwitcher className="mb-3 w-full justify-between" />
        <p className="mb-2 truncate text-xs font-medium text-ink">{operatorName ?? tCommon("operator")}</p>
        <form action={signOut}>
          <button type="submit" className="text-xs text-muted transition-colors hover:text-ink">
            {tCommon("signOut")}
          </button>
        </form>
      </div>
    </div>
  );
}

export function PlatformShell({
  operatorName,
  portalTheme = "light",
  children,
}: {
  operatorName: string | null;
  portalTheme?: ThemeBase;
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? "";
  const tPlatform = useTranslations("nav.platform");
  const tShell = useTranslations("shell");
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="admin-glass relative isolate flex h-screen overflow-hidden bg-base">
      <PortalThemeSync theme={portalTheme} />
      <AmbientBackground />
      <PlatformRail operatorName={operatorName} portalTheme={portalTheme} />

      <div className="fixed inset-x-0 top-0 z-50 md:hidden">
        <div
          className="flex items-center justify-between border-b px-4 py-3"
          style={{
            borderColor: "var(--hair)",
            background: "var(--glass)",
            backdropFilter: "blur(var(--blur)) saturate(1.85)",
            WebkitBackdropFilter: "blur(var(--blur)) saturate(1.85)",
          }}
        >
          <div className="flex items-center gap-2">
            <OluneMark className="h-7 w-7 shrink-0" />
            <span className="font-display text-[15px] font-medium tracking-tight text-ink">{tPlatform("consoleTitle")}</span>
          </div>
          <button
            type="button"
            onClick={() => setMobileOpen((o) => !o)}
            className="grid h-10 w-10 place-items-center rounded-xl text-muted transition hover:text-ink"
            aria-label={tShell("toggleMenu")}
            aria-expanded={mobileOpen}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden>
              {mobileOpen ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </div>
        <div
          className={`border-b transition-[max-height,opacity] duration-200 ease-out ${
            mobileOpen
              ? "max-h-[min(80vh,calc(100dvh-3.5rem))] overflow-y-auto overscroll-contain opacity-100"
              : "max-h-0 overflow-hidden opacity-0"
          }`}
          style={{ borderColor: "var(--hair)", background: "var(--surface)", boxShadow: "var(--shadow)" }}
        >
          <MobileMenu operatorName={operatorName} pathname={pathname} onNavClick={() => setMobileOpen(false)} />
        </div>
      </div>

      <div className="flex flex-1 flex-col overflow-hidden md:pl-[98px]">
        <main className="flex-1 overflow-auto px-[18px] pb-[70px] pt-[68px] md:px-[26px] md:pt-3.5">
          <div className="hidden md:block">
            <PlatformTopBar />
          </div>
          <div className="mx-auto max-w-[1180px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
