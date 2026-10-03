"use client";

// ============================================================================
//  Parent portal chrome on the Aurora Glass shell, matching the studio owner
//  portal: a floating glass rail (desktop), one glass top bar, and a glass tab
//  bar on phones. Everything follows the studio's own colour via --brand, so a
//  family always sees their studio, not Olune.
//
//  The rail groups the entitlement-filtered parent nav into six spaces; a nav
//  item a studio has switched off simply never appears.
// ============================================================================

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";
import { signOut } from "@/app/portal/actions";
import { setPortalTheme } from "@/app/actions/portal-theme";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { OptimizableImage } from "@/components/ui/OptimizableImage";
import { NotificationBell } from "@/components/admin/notifications/NotificationBell";
import { RippleButton } from "@/components/portal/admin/glass/RippleButton";
import { PORTAL_NAV, type NavItem } from "@/lib/portal/nav-config";
import type { ThemeBase } from "@/lib/types";
import { IconPlus, IconCalendarPlus, IconMegaphone, IconUserPlus } from "@/components/admin/dashboard/icons";

type IconProps = { className?: string; strokeWidth?: number };

function svgBase(className: string | undefined, strokeWidth: number | undefined) {
  return {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: strokeWidth ?? 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
    "aria-hidden": true,
  };
}
const IconHome = ({ className, strokeWidth }: IconProps) => (
  <svg {...svgBase(className, strokeWidth)}><path d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5H15v-5h-6v5H5.5A1.5 1.5 0 0 1 4 19z" /></svg>
);
const IconCalendar = ({ className, strokeWidth }: IconProps) => (
  <svg {...svgBase(className, strokeWidth)}><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></svg>
);
const IconCard = ({ className, strokeWidth }: IconProps) => (
  <svg {...svgBase(className, strokeWidth)}><rect x="3" y="6" width="18" height="13" rx="2.5" /><path d="M3 10.5h18M7 15h3" /></svg>
);
const IconChat = ({ className, strokeWidth }: IconProps) => (
  <svg {...svgBase(className, strokeWidth)}><path d="M20 12.5a7.5 7.5 0 0 1-11 6.6L4 20l1.1-4.4A7.5 7.5 0 1 1 20 12.5z" /></svg>
);
const IconStar = ({ className, strokeWidth }: IconProps) => (
  <svg {...svgBase(className, strokeWidth)}><path d="M12 3.5 14.5 9l6 .6-4.5 4 1.3 5.9L12 16.6l-5.3 2.9L8 13.6l-4.5-4 6-.6z" /></svg>
);
const IconForm = ({ className, strokeWidth }: IconProps) => (
  <svg {...svgBase(className, strokeWidth)}><path d="M14 3.5H7A2.5 2.5 0 0 0 4.5 6v12A2.5 2.5 0 0 0 7 20.5h10a2.5 2.5 0 0 0 2.5-2.5V9z" /><path d="M14 3.5V9h5.5M8.5 14l2 2 4-4" /></svg>
);
const IconMore = ({ className }: IconProps) => (
  <svg {...svgBase(className, 2)}><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></svg>
);

type Space = { id: string; icon: (p: IconProps) => React.JSX.Element; primaryHref: string; subHrefs: string[] };

const PARENT_SPACES: Space[] = [
  { id: "home", icon: IconHome, primaryHref: "/portal/parent", subHrefs: [] },
  { id: "schedule", icon: IconCalendar, primaryHref: "/portal/parent/schedule", subHrefs: ["/portal/parent/private-lessons", "/portal/parent/absences"] },
  { id: "billing", icon: IconCard, primaryHref: "/portal/parent/billing", subHrefs: [] },
  { id: "messages", icon: IconChat, primaryHref: "/portal/parent/chat", subHrefs: [] },
  { id: "recital", icon: IconStar, primaryHref: "/portal/parent/recital", subHrefs: [] },
  { id: "forms", icon: IconForm, primaryHref: "/portal/parent/forms", subHrefs: [] },
];

