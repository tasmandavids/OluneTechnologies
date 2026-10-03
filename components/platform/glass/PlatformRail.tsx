"use client";

// ============================================================================
//  PlatformRail — the operator console's floating glass rail. A sibling of
//  StudioRail (components/portal/admin/glass/StudioRail.tsx): same 70px glass
//  column, same active-space treatment, same hover flyout that lists every
//  destination, so the console reads as the same product as the studio owner
//  portal. The eleven PLATFORM_NAV pages are grouped into five spaces; each
//  icon links to its space's primary page.
// ============================================================================

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";
import { signOut } from "@/app/portal/actions";
import { setPortalTheme } from "@/app/actions/portal-theme";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { OluneLogo } from "@/components/brand/OluneLogo";
import { PLATFORM_NAV, type NavItem } from "@/lib/portal/nav-config";
import type { ThemeBase } from "@/lib/types";
import {
  IconSun,
  IconBuilding,
  IconInbox,
  IconKanban,
  IconSettings,
} from "@/components/admin/dashboard/icons";

type Space = {
  id: string;
  icon: typeof IconSun;
  primaryHref: string;
  subHrefs: string[];
};

export const PLATFORM_SPACES: Space[] = [
  { id: "overview", icon: IconSun, primaryHref: "/platform", subHrefs: [] },
  { id: "studios", icon: IconBuilding, primaryHref: "/platform/studios", subHrefs: ["/platform/owners", "/platform/plans"] },
  { id: "support", icon: IconInbox, primaryHref: "/platform/messages", subHrefs: ["/platform/announcements"] },
  { id: "ops", icon: IconKanban, primaryHref: "/platform/tasks", subHrefs: ["/platform/features", "/platform/badges"] },
  { id: "settings", icon: IconSettings, primaryHref: "/platform/settings", subHrefs: ["/platform/audit"] },
];

const GLASS_STYLE: React.CSSProperties = {
  background: "linear-gradient(148deg, var(--refract), transparent 42%), var(--glass)",
  borderColor: "var(--edge)",
  backdropFilter: "blur(var(--blur)) saturate(1.85)",
  WebkitBackdropFilter: "blur(var(--blur)) saturate(1.85)",
  boxShadow: "var(--shadow), inset 0 1px 0 var(--sheen), inset 0 -1px 0 var(--sheen2), inset 1px 0 0 var(--sheen2)",
};

function isActiveHref(pathname: string, item: NavItem): boolean {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + "/");
}

export function resolvePlatformSpaces() {
  const byHref = (href: string) => PLATFORM_NAV.find((i) => i.href === href);
  return PLATFORM_SPACES.map((space) => {
    const primary = byHref(space.primaryHref);
    const subs = space.subHrefs.map(byHref).filter((i): i is NavItem => !!i);
    return primary ? { space, primary, subs } : null;
  }).filter((x): x is { space: Space; primary: NavItem; subs: NavItem[] } => x !== null);
}

