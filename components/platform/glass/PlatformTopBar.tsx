"use client";

// ============================================================================
//  PlatformTopBar — the console's single glass header, matching StudioTopBar:
//  an identity chip on the left ("Operator console · Olune Platform") and a
//  "+ New" menu on the right for the three things operators start most often.
//  The studio portal's ⌘K search and notification bell are studio-scoped
//  (they query one tenant's data), so the console leaves them out rather than
//  showing controls that would do nothing.
// ============================================================================

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";
import { OluneMark } from "@/components/brand/OluneLogo";
import { RippleButton } from "@/components/portal/admin/glass/RippleButton";
import { IconPlus, IconMegaphone, IconCalendarPlus, IconUserPlus } from "@/components/admin/dashboard/icons";

const NEW_MENU_ITEMS = [
  { key: "tasks.newTask", href: "/platform/tasks?new=1", icon: IconCalendarPlus },
  { key: "announcements.draft", href: "/platform/announcements", icon: IconMegaphone },
  { key: "owners.messageOwner", href: "/platform/owners", icon: IconUserPlus },
] as const;

export function PlatformTopBar() {
  const tPlatform = useTranslations("nav.platform");
  const tShell = useTranslations("shell");
  const t = useTranslations("platform");
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
        href="/platform"
        prefetch={false}
        className="flex shrink-0 items-center gap-2.5 rounded-[16px] border px-3 py-1.5 pr-3.5 transition-transform duration-300 hover:-translate-y-px"
        style={{ borderColor: "var(--tb)", background: "linear-gradient(140deg, var(--sheen), var(--sheen2))", boxShadow: "inset 0 1px 0 var(--sheen)" }}
      >
        <span
          className="grid h-9 w-9 shrink-0 place-items-center rounded-[12px]"
          style={{ background: "#1b1a38", boxShadow: "inset 0 1px 0 rgba(255,255,255,.25)" }}
        >
          <OluneMark className="h-6 w-6" glow />
        </span>
        <span className="flex flex-col items-start gap-0.5">
          <span className="text-[9.5px] uppercase tracking-[0.14em] text-muted">{tPlatform("consoleSubtitle")}</span>
          <span className="font-display text-[15px] leading-none tracking-tight text-ink">{tPlatform("consoleTitle")}</span>
        </span>
      </Link>

      <div className="flex-1" />

      <div className="relative shrink-0" ref={newRef}>
        <RippleButton
          variant="solid"
          size="lg"
          sweep
          onClick={() => setNewOpen((o) => !o)}
          aria-expanded={newOpen}
          aria-haspopup="menu"
          className="!gap-1.5"
          style={{
            background: "linear-gradient(150deg, var(--tg), var(--brand) 46%, var(--brand-deep))",
            color: "#fff",
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
              role="menu"
              initial={{ opacity: 0, y: 6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.98 }}
              transition={{ duration: 0.15 }}
              className="absolute right-0 top-full z-40 mt-1.5 w-56 rounded-xl border p-1.5"
              style={{ background: "var(--surface)", borderColor: "var(--hair)", boxShadow: "var(--shadow)" }}
            >
              {NEW_MENU_ITEMS.map(({ key, href, icon: Icon }) => (
                <Link
                  key={key}
                  role="menuitem"
                  href={href}
                  prefetch={false}
                  onClick={() => setNewOpen(false)}
                  className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-ink transition-colors hover:bg-base"
                >
                  <Icon className="h-4 w-4" style={{ color: "var(--brand-deep)" }} />
                  {t(key)}
                </Link>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </header>
  );
}
