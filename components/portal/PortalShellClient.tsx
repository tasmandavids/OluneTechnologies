"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";
import { signOut } from "@/app/portal/actions";
import type { Role } from "@/lib/types";
import { ADMIN_NAV, OFFICE_NAV, PORTAL_NAV, ROLE_BADGE_KEYS, SELF_MANAGED_STUDENT_NAV, type NavItem } from "@/lib/portal/nav-config";
import { OptimizableImage } from "@/components/ui/OptimizableImage";
import { OluneLogo } from "@/components/brand/OluneLogo";
import { PoweredByOlune } from "@/components/brand/PoweredByOlune";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { ThemeSwitcher } from "@/components/portal/ThemeSwitcher";
import { PortalThemeSync } from "@/components/portal/PortalThemeSync";
import type { ThemeBase } from "@/lib/types";
import { NotificationBell } from "@/components/admin/notifications/NotificationBell";
import { AdminRail } from "@/components/portal/admin/AdminRail";
import { CommandPalette } from "@/components/portal/admin/CommandPalette";
import { IconSearch, IconPlus, IconCalendarPlus, IconReceipt, IconMegaphone, IconUserPlus } from "@/components/admin/dashboard/icons";

const NEW_MENU_ITEMS = [
  { key: "addClass", href: "/portal/admin/classes", icon: IconCalendarPlus },
  { key: "newInvoice", href: "/portal/admin/billing", icon: IconReceipt },
  { key: "message", href: "/portal/admin/messages", icon: IconMegaphone },
  { key: "addLead", href: "/portal/admin/leads", icon: IconUserPlus },
] as const;