export function PlatformRail({
  operatorName,
  portalTheme = "light",
}: {
  operatorName: string | null;
  portalTheme?: ThemeBase;
}) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const t = useTranslations();
  const tCommon = useTranslations("common");
  const tPlatform = useTranslations("nav.platform");
  const resolved = useMemo(() => resolvePlatformSpaces(), []);

  const [railOpen, setRailOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const railIn = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setRailOpen(true);
  };
  const railOut = () => {
    closeTimer.current = setTimeout(() => setRailOpen(false), 120);
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (accountOpen && accountRef.current && !accountRef.current.contains(e.target as Node)) setAccountOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [accountOpen]);

  useEffect(() => {
    setRailOpen(false);
    setAccountOpen(false);
  }, [pathname]);

  const label = (item: NavItem) => t(item.labelKey as Parameters<typeof t>[0]);
  const initial = (operatorName ?? "O").trim()[0]?.toUpperCase() ?? "O";

  return (
    <>
      <nav
        aria-label={tPlatform("consoleTitle")}
        onMouseEnter={railIn}
        onMouseLeave={railOut}
        className="fixed bottom-3.5 left-3.5 top-3.5 z-40 hidden w-[70px] flex-col items-center gap-3.5 overflow-hidden rounded-[26px] border py-3.5 md:flex"
        style={GLASS_STYLE}
      >
        <div className="pointer-events-none absolute inset-0" style={{ background: "linear-gradient(180deg, var(--t1), transparent 42%)" }} />

        <Link href="/platform" prefetch={false} className="relative grid h-[38px] w-11 shrink-0 place-items-center" title={tPlatform("consoleTitle")}>
          <OluneLogo variant="mark" size="sm" animated />
        </Link>
        <div className="h-px w-[26px] shrink-0" style={{ background: "var(--hair)" }} />

        <div className="relative flex min-h-0 flex-1 flex-col items-center gap-1.5 overflow-y-auto [scrollbar-width:none]">
          {resolved.map(({ space, primary, subs }) => {
            const active = isActiveHref(pathname, primary) || subs.some((s) => isActiveHref(pathname, s));
            const Icon = space.icon;
            const name = label(primary);
            return (
              <Link
                key={space.id}
                href={primary.href}
                prefetch={false}
                title={name}
                aria-label={name}
                aria-current={active ? "page" : undefined}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-[15px] transition-all duration-200 hover:text-ink"
                style={{
                  color: active ? "var(--text)" : "var(--muted)",
                  background: active ? "var(--t3)" : "transparent",
                  border: active ? "1px solid var(--tb)" : "1px solid transparent",
                  boxShadow: active ? "0 6px 18px -8px var(--tg)" : "none",
                }}
              >
                <Icon className="h-[18px] w-[18px]" strokeWidth={1.7} />
              </Link>
            );
          })}
        </div>

        <div className="relative flex shrink-0 flex-col items-center gap-1.5">
          <button
            type="button"
            onClick={async () => {
              await setPortalTheme(portalTheme === "dark" ? "light" : "dark");
              router.refresh();
            }}
            title={t("shell.rail.toggleTheme" as Parameters<typeof t>[0])}
            aria-label={t("shell.rail.toggleTheme" as Parameters<typeof t>[0])}
            className="grid h-11 w-11 place-items-center rounded-[15px] text-muted transition hover:text-ink"
          >
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
              <path
                d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.8 6.8 0 0 0 10.5 10.5Z"
                style={{ transform: `rotate(${portalTheme === "dark" ? "160deg" : "-20deg"})`, transformOrigin: "center", transition: "transform .7s cubic-bezier(.32,.72,0,1)" }}
              />
            </svg>
          </button>

          <div className="relative" ref={accountRef}>
            <button
              type="button"
              onClick={() => setAccountOpen((o) => !o)}
              title={t("shell.rail.account" as Parameters<typeof t>[0])}
              aria-label={t("shell.rail.account" as Parameters<typeof t>[0])}
              className="grid h-9 w-9 place-items-center rounded-xl text-[12px] font-bold text-white transition hover:opacity-90"
              style={{ background: "linear-gradient(150deg, var(--tg), var(--brand) 60%, var(--brand-deep))" }}
            >
              {initial}
            </button>
            <AnimatePresence>
              {accountOpen && (
                <motion.div
                  initial={{ opacity: 0, x: -6, scale: 0.98 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, x: -6, scale: 0.98 }}
                  transition={{ duration: 0.15 }}
                  className="absolute bottom-0 left-[56px] z-40 w-56 rounded-xl border p-3"
                  style={{ background: "var(--surface)", borderColor: "var(--hair)", boxShadow: "var(--shadow)" }}
                >
                  <p className="mb-2.5 truncate text-sm font-semibold text-ink">{operatorName ?? tCommon("operator")}</p>
                  <LanguageSwitcher className="mb-3 w-full justify-between" />
                  <form action={signOut}>
                    <button
                      type="submit"
                      className="w-full rounded-lg border border-(--hair) px-2.5 py-1.5 text-left text-xs font-medium text-muted transition hover:bg-base hover:text-ink"
                    >
                      {tCommon("signOut")}
                    </button>
                  </form>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </nav>

      <AnimatePresence>
        {railOpen && (
          <motion.div
            onMouseEnter={railIn}
            onMouseLeave={railOut}
            initial={{ opacity: 0, x: -8, scale: 0.98 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -8, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="fixed bottom-3.5 left-[92px] top-3.5 z-40 hidden w-64 overflow-auto rounded-[26px] border p-5 md:block"
            style={{ ...GLASS_STYLE, backdropFilter: "blur(var(--blur-lg)) saturate(1.9)", WebkitBackdropFilter: "blur(var(--blur-lg)) saturate(1.9)" }}
          >
            <p className="mb-3.5 text-[9.5px] font-semibold uppercase tracking-[0.2em] text-muted">
              {tPlatform("consoleSubtitle")}
            </p>
            {resolved.map(({ space, primary, subs }) => (
              <div key={space.id} className={subs.length > 0 ? "mb-3.5" : "mb-1"}>
                <Link
                  href={primary.href}
                  prefetch={false}
                  className="-mx-1 flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] font-semibold text-ink transition hover:bg-(--glass2)"
                >
                  <space.icon className="h-4 w-4 shrink-0 text-muted" strokeWidth={1.7} />
                  {label(primary)}
                </Link>
                {subs.length > 0 && (
                  <div className="mt-px flex flex-col gap-px pl-[26px]">
                    {subs.map((sub) => (
                      <Link
                        key={sub.href}
                        href={sub.href}
                        prefetch={false}
                        aria-current={isActiveHref(pathname, sub) ? "page" : undefined}
                        className="rounded-lg px-2 py-1.5 text-[12.5px] text-muted transition hover:bg-(--glass2) hover:text-ink aria-[current=page]:text-ink"
                      >
                        {label(sub)}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
