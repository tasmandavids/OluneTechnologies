"use client";

// ============================================================================
//  StudioRail — glass floating rail nav for the admin/studio-owner shell.
//  Each icon is a direct link to the space's primary destination; hovering
//  anywhere on the rail opens ONE workspace flyout listing every space, so
//  nothing loses its second path.
//
//  1.6.3 pass over the flyout:
//    • The space heading is now a LINK, not dead text — the primary
//      destination (students & families, classes, staff, money, website…) was
//      previously reachable only by hitting the right 44px icon.
//    • Every space is listed, including the ones with no children (Today,
//      Settings), so the flyout is a complete map rather than a partial one.
//    • Team is its own space. Staff used to hide under "Studio" (next to the
//      website), and availability/substitutes/private lessons sat under
//      Schedule — all four are "who's teaching", so they live together now.
//    • Class passes moved to People: it is a front-desk scanner like check-in,
//      not a timetable screen.
//    • Products (the billing catalogue) has a direct link under Money.
//  The grouping mirrors ADMIN_NAV's sections, which is what the mobile drawer
//  renders — one IA, two surfaces.
// ============================================================================

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";
import { signOut } from "@/app/portal/actions";
import { ADMIN_NAV, flattenNav, type NavItem, type NavSection } from "@/lib/portal/nav-config";
import { setPortalTheme } from "@/app/actions/portal-theme";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { OluneLogo } from "@/components/brand/OluneLogo";
import type { ThemeBase } from "@/lib/types";
import { AppearancePanel } from "./AppearancePanel";
import {
  IconSun,
  IconUsers,
  IconCalendarDays,
  IconLanyard,
  IconWallet,
  IconInbox,
  IconGlobe,
  IconSettings,
} from "@/components/admin/dashboard/icons";

type Space = {
  id: string;
  labelKey: string;
  icon: typeof IconSun;
  primaryHref: string;
  subHrefs: string[];
  /** Routes that light the icon up without appearing in the flyout — profile
   *  pages and other leaves that have no nav entry of their own. */
  alsoActive?: string[];
};

const SPACES: Space[] = [
  { id: "today", labelKey: "shell.rail.today", icon: IconSun, primaryHref: "/portal/admin", subHrefs: [] },
  {
    id: "people",
    labelKey: "shell.rail.people",
    icon: IconUsers,
    primaryHref: "/portal/admin/people",
    subHrefs: [
      "/portal/admin/leads",
      "/portal/admin/badges",
      "/portal/admin/checkin",
      "/portal/admin/passes",
      "/portal/admin/forms",
    ],
    // /students and /parents keep only their [id] profile pages; the list
    // routes redirect to /people, but the rail should still light up there.
    alsoActive: ["/portal/admin/students", "/portal/admin/parents"],
  },
  {
    id: "schedule",
    labelKey: "shell.rail.schedule",
    icon: IconCalendarDays,
    primaryHref: "/portal/admin/classes",
    subHrefs: ["/portal/admin/events"],
  },
  {
    id: "team",
    labelKey: "shell.rail.team",
    icon: IconLanyard,
    primaryHref: "/portal/admin/staff",
    subHrefs: [
      "/portal/admin/availability",
      "/portal/admin/substitutes",
      "/portal/admin/private-lessons",
    ],
  },
  {
    id: "money",
    labelKey: "shell.rail.money",
    icon: IconWallet,
    primaryHref: "/portal/admin/money",
    subHrefs: ["/portal/admin/money?tab=products", "/portal/admin/shop"],
  },
  { id: "inbox", labelKey: "shell.rail.inbox", icon: IconInbox, primaryHref: "/portal/admin/messages", subHrefs: ["/portal/admin/support"] },
  {
    id: "studio",
    labelKey: "shell.rail.studio",
    icon: IconGlobe,
    primaryHref: "/portal/admin/site",
    subHrefs: ["/portal/admin/advertising"],
  },
  { id: "settings", labelKey: "shell.rail.settings", icon: IconSettings, primaryHref: "/portal/admin/settings", subHrefs: [] },
];

function isActiveHref(pathname: string, item: NavItem): boolean {
  // Tab links (…/money?tab=products) share a pathname with their parent, so
  // they never claim the highlight on their own — the parent already has it.
  const href = item.href.split("?")[0];
  if (href !== item.href) return false;
  return item.exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");
}

function resolveSpace(space: Space, byHref: (href: string) => NavItem | undefined) {
  const available = [space.primaryHref, ...space.subHrefs].map(byHref).filter((i): i is NavItem => !!i);
  if (available.length === 0) return null;
  const primary = available.find((i) => i.href === space.primaryHref) ?? available[0];
  const subs = available.filter((i) => i.href !== primary.href);
  return { primary, subs };
}