function AdminTopBar({ studioName, onOpenPalette }: { studioName: string; onOpenPalette: () => void }) {
  const t = useTranslations();
  const tShell = useTranslations("shell");
  const tGreeting = useTranslations("common.greeting");
  const locale = useLocale();
  const [newOpen, setNewOpen] = useState(false);
  const newRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (newOpen && newRef.current && !newRef.current.contains(e.target as Node)) setNewOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [newOpen]);

  const greeting = (() => {
    const h = new Date().getHours();
    return h < 12 ? tGreeting("morning") : h < 18 ? tGreeting("afternoon") : tGreeting("evening");
  })();

  return (
    <div className="flex items-center gap-5 border-b border-[--hair] bg-surface px-7 pb-3.5 pt-5">
      <div className="shrink-0">
        <p className="font-display text-[26px] font-medium leading-tight tracking-tight text-ink">
          {greeting}, {studioName}
        </p>
        <p className="mt-0.5 text-[12.5px] text-muted">
          {new Date().toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" })}
        </p>
      </div>
      <button
        type="button"
        onClick={onOpenPalette}
        className="ml-auto flex max-w-[460px] flex-1 items-center gap-2.5 rounded-xl border border-[--hair] px-3 py-[9px] text-[13px] text-muted backdrop-blur-[10px] transition-colors hover:border-[color-mix(in_srgb,var(--brand)_35%,var(--hair))]"
        style={{
          background: "color-mix(in srgb, 72% var(--surface), transparent)",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.25)",
        }}
      >
        <IconSearch className="h-4 w-4 shrink-0" />
        <span className="flex-1 truncate text-left">{tShell("palette.placeholder")}</span>
        <kbd className="rounded-md border border-[--hair] px-1.5 py-0.5 text-[11px]">⌘K</kbd>
      </button>
      <div className="relative" ref={newRef}>
        <button
          type="button"
          onClick={() => setNewOpen((o) => !o)}
          className="group relative flex items-center gap-1.5 overflow-hidden rounded-xl px-4 py-[10px] text-[13.5px] font-semibold text-white transition-transform hover:-translate-y-px active:translate-y-0 active:scale-[.97]"
          style={{
            background: "linear-gradient(180deg, color-mix(in srgb, 24% #fff, var(--brand)), var(--brand))",
            border: "1px solid color-mix(in srgb, 40% #fff, var(--brand))",
            boxShadow:
              "inset 0 1px 0 rgba(255,255,255,0.45), inset 0 -1px 1px rgba(0,0,0,0.08), 0 10px 22px -10px color-mix(in srgb, 55% var(--brand-deep), transparent)",
          }}
        >
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 -translate-x-[130%] bg-[linear-gradient(115deg,transparent_30%,rgba(255,255,255,0.55)_48%,transparent_66%)] transition-transform duration-700 ease-out group-hover:translate-x-[130%]"
          />
          <IconPlus className="h-4 w-4" />
          {tShell("palette.new")}
        </button>
        <AnimatePresence>
          {newOpen && (
            <motion.div
              initial={{ opacity: 0, y: 6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.98 }}
              transition={{ duration: 0.15 }}
              className="absolute right-0 top-full z-40 mt-1.5 w-48 rounded-xl border border-[--hair] bg-surface p-1.5 shadow-2xl"
            >
              {NEW_MENU_ITEMS.map(({ key, href, icon: Icon }) => (
                <Link
                  key={key}
                  href={href}
                  prefetch={false}
                  onClick={() => setNewOpen(false)}
                  className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-ink transition-colors hover:bg-base"
                >
                  <Icon className="h-4 w-4" style={{ color: "var(--brand-deep)" }} />
                  {t(`admin.dashboard.quickActions.${key}` as Parameters<typeof t>[0])}
                </Link>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <NotificationBell />
    </div>
  );
}

function StudioAvatar({
  studioName,
  logoUrl,
}: {
  studioName: string;
  logoUrl: string | null;
}) {
  if (logoUrl) {
    return (
      <OptimizableImage
        src={logoUrl}
        alt=""
        width={32}
        height={32}
        className="h-8 w-8 shrink-0 rounded-lg border border-[--hair] bg-surface object-contain p-0.5"
      />
    );
  }

  return (
    <span
      className="grid h-8 w-8 shrink-0 place-items-center border text-xs font-black text-ink"
      style={{ borderColor: "var(--brand)" }}
    >
      {studioName[0]?.toUpperCase() ?? "S"}
    </span>
  );
}

function SidebarContent({
  role,
  studioName,
  logoUrl,
  userName,
  pathname,
  onNavClick,
  collapsed,
  onToggleCollapse,
  showAffiliations = false,
  selfManagedStudent = false,
  portalTheme = "light",
}: {
  role: Role;
  studioName: string;
  logoUrl: string | null;
  userName: string | null;
  pathname: string;
  onNavClick?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  showAffiliations?: boolean;
  selfManagedStudent?: boolean;
  portalTheme?: ThemeBase;
}) {
  const t = useTranslations();
  const tCommon = useTranslations("common");
  const tShell = useTranslations("shell");

  const isActive = (item: NavItem) =>
    item.exact
      ? pathname === item.href
      : pathname === item.href || pathname.startsWith(item.href + "/");

  const isGroupActive = (item: NavItem) =>
    isActive(item) || (item.children ?? []).some((c) => isActive(c));

  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set());

  const toggleGroup = (href: string) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(href)) next.delete(href);
      else next.add(href);
      return next;
    });
  };

  const renderNavItem = (item: NavItem) => {
    if (item.children && item.children.length > 0) {
      const groupActive = isGroupActive(item);
      const open = openGroups.has(item.href) || groupActive;
      return (
        <div key={item.href}>
          <div className="flex items-center gap-0.5">
            <Link
              href={item.href}
              prefetch={false}
              scroll={false}
              onClick={onNavClick}
              className={`flex flex-1 items-center rounded-xl px-3 py-2.5 text-sm font-medium transition-colors duration-200 ${
                isActive(item)
                  ? "bg-[color-mix(in_srgb,var(--brand)_14%,var(--surface))] font-semibold text-ink"
                  : "text-muted hover:bg-base hover:text-ink"
              }`}
            >
              {t(item.labelKey as Parameters<typeof t>[0])}
            </Link>
            <button
              type="button"
              onClick={() => toggleGroup(item.href)}
              aria-label="Toggle submenu"
              className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-xs text-muted transition hover:bg-base hover:text-ink"
            >
              {open ? "▾" : "›"}
            </button>
          </div>
          <AnimatePresence initial={false}>
            {open && (
              <motion.div
                key="sub"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="overflow-hidden"
              >
                <div className="ml-3 mt-0.5 space-y-0.5 border-l border-[--hair] pl-3">
                  {item.children.map((child) => {
                    const childActive = isActive(child);
                    return (
                      <Link
                        key={child.href}
                        href={child.href}
                        prefetch={false}
                        scroll={false}
                        onClick={onNavClick}
                        className={`flex items-center rounded-lg px-2.5 py-2 text-sm font-medium transition-colors duration-200 ${
                          childActive
                            ? "bg-[color-mix(in_srgb,var(--brand)_14%,var(--surface))] font-semibold text-ink"
                            : "text-muted hover:bg-base hover:text-ink"
                        }`}
                      >
                        {t(child.labelKey as Parameters<typeof t>[0])}
                      </Link>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      );
    }

    const active = isActive(item);
    return (
      <Link
        key={item.href}
        href={item.href}
        prefetch={false}
        scroll={false}
        onClick={onNavClick}
        className={`flex items-center rounded-xl px-3 py-2.5 text-sm font-medium transition-colors duration-200 ${
          active
            ? "bg-[color-mix(in_srgb,var(--brand)_14%,var(--surface))] font-semibold text-ink"
            : "text-muted hover:bg-base hover:text-ink"
        }`}
      >
        {t(item.labelKey as Parameters<typeof t>[0])}
      </Link>
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-[--hair] p-5">
        <div className="mb-1 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <StudioAvatar studioName={studioName} logoUrl={logoUrl} />
            <h2 className="truncate text-sm font-black text-ink">{studioName}</h2>
          </div>
          {onToggleCollapse && (
            <button
              type="button"
              onClick={onToggleCollapse}
              title={collapsed ? tShell("keepSidebarOpen") : tShell("hideSidebar")}
              aria-label={collapsed ? tShell("keepSidebarOpen") : tShell("hideSidebar")}
              className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-[--hair] text-xs text-muted transition hover:bg-base hover:text-ink"
            >
              {collapsed ? "›" : "‹"}
            </button>
          )}
        </div>
        <p className="text-[0.62rem] uppercase tracking-widest text-muted">
          {t(ROLE_BADGE_KEYS[role] as Parameters<typeof t>[0])}
        </p>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
        {role === "admin" ? (
          ADMIN_NAV.map((section, index) => (
            <div key={section.titleKey ?? `section-${index}`} className={index > 0 ? "mt-4" : ""}>
              {section.titleKey && (
                <p className="mb-1 px-3 text-[0.62rem] font-semibold uppercase tracking-widest text-muted">
                  {t(section.titleKey as Parameters<typeof t>[0])}
                </p>
              )}
              <div className="space-y-0.5">{section.items.map(renderNavItem)}</div>
            </div>
          ))
        ) : role === "office" ? (
          OFFICE_NAV.map((section, index) => (
            <div key={section.titleKey ?? `section-${index}`} className={index > 0 ? "mt-4" : ""}>
              {section.titleKey && (
                <p className="mb-1 px-3 text-[0.62rem] font-semibold uppercase tracking-widest text-muted">
                  {t(section.titleKey as Parameters<typeof t>[0])}
                </p>
              )}
              <div className="space-y-0.5">{section.items.map(renderNavItem)}</div>
            </div>
          ))
        ) : (
          <div className="space-y-0.5">
            {(role === "teacher"
              ? PORTAL_NAV.teacher.filter(
                  (item) => showAffiliations || item.href !== "/portal/teacher/affiliations",
                )
              : role === "student" && selfManagedStudent
                ? SELF_MANAGED_STUDENT_NAV
                : PORTAL_NAV[role]
            ).map(renderNavItem)}
          </div>
        )}
      </nav>

      <div className="shrink-0 border-t border-[--hair] p-4">
        <PoweredByOlune className="mb-4" />
        <ThemeSwitcher value={portalTheme} className="mb-3 w-full justify-between" />
        <LanguageSwitcher className="mb-4 w-full justify-between" />
        <p className="mb-2.5 truncate text-xs font-medium text-ink">{userName ?? tCommon("you")}</p>
        <form action={signOut}>
          <button type="submit" className="text-xs text-muted transition-colors hover:text-ink">
            {tCommon("signOut")}
          </button>
        </form>
      </div>
    </div>
  );
}

export function PortalShellClient({
  role,
  studioName,
  logoUrl = null,
  userName,
  showAffiliations = false,
  selfManagedStudent = false,
  portalTheme = "light",
  children,
}: {
  role: Role;
  studioName: string;
  logoUrl?: string | null;
  userName: string | null;
  showAffiliations?: boolean;
  selfManagedStudent?: boolean;
  portalTheme?: ThemeBase;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const tShell = useTranslations("shell");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [hoverPeek, setHoverPeek] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const peekTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showBell = role === "admin" || role === "office" || role === "parent" || (role === "student" && selfManagedStudent);
  const isAdminRail = role === "admin";

  useEffect(() => {
    if (!isAdminRail) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isAdminRail]);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("portal-sidebar-collapsed") === "1");
    } catch {
      /* ignore */
    }
    return () => {
      if (peekTimer.current) clearTimeout(peekTimer.current);
    };
  }, []);

  const openPeek = () => {
    if (!collapsed) return;
    if (peekTimer.current) clearTimeout(peekTimer.current);
    setHoverPeek(true);
  };

  const closePeek = () => {
    if (!collapsed) return;
    peekTimer.current = setTimeout(() => setHoverPeek(false), 100);
  };

  const hideSidebar = () => {
    setCollapsed(true);
    setHoverPeek(false);
    try {
      localStorage.setItem("portal-sidebar-collapsed", "1");
    } catch {
      /* ignore */
    }
  };

  const pinSidebarOpen = () => {
    setCollapsed(false);
    setHoverPeek(false);
    try {
      localStorage.setItem("portal-sidebar-collapsed", "0");
    } catch {
      /* ignore */
    }
  };

  const toggleCollapse = () => {
    if (collapsed) pinSidebarOpen();
    else hideSidebar();
  };

  const sidebarOpen = !collapsed || hoverPeek;

  return (
    <div className="flex h-screen overflow-hidden bg-base">
      <PortalThemeSync theme={portalTheme} />
      {isAdminRail ? (
        <AdminRail studioName={studioName} userName={userName} portalTheme={portalTheme} />
      ) : (
      <div
        className="relative hidden shrink-0 md:block"
        style={{ width: collapsed && !hoverPeek ? 12 : 224 }}
      >
        {collapsed && !hoverPeek && (
          <div
            className="absolute inset-y-0 left-0 z-30 w-3 cursor-pointer border-r border-[--hair] bg-surface/80"
            onMouseEnter={openPeek}
          >
            {/* Visible re-open affordance — the bare 12px strip alone is easy
                to miss. Hover still peeks; clicking pins the sidebar open. */}
            <button
              type="button"
              onClick={pinSidebarOpen}
              aria-label={tShell("showSidebar")}
              title={tShell("showSidebar")}
              className="absolute left-0 top-1/2 grid h-10 w-5 -translate-y-1/2 place-items-center rounded-r-lg border border-l-0 border-[--hair] bg-surface text-xs text-muted shadow-sm transition hover:text-ink"
            >
              ›
            </button>
          </div>
        )}

        <aside
          onMouseEnter={openPeek}
          onMouseLeave={closePeek}
          className={`h-full w-56 border-r border-[--hair] bg-surface transition-transform duration-200 ease-out ${
            collapsed && hoverPeek ? "fixed left-0 top-0 z-40 shadow-2xl" : "relative"
          } ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}
        >
          <SidebarContent
            role={role}
            studioName={studioName}
            logoUrl={logoUrl}
            userName={userName}
            pathname={pathname ?? ""}
            collapsed={collapsed}
            onToggleCollapse={toggleCollapse}
            showAffiliations={showAffiliations}
            selfManagedStudent={selfManagedStudent}
            portalTheme={portalTheme}
          />
        </aside>
      </div>
      )}

      <div className="fixed inset-x-0 top-0 z-50 md:hidden">
        <div className="flex items-center justify-between border-b border-[--hair] bg-surface/95 px-4 py-3 backdrop-blur">
          <div className="flex items-center gap-2">
            <StudioAvatar studioName={studioName} logoUrl={logoUrl} />
            <span className="text-sm font-black text-ink">{studioName}</span>
          </div>
          <button
            onClick={() => setMobileOpen((o) => !o)}
            className="grid h-8 w-8 place-items-center text-muted transition-colors hover:text-ink"
            aria-label={tShell("toggleMenu")}
          >
            {mobileOpen ? "✕" : "☰"}
          </button>
        </div>

        <div
          className={`border-b border-[--hair] bg-surface shadow-2xl transition-[max-height,opacity] duration-200 ease-out ${
            mobileOpen
              ? "max-h-[min(80vh,calc(100dvh-3.5rem))] overflow-y-auto overscroll-contain opacity-100"
              : "max-h-0 overflow-hidden opacity-0"
          }`}
        >
          <SidebarContent
            role={role}
            studioName={studioName}
            logoUrl={logoUrl}
            userName={userName}
            pathname={pathname ?? ""}
            onNavClick={() => setMobileOpen(false)}
            showAffiliations={showAffiliations}
            selfManagedStudent={selfManagedStudent}
            portalTheme={portalTheme}
          />
        </div>
      </div>

      <div className="flex flex-1 flex-col overflow-hidden">
        {isAdminRail ? (
          <div className="hidden md:block">
            <AdminTopBar studioName={studioName} onOpenPalette={() => setPaletteOpen(true)} />
          </div>
        ) : (
          showBell && (
            <div className="flex items-center justify-between border-b border-[--hair] bg-surface px-5 py-2">
              <OluneLogo size="xs" className="hidden sm:inline-flex" />
              <NotificationBell />
            </div>
          )
        )}
        <main className={`flex-1 overflow-auto ${showBell && !isAdminRail ? "" : "md:pt-0 pt-[53px]"}`}>{children}</main>
      </div>
      {isAdminRail && <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />}
    </div>
  );
}
