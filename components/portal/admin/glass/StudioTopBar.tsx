"use client";

// ============================================================================
//  StudioTopBar — glass header for the admin shell: studio chip, ⌘K search
//  trigger, notification bell, "+New" menu. Same data/behaviour as the old
//  AdminTopBar (components/portal/PortalShellClient.tsx), restyled.
// ============================================================================

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";
import { NotificationBell } from "@/components/admin/notifications/NotificationBell";
import { onMagnetMove, onMagnetLeave, onRipple } from "./useMicroInteractions";
import { IconSearch, IconPlus, IconCalendarPlus, IconReceipt, IconMegaphone, IconUserPlus } from "@/components/admin/dashboard/icons";

const NEW_MENU_ITEMS = [
  { key: "addClass", href: "/portal/admin/classes", icon: IconCalendarPlus },
  { key: "newInvoice", href: "/portal/admin/money?tab=invoices", icon: IconReceipt },
  { key: "message", href: "/portal/admin/messages", icon: IconMegaphone },
  { key: "addLead", href: "/portal/admin/leads", icon: IconUserPlus },
] as const;

export function StudioTopBar({ studioName, onOpenPalette }: { studioName: string; onOpenPalette: () => void }) {
  const t = useTranslations();
  const tShell = useTranslations("shell");
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

  const glassChip = {
    background: "linear-gradient(148deg, var(--refract), transparent 42%), var(--glass)",
    borderColor: "var(--edge)",
    backdropFilter: "blur(var(--blur)) saturate(1.85)",
    WebkitBackdropFilter: "blur(var(--blur)) saturate(1.85)",
    boxShadow: "var(--shadow-s), inset 0 1px 0 var(--sheen), inset 0 -1px 0 var(--sheen2), inset 1px 0 0 var(--sheen2)",
  } as const;

  return (
    <header className="sticky top-0 z-30 flex items-center gap-3.5 px-1 pb-3 pt-3.5" style={{ background: "linear-gradient(var(--base) 30%, transparent)" }}>
      <div
        onMouseMove={onMagnetMove}
        onMouseLeave={onMagnetLeave}
        className="flex items-center gap-2.5 rounded-[14px] border px-3 py-2 transition-transform duration-300"
        style={glassChip}
      >
        <span
          className="grid h-6 w-6 place-items-center rounded-lg text-[10px] font-bold"
          style={{ background: "linear-gradient(150deg, var(--tg), var(--brand))", color: "#fff" }}
        >
          {studioName[0]?.toUpperCase() ?? "S"}
        </span>
        <span className="text-[13px] font-semibold text-ink">{studioName}</span>
      </div>

      <button
        type="button"
        onClick={onOpenPalette}
        className="relative flex max-w-[430px] flex-1 items-center gap-2.5 overflow-hidden rounded-[14px] border px-3.5 py-2.5 text-[13px] text-muted transition-colors"
        style={{ background: "var(--glass2)", borderColor: "var(--hair)", backdropFilter: "blur(var(--blur))" }}
      >
        <IconSearch className="h-[15px] w-[15px] shrink-0" />
        <span className="flex-1 truncate text-left">{tShell("palette.placeholder")}</span>
        <kbd className="rounded-md border px-1.5 py-0.5 text-[10.5px]" style={{ borderColor: "var(--hair)", background: "var(--glass)" }}>
          ⌘K
        </kbd>
      </button>

      <div className="flex-1" />

      <div className="flex items-center gap-2 rounded-[14px] border p-1.5" style={glassChip}>
        <NotificationBell />
        <div className="h-5 w-px" style={{ background: "var(--hair)" }} />
        <div className="relative" ref={newRef}>
          <button
            type="button"
            onClick={(e) => {
              onRipple(e);
              setNewOpen((o) => !o);
            }}
            className="relative flex items-center gap-1.5 overflow-hidden rounded-[10px] px-3.5 py-2 text-[12.5px] font-semibold transition-transform hover:-translate-y-px active:translate-y-0 active:scale-[.97]"
            style={{ background: "var(--ink, var(--text))", color: "var(--base)" }}
          >
            <span className="pointer-events-none absolute inset-0 -translate-x-[130%] bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.4),transparent)] animate-[admin-sweep_4.6s_ease-in-out_infinite]" />
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
                className="absolute right-0 top-full z-40 mt-1.5 w-48 rounded-xl border p-1.5"
                style={{ background: "var(--surface)", borderColor: "var(--hair)", boxShadow: "var(--shadow)" }}
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
      </div>
    </header>
  );
}