export function StudioRail({
  studioName,
  userName,
  portalTheme = "light",
  nav = ADMIN_NAV,
}: {
  studioName: string;
  userName: string | null;
  portalTheme?: ThemeBase;
  nav?: NavSection[];
}) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const t = useTranslations();
  const tCommon = useTranslations("common");
  const byHref = useMemo(() => {
    const flat = flattenNav(nav);
    return (href: string) => flat.find((i) => i.href === href);
  }, [nav]);

  const resolved = useMemo(
    () => SPACES.map((space) => ({ space, r: resolveSpace(space, byHref) })).filter((x) => x.r !== null),
    [byHref],
  );

  const [railOpen, setRailOpen] = useState(false);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const railRef = useRef<HTMLElement>(null);
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

  return (
    <>
      <nav
        ref={railRef}
        onMouseEnter={railIn}
        onMouseLeave={railOut}
        className="fixed bottom-3.5 left-3.5 top-3.5 z-40 hidden w-[70px] flex-col items-center gap-3.5 overflow-hidden rounded-[26px] border py-3.5 md:flex"
        style={{
          background: "linear-gradient(148deg, var(--refract), transparent 42%), var(--glass)",
          borderColor: "var(--edge)",
          backdropFilter: "blur(var(--blur)) saturate(1.85)",
          WebkitBackdropFilter: "blur(var(--blur)) saturate(1.85)",
          boxShadow: "var(--shadow), inset 0 1px 0 var(--sheen), inset 0 -1px 0 var(--sheen2), inset 1px 0 0 var(--sheen2)",
        }}
      >
        <div className="pointer-events-none absolute inset-0" style={{ background: "linear-gradient(180deg, var(--t1), transparent 42%)" }} />

        <Link href="/portal/admin" prefetch={false} className="relative grid h-[38px] w-11 shrink-0 place-items-center" title={studioName}>
          <OluneLogo variant="mark" size="sm" animated />
        </Link>
        <div className="h-px w-[26px] shrink-0" style={{ background: "var(--hair)" }} />

        <div className="relative flex min-h-0 flex-1 flex-col items-center gap-1.5 overflow-y-auto [scrollbar-width:none]">
          {resolved.map(({ space, r }) => {
            if (!r) return null;
            const active =
              isActiveHref(pathname, r.primary) ||
              r.subs.some((s) => isActiveHref(pathname, s)) ||
              (space.alsoActive ?? []).some((href) => pathname === href || pathname.startsWith(href + "/"));
            const Icon = space.icon;
            const label = t(space.labelKey as Parameters<typeof t>[0]);
            return (
              <Link
                key={space.id}
                href={r.primary.href}
                prefetch={false}
                title={label}
                aria-label={label}
                aria-current={active ? "page" : undefined}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-[15px] transition-all duration-200"
                style={{
                  color: active ? "var(--ink, var(--text))" : "var(--muted)",
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
            onClick={() => setAppearanceOpen(true)}
            title={t("shell.rail.appearance" as Parameters<typeof t>[0])}
            aria-label={t("shell.rail.appearance" as Parameters<typeof t>[0])}
            className="grid h-11 w-11 place-items-center rounded-[15px] text-muted transition hover:text-ink"
          >
            <span
              className="h-[19px] w-[19px] rounded-full"
              style={{
                background: "conic-gradient(from 200deg, var(--brand), var(--t2), var(--t3), var(--brand))",
                boxShadow: "inset 0 0 0 1.5px var(--surface), 0 0 12px var(--tg)",
              }}
            />
          </button>
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
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
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
              {studioName[0]?.toUpperCase() ?? "S"}
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
                  <p className="mb-2.5 truncate text-sm font-semibold text-ink">{userName ?? tCommon("you")}</p>
                  <LanguageSwitcher className="mb-3 w-full justify-between" />
                  <form action={signOut}>
                    <button
                      type="submit"
                      className="w-full rounded-lg border border-[--hair] px-2.5 py-1.5 text-left text-xs font-medium text-muted transition hover:bg-base hover:text-ink"
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
            style={{
              background: "linear-gradient(148deg, var(--refract), transparent 42%), var(--glass)",
              borderColor: "var(--edge)",
              backdropFilter: "blur(var(--blur-lg)) saturate(1.9)",
              WebkitBackdropFilter: "blur(var(--blur-lg)) saturate(1.9)",
              boxShadow: "var(--shadow), inset 0 1px 0 var(--sheen), inset 0 -1px 0 var(--sheen2), inset 1px 0 0 var(--sheen2)",
            }}
          >
            <p className="mb-3.5 text-[9.5px] font-semibold uppercase tracking-[0.2em] text-muted">
              {t("shell.rail.workspace" as Parameters<typeof t>[0])}
            </p>
            {resolved.map(({ space, r }) => (
              <div key={space.id} className={r!.subs.length > 0 ? "mb-3.5" : "mb-1"}>
                {/* The heading is the primary destination, labelled with its
                    own nav name ("Students & families", not "People") so the
                    flyout lists every door by the name it answers to. */}
                <Link
                  href={r!.primary.href}
                  prefetch={false}
                  className="-mx-1 flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] font-semibold text-ink transition hover:bg-[--glass2]"
                >
                  <space.icon className="h-4 w-4 shrink-0 text-muted" strokeWidth={1.7} />
                  {t(r!.primary.labelKey as Parameters<typeof t>[0])}
                </Link>
                {r!.subs.length > 0 && (
                  <div className="mt-px flex flex-col gap-px pl-[26px]">
                    {r!.subs.map((sub) => (
                      <Link
                        key={sub.href}
                        href={sub.href}
                        prefetch={false}
                        className="rounded-lg px-2 py-1.5 text-[12.5px] text-muted transition hover:bg-[--glass2] hover:text-ink"
                      >
                        {t(sub.labelKey as Parameters<typeof t>[0])}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ))}
            <div className="border-t pt-3 text-[11.5px] leading-[1.5] text-muted" style={{ borderColor: "var(--hair)" }}>
              {t("shell.rail.everythingByTyping" as Parameters<typeof t>[0])}{" "}
              <span className="font-semibold text-ink">⌘K</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AppearancePanel open={appearanceOpen} onClose={() => setAppearanceOpen(false)} portalTheme={portalTheme} />
    </>
  );
}
