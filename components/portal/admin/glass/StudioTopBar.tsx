"use client";

// ============================================================================
//  StudioTopBar — glass header for the admin shell. Ported from the Claude
//  Design "Aurora Glass Header Redesign" (Studio header.dc.html): one
//  unified glass bar (was three separate floating chips) — studio identity,
//  ⌘K search trigger, notification bell, "+New" menu. Same data/behaviour as
//  before, restyled. The design's studio-switcher dropdown is out of scope —
//  this app has no multi-studio switching for owners yet — so the studio
//  chip links straight to Studio Settings instead.
// ============================================================================

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";
import { NotificationBell } from "@/components/admin/notifications/NotificationBell";
import { RippleButton } from "./RippleButton";
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
  const [newOpen, setNewOpen] = useState(false);
  const newRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (newOpen && newRef.current && !newRef.current.contains(e.target as Node)) setNewOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [newOpen]);

  return (
    <header
      className="sticky top-0 z-30 mb-3.5 flex items-center gap-3 rounded-[24px] border p-2.5"
      style={{
        background: "linear-gradient(148deg, var(--refract), transparent 42%), var(--glass)",
        borderColor: "var(--edge)",
        backdropFilter: "blur(var(--blur-lg)) saturate(1.9)",
        WebkitBackdropFilter: "blur(var(--blur-lg)) saturate(1.9)",
        boxShadow: "var(--shadow), inset 0 1px 0 var(--sheen), inset 0 -1px 0 var(--sheen2), inset 1px 0 0 var(--sheen2)",
      }}
    >
      <Link
        href="/portal/admin/settings"
        prefetch={false}
        className="flex shrink-0 items-center gap-2.5 rounded-[16px] border px-3 py-1.5 pr-3.5 transition-transform duration-300 hover:-translate-y-px"
        style={{ borderColor: "var(--tb)", background: "linear-gradient(140deg, var(--sheen), var(--sheen2))", boxShadow: "inset 0 1px 0 var(--sheen)" }}
      >
        <span
          className="grid h-9 w-9 shrink-0 place-items-center rounded-[12px] text-[16px] font-display text-white"
          style={{ background: "linear-gradient(150deg, var(--tg), var(--brand) 55%, var(--brand-deep))", boxShadow: "inset 0 1px 0 rgba(255,255,255,.5)" }}
        >
          {studioName[0]?.toUpperCase() ?? "S"}
        </span>
        <span className="flex flex-col items-start gap-0.5">
          <span className="text-[9.5px] uppercase tracking-[0.14em] text-muted">{tShell("studioLabel")}</span>
          <span className="font-display text-[15px] leading-none tracking-tight text-ink">{studioName}</span>
        </span>
      </Link>

      <button
        type="button"
        onClick={onOpenPalette}
        className="relative flex h-[46px] max-w-[430px] flex-1 items-center gap-3 overflow-hidden rounded-[16px] border px-4 text-[13.5px] text-muted transition-colors"
        style={{ background: "var(--glass2)", borderColor: "var(--hair)", backdropFilter: "blur(var(--blur))" }}
      >
        <IconSearch className="h-[16px] w-[16px] shrink-0" />
        <span className="flex-1 truncate text-left">{tShell("palette.placeholder")}</span>
        <kbd className="rounded-md border px-1.5 py-0.5 text-[10.5px]" style={{ borderColor: "var(--hair)", background: "var(--glass)" }}>
          ⌘K
        </kbd>
      </button>

      <div className="flex-1" />

      <div className="flex shrink-0 items-center gap-2.5">
        <NotificationBell size="lg" />
        <div className="h-6 w-px" style={{ background: "var(--hair)" }} />
        <div className="relative" ref={newRef}>
          <RippleButton
            variant="solid"
            size="lg"
            sweep
            onClick={() => setNewOpen((o) => !o)}
            className="!gap-1.5"
            style={{
              background: "linear-gradient(150deg, var(--tg), var(--brand) 46%, var(--brand-deep))",
              boxShadow: "var(--shadow-brand-glow), inset 0 1px 0 rgba(255,255,255,.34)",
              border: "1px solid rgba(255,255,255,.22)",
            }}
          >
            <IconPlus className="h-4 w-4" />
            {tShell("palette.new")}
          </RippleButton>
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