const GLASS: React.CSSProperties = {
  background: "linear-gradient(148deg, var(--refract), transparent 42%), var(--glass)",
  borderColor: "var(--edge)",
  backdropFilter: "blur(var(--blur)) saturate(1.85)",
  WebkitBackdropFilter: "blur(var(--blur)) saturate(1.85)",
  boxShadow: "var(--shadow), inset 0 1px 0 var(--sheen), inset 0 -1px 0 var(--sheen2), inset 1px 0 0 var(--sheen2)",
};

const BRAND_FILL = "linear-gradient(150deg, var(--tg), var(--brand) 55%, var(--brand-deep))";

function isActive(pathname: string, item: NavItem) {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + "/");
}

function useParentSpaces(nav: NavItem[]) {
  return useMemo(() => {
    const byHref = (href: string) => nav.find((i) => i.href === href);
    const used = new Set<string>();
    const spaces = PARENT_SPACES.map((space) => {
      const primary = byHref(space.primaryHref);
      const subs = space.subHrefs.map(byHref).filter((i): i is NavItem => !!i);
      if (primary) used.add(primary.href);
      subs.forEach((s) => used.add(s.href));
      return primary ? { space, primary, subs } : null;
    }).filter((x): x is { space: Space; primary: NavItem; subs: NavItem[] } => x !== null);
    // Anything the nav adds later that has no space yet still gets a door.
    const extras = nav.filter((i) => !used.has(i.href));
    return { spaces, extras };
  }, [nav]);
}

function StudioMark({ studioName, logoUrl, size = 40 }: { studioName: string; logoUrl: string | null; size?: number }) {
  if (logoUrl) {
    return (
      <OptimizableImage
        src={logoUrl}
        alt=""
        width={size}
        height={size}
        className={`shrink-0 rounded-[13px] border border-(--hair) bg-surface object-contain p-0.5 ${size >= 40 ? "h-10 w-10" : "h-9 w-9"}`}
      />
    );
  }
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-[13px] font-display font-semibold text-white"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42), background: BRAND_FILL }}
    >
      {studioName[0]?.toUpperCase() ?? "S"}
    </span>
  );
}

