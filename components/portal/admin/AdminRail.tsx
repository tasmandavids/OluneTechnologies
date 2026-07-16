"use client";

// ============================================================================
//  AdminRail — desktop-only icon rail replacing the labeled sidebar for the
//  admin role. Groups ADMIN_NAV's 13 destinations into 7 spaces (per the
//  Olune redesign strategy doc); every destination stays one or two clicks
//  away via a flyout, nothing is ⌘K-only.
// ============================================================================

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";
import { signOut } from "@/app/portal/actions";
import { ADMIN_NAV, type NavItem, type NavSection } from "@/lib/portal/nav-config";
import { ThemeSwitcher } from "@/components/portal/ThemeSwitcher";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import type { ThemeBase } from "@/lib/types";
import {
  IconSun,
  IconUsers,
  IconCalendarDays,
  IconWallet,
  IconInbox,
  IconGlobe,
  IconSettings,
} from "@/components/admin/dashboard/icons";

function flattenNav(sections: NavSection[]): NavItem[] {
  const out: NavItem[] = [];
  for (const section of sections) {
    for (const item of section.items) {
      out.push(item);
      if (item.children) out.push(...item.children);
    }
  }
  return out;
}

const FLAT_NAV = flattenNav(ADMIN_NAV);
const byHref = (href: string) => FLAT_NAV.find((i) => i.href === href);

type Space = {
  id: string;
  labelKey: string;
  icon: typeof IconSun;
  hrefs: string[];
};

const SPACES: Space[] = [
  { id: "today", labelKey: "shell.rail.today", icon: IconSun, hrefs: ["/portal/admin"] },
  {
    id: "people",
    labelKey: "shell.rail.people",
    icon: IconUsers,
    hrefs: ["/portal/admin/students", "/portal/admin/parents", "/portal/admin/badges", "/portal/admin/leads"],
  },
  {
    id: "schedule",
    labelKey: "shell.rail.schedule",
    icon: IconCalendarDays,
    hrefs: [
      "/portal/admin/classes",
      "/portal/admin/events",
      "/portal/admin/substitutes",
      "/portal/admin/availability",
      "/portal/admin/private-lessons",
    ],
  },
  {
    id: "money",
    labelKey: "shell.rail.money",
    icon: IconWallet,
    hrefs: ["/portal/admin/billing", "/portal/admin/accounting", "/portal/admin/shop"],
  },
  {
    id: "inbox",
    labelKey: "shell.rail.inbox",
    icon: IconInbox,
    hrefs: ["/portal/admin/messages", "/portal/admin/support"],
  },
  {
    id: "studio",
    labelKey: "shell.rail.studio",
    icon: IconGlobe,
    hrefs: ["/portal/admin/site", "/portal/admin/advertising", "/portal/admin/staff"],
  },
  { id: "settings", labelKey: "shell.rail.settings", icon: IconSettings, hrefs: ["/portal/admin/settings"] },
];

function isActiveHref(pathname: string, item: NavItem): boolean {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + "/");
}

