"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";
import { signOut } from "@/app/portal/actions";
import type { Role } from "@/lib/types";
import { ADMIN_NAV, OFFICE_NAV, PORTAL_NAV, ROLE_BADGE_KEYS, SELF_MANAGED_STUDENT_NAV, type NavItem, type NavSection } from "@/lib/portal/nav-config";
import { OptimizableImage } from "@/components/ui/OptimizableImage";
import { OluneLogo } from "@/components/brand/OluneLogo";
import { PoweredByOlune } from "@/components/brand/PoweredByOlune";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { ThemeSwitcher } from "@/components/portal/ThemeSwitcher";
import { PortalThemeSync } from "@/components/portal/PortalThemeSync";
import type { ThemeBase } from "@/lib/types";
import { NotificationBell } from "@/components/admin/notifications/NotificationBell";
import { StudioRail } from "@/components/portal/admin/glass/StudioRail";
import { StudioTopBar } from "@/components/portal/admin/glass/StudioTopBar";
import { AmbientBackground } from "@/components/portal/admin/glass/AmbientBackground";
import { CommandPalette } from "@/components/portal/admin/CommandPalette";

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
  adminNav = ADMIN_NAV,
  officeNav = OFFICE_NAV,
  roleNav,
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
  adminNav?: NavSection[];
  officeNav?: NavSection[];
  roleNav?: NavItem[];
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
          adminNav.map((section, index) => (
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
          officeNav.map((section, index) => (
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
            {(roleNav ??
              (role === "student" && selfManagedStudent
                ? SELF_MANAGED_STUDENT_NAV
                : PORTAL_NAV[role])
            )
              .filter(
                (item) =>
                  role !== "teacher" ||
                  showAffiliations ||
                  item.href !== "/portal/teacher/affiliations",
              )
              .map(renderNavItem)}
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
  adminNav = ADMIN_NAV,
  officeNav = OFFICE_NAV,
  roleNav,
  children,
}: {
  role: Role;
  studioName: string;
  logoUrl?: string | null;
  userName: string | null;
  showAffiliations?: boolean;
  selfManagedStudent?: boolean;
  portalTheme?: ThemeBase;
  /** Nav pre-filtered by the studio's entitlements, resolved server-side in
   *  app/portal/layout.tsx. Defaults keep the unfiltered shape. */
  adminNav?: NavSection[];
  officeNav?: NavSection[];
  roleNav?: NavItem[];
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
    <div className={`flex h-screen overflow-hidden bg-base ${isAdminRail ? "admin-glass relative isolate" : ""}`}>
      <PortalThemeSync theme={portalTheme} />
      {isAdminRail && <AmbientBackground />}
      {isAdminRail ? (
        <StudioRail studioName={studioName} userName={userName} portalTheme={portalTheme} nav={adminNav} />
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
            adminNav={adminNav}
            officeNav={officeNav}
            roleNav={roleNav}
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
            adminNav={adminNav}
            officeNav={officeNav}
            roleNav={roleNav}
          />
        </div>
      </div>

      <div className={`flex flex-1 flex-col overflow-hidden ${isAdminRail ? "md:pl-[98px]" : ""}`}>
        {isAdminRail ? (
          <div className="hidden px-[26px] md:block">
            <StudioTopBar studioName={studioName} userName={userName} onOpenPalette={() => setPaletteOpen(true)} />
          </div>
        ) : (
          showBell && (
            <div className="flex items-center justify-between border-b border-[--hair] bg-surface px-5 py-2">
              <OluneLogo size="xs" className="hidden sm:inline-flex" />
              <NotificationBell />
            </div>
          )
        )}
        <main
          className={`flex-1 overflow-auto ${isAdminRail ? "px-[18px] pb-[70px] md:px-[26px]" : ""} ${
            showBell && !isAdminRail ? "" : "md:pt-0 pt-[53px]"
          }`}
        >
          {children}
        </main>
      </div>
      {isAdminRail && (
        <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} nav={adminNav} />
      )}
    </div>
  );
}