export function ParentRail({
  studioName,
  logoUrl,
  userName,
  portalTheme = "light",
  nav = PORTAL_NAV.parent,
}: {
  studioName: string;
  logoUrl: string | null;
  userName: string | null;
  portalTheme?: ThemeBase;
  nav?: NavItem[];
}) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const t = useTranslations();
  const tCommon = useTranslations("common");
  const { spaces, extras } = useParentSpaces(nav);
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
  const initials = (userName ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() || "?";

  return (
    <>
      <nav
        aria-label={studioName}
        onMouseEnter={railIn}
        onMouseLeave={railOut}
        className="fixed bottom-3.5 left-3.5 top-3.5 z-40 hidden w-[70px] flex-col items-center gap-3.5 overflow-hidden rounded-[26px] border py-3.5 md:flex"
        style={GLASS}
      >
        <div className="pointer-events-none absolute inset-0" style={{ background: "linear-gradient(180deg, var(--t1), transparent 42%)" }} />
        <Link href="/portal/parent" prefetch={false} className="relative grid h-10 w-11 shrink-0 place-items-center" title={studioName}>
          <StudioMark studioName={studioName} logoUrl={logoUrl} />
        </Link>
        <div className="h-px w-[26px] shrink-0" style={{ background: "var(--hair)" }} />

        <div className="relative flex min-h-0 flex-1 flex-col items-center gap-1.5 overflow-y-auto [scrollbar-width:none]">
          {spaces.map(({ space, primary, subs }) => {
            const active = isActive(pathname, primary) || subs.some((s) => isActive(pathname, s));
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
                <Icon className="h-[18px] w-[18px]" />
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
              aria-expanded={accountOpen}
              className="grid h-9 w-9 place-items-center rounded-xl border text-[12px] font-bold text-ink transition hover:opacity-90"
              style={{ borderColor: "var(--edge)", background: "var(--glass2)" }}
            >
              {initials}
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
            style={{ ...GLASS, backdropFilter: "blur(var(--blur-lg)) saturate(1.9)", WebkitBackdropFilter: "blur(var(--blur-lg)) saturate(1.9)" }}
          >
            <p className="mb-3.5 truncate text-[9.5px] font-semibold uppercase tracking-[0.2em] text-muted">{studioName}</p>
            {spaces.map(({ space, primary, subs }) => (
              <div key={space.id} className={subs.length > 0 ? "mb-3.5" : "mb-1"}>
                <Link
                  href={primary.href}
                  prefetch={false}
                  className="-mx-1 flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] font-semibold text-ink transition hover:bg-(--glass2)"
                >
                  <space.icon className="h-4 w-4 shrink-0 text-muted" />
                  {label(primary)}
                </Link>
                {subs.length > 0 && (
                  <div className="mt-px flex flex-col gap-px pl-[26px]">
                    {subs.map((sub) => (
                      <Link
                        key={sub.href}
                        href={sub.href}
                        prefetch={false}
                        aria-current={isActive(pathname, sub) ? "page" : undefined}
                        className="rounded-lg px-2 py-1.5 text-[12.5px] text-muted transition hover:bg-(--glass2) hover:text-ink aria-[current=page]:text-ink"
                      >
                        {label(sub)}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {extras.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                prefetch={false}
                className="-mx-1 mb-1 flex items-center rounded-lg px-2 py-1.5 text-[13px] font-semibold text-ink transition hover:bg-(--glass2)"
              >
                {label(item)}
              </Link>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

export function ParentTopBar({
  studioName,
  logoUrl,
  nav = PORTAL_NAV.parent,
}: {
  studioName: string;
  logoUrl: string | null;
  nav?: NavItem[];
}) {
  const tShell = useTranslations("shell");
  const has = (href: string) => nav.some((i) => i.href === href);
  const items = [
    has("/portal/parent/absences") && { key: "absence", href: "/portal/parent/absences", icon: IconCalendarPlus },
    has("/portal/parent/private-lessons") && { key: "lesson", href: "/portal/parent/private-lessons", icon: IconUserPlus },
    has("/portal/parent/chat") && { key: "message", href: "/portal/parent/chat", icon: IconMegaphone },
  ].filter(Boolean) as { key: "absence" | "lesson" | "message"; href: string; icon: typeof IconPlus }[];
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (open && ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <header
      className="sticky top-0 z-30 mb-3.5 flex items-center gap-3 rounded-[24px] border p-2.5"
      style={{ ...GLASS, backdropFilter: "blur(var(--blur-lg)) saturate(1.9)", WebkitBackdropFilter: "blur(var(--blur-lg)) saturate(1.9)" }}
    >
      <Link
        href="/portal/parent"
        prefetch={false}
        className="flex min-w-0 shrink items-center gap-2.5 rounded-[16px] border px-3 py-1.5 pr-3.5 transition-transform duration-300 hover:-translate-y-px"
        style={{ borderColor: "var(--tb)", background: "linear-gradient(140deg, var(--sheen), var(--sheen2))", boxShadow: "inset 0 1px 0 var(--sheen)" }}
      >
        <StudioMark studioName={studioName} logoUrl={logoUrl} size={36} />
        <span className="flex min-w-0 flex-col items-start gap-0.5">
          <span className="text-[9.5px] uppercase tracking-[0.14em] text-muted">{tShell("parentBar.yourStudio")}</span>
          <span className="truncate font-display text-[15px] leading-none tracking-tight text-ink">{studioName}</span>
        </span>
      </Link>

      <div className="flex-1" />

      <div className="flex shrink-0 items-center gap-2.5">
        <NotificationBell size="lg" />
        {items.length > 0 && (
          <>
            <div className="h-6 w-px" style={{ background: "var(--hair)" }} />
            <div className="relative" ref={ref}>
              <RippleButton
                variant="solid"
                size="lg"
                sweep
                onClick={() => setOpen((o) => !o)}
                aria-expanded={open}
                aria-haspopup="menu"
                className="!gap-1.5"
                style={{ background: BRAND_FILL, color: "#fff", border: "1px solid rgba(255,255,255,.22)", boxShadow: "0 10px 24px -14px var(--brand), inset 0 1px 0 rgba(255,255,255,.34)" }}
              >
                <IconPlus className="h-4 w-4" />
                {tShell("palette.new")}
              </RippleButton>
              <AnimatePresence>
                {open && (
                  <motion.div
                    role="menu"
                    initial={{ opacity: 0, y: 6, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 6, scale: 0.98 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 top-full z-40 mt-1.5 w-60 rounded-xl border p-1.5"
                    style={{ background: "var(--surface)", borderColor: "var(--hair)", boxShadow: "var(--shadow)" }}
                  >
                    {items.map(({ key, href, icon: Icon }) => (
                      <Link
                        key={key}
                        role="menuitem"
                        href={href}
                        prefetch={false}
                        onClick={() => setOpen(false)}
                        className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-ink transition-colors hover:bg-base"
                      >
                        <Icon className="h-4 w-4" style={{ color: "var(--brand-deep)" }} />
                        {tShell(`parentBar.new.${key}`)}
                      </Link>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </>
        )}
      </div>
    </header>
  );
}

/** Phone tab bar: the four most-used spaces plus "More", which opens the full menu. */
export function ParentTabBar({ nav = PORTAL_NAV.parent, onMore }: { nav?: NavItem[]; onMore: () => void }) {
  const pathname = usePathname() ?? "";
  const t = useTranslations();
  const tShell = useTranslations("shell");
  const { spaces } = useParentSpaces(nav);
  const tabs = spaces.slice(0, 4);
  const moreActive = !tabs.some(({ primary, subs }) => isActive(pathname, primary) || subs.some((s) => isActive(pathname, s)));

  return (
    <nav
      aria-label={tShell("parentBar.tabs")}
      className="fixed inset-x-3 bottom-3.5 z-40 grid rounded-[24px] border p-1.5 md:hidden"
      style={{ ...GLASS, gridTemplateColumns: `repeat(${tabs.length + 1}, minmax(0, 1fr))`, paddingBottom: "max(6px, env(safe-area-inset-bottom))" }}
    >
      {tabs.map(({ space, primary, subs }) => {
        const active = isActive(pathname, primary) || subs.some((s) => isActive(pathname, s));
        const Icon = space.icon;
        return (
          <Link
            key={space.id}
            href={primary.href}
            prefetch={false}
            aria-current={active ? "page" : undefined}
            className="flex min-h-[48px] flex-col items-center justify-center gap-0.5 rounded-[18px] text-[10.5px] font-semibold transition"
            style={{ color: active ? "var(--text)" : "var(--muted)", background: active ? "var(--t3)" : "transparent" }}
          >
            <Icon className="h-5 w-5" />
            <span className="max-w-full truncate px-1">{t(primary.labelKey as Parameters<typeof t>[0])}</span>
          </Link>
        );
      })}
      <button
        type="button"
        onClick={onMore}
        className="flex min-h-[48px] flex-col items-center justify-center gap-0.5 rounded-[18px] text-[10.5px] font-semibold transition"
        style={{ color: moreActive ? "var(--text)" : "var(--muted)", background: moreActive ? "var(--t3)" : "transparent" }}
      >
        <IconMore className="h-5 w-5" />
        {tShell("parentBar.more")}
      </button>
    </nav>
  );
}