function RailButton({
  space,
  pathname,
  open,
  onToggle,
}: {
  space: Space;
  pathname: string;
  open: boolean;
  onToggle: () => void;
}) {
  const t = useTranslations();
  const items = space.hrefs.map(byHref).filter((i): i is NavItem => !!i);
  const active = items.some((i) => isActiveHref(pathname, i));
  const Icon = space.icon;
  const label = t(space.labelKey as Parameters<typeof t>[0]);

  if (items.length <= 1) {
    const href = items[0]?.href ?? space.hrefs[0];
    return (
      <Link
        href={href}
        prefetch={false}
        title={label}
        aria-label={label}
        className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl transition-all duration-150 ${
          active
            ? "bg-[color-mix(in_srgb,var(--brand)_14%,var(--surface))] text-[--brand-deep]"
            : "text-muted hover:-translate-y-px hover:bg-base hover:text-ink"
        }`}
      >
        <Icon className="h-[19px] w-[19px]" strokeWidth={1.7} />
      </Link>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        title={label}
        aria-label={label}
        aria-expanded={open}
        onClick={onToggle}
        className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl transition-all duration-150 ${
          active || open
            ? "bg-[color-mix(in_srgb,var(--brand)_14%,var(--surface))] text-[--brand-deep]"
            : "text-muted hover:-translate-y-px hover:bg-base hover:text-ink"
        }`}
      >
        <Icon className="h-[19px] w-[19px]" strokeWidth={1.7} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, x: -6, scale: 0.98 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -6, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute left-[52px] top-0 z-40 w-52 rounded-xl border border-[--hair] bg-surface p-1.5 shadow-2xl"
          >
            <p className="px-2.5 py-1.5 text-[10.5px] font-semibold uppercase tracking-widest text-muted">
              {label}
            </p>
            {items.map((item) => {
              const itemActive = isActiveHref(pathname, item);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch={false}
                  onClick={onToggle}
                  className={`block rounded-lg px-2.5 py-2 text-sm font-medium transition-colors ${
                    itemActive
                      ? "bg-[color-mix(in_srgb,var(--brand)_14%,var(--surface))] text-ink"
                      : "text-muted hover:bg-base hover:text-ink"
                  }`}
                >
                  {t(item.labelKey as Parameters<typeof t>[0])}
                </Link>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function AdminRail({
  studioName,
  userName,
  portalTheme = "light",
}: {
  studioName: string;
  userName: string | null;
  portalTheme?: ThemeBase;
}) {
  const pathname = usePathname() ?? "";
  const t = useTranslations();
  const tCommon = useTranslations("common");
  const [openSpace, setOpenSpace] = useState<string | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const railRef = useRef<HTMLDivElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (openSpace && railRef.current && !railRef.current.contains(e.target as Node)) setOpenSpace(null);
      if (accountOpen && accountRef.current && !accountRef.current.contains(e.target as Node)) setAccountOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [openSpace, accountOpen]);

  useEffect(() => {
    setOpenSpace(null);
  }, [pathname]);

  return (
    <aside
      ref={railRef}
      className="hidden h-full w-16 shrink-0 flex-col items-center gap-1.5 border-r border-[--hair] bg-surface py-4 md:flex"
    >
      <Link href="/portal/admin" prefetch={false} className="mb-2 grid h-8 w-8 place-items-center" title={studioName}>
        <span className="h-6 w-6 rounded-full" style={{ background: "var(--brand)" }} />
      </Link>

      {SPACES.filter((s) => s.id !== "settings").map((space) => (
        <RailButton
          key={space.id}
          space={space}
          pathname={pathname}
          open={openSpace === space.id}
          onToggle={() => setOpenSpace((cur) => (cur === space.id ? null : space.id))}
        />
      ))}

      <div className="flex-1" />

      <RailButton
        space={SPACES.find((s) => s.id === "settings")!}
        pathname={pathname}
        open={openSpace === "settings"}
        onToggle={() => setOpenSpace((cur) => (cur === "settings" ? null : "settings"))}
      />

      <div className="relative mt-1" ref={accountRef}>
        <button
          type="button"
          onClick={() => setAccountOpen((o) => !o)}
          title={t("shell.rail.account" as Parameters<typeof t>[0])}
          aria-label={t("shell.rail.account" as Parameters<typeof t>[0])}
          className="grid h-8 w-8 place-items-center rounded-full text-xs font-bold text-[--brand-deep] transition hover:opacity-80"
          style={{ background: "color-mix(in srgb, var(--brand) 14%, var(--surface))" }}
        >
          {studioName[0]?.toUpperCase() ?? "S"}
        </button>
        <AnimatePresence>
          {accountOpen && (
            <motion.div
              initial={{ opacity: 0, y: 6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.98 }}
              transition={{ duration: 0.15 }}
              className="absolute bottom-0 left-[52px] z-40 w-56 rounded-xl border border-[--hair] bg-surface p-3 shadow-2xl"
            >
              <p className="mb-2.5 truncate text-sm font-semibold text-ink">{userName ?? tCommon("you")}</p>
              <ThemeSwitcher value={portalTheme} className="mb-2 w-full justify-between" />
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
    </aside>
  );
}

export { FLAT_NAV };
