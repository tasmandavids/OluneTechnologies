"use client";

// ============================================================================
//  CommandPalette — ⌘K search over every ADMIN_NAV destination (13 items incl.
//  children). Same data source as AdminRail's flyouts, so nothing drifts.
//  "Every existing feature keeps a home (rail) and gains a second path via
//  ⌘K" — Redesign Strategy §3.
// ============================================================================

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";
import { useEscToClose } from "@/lib/useEscToClose";
import { ADMIN_NAV, flattenNav, type NavSection } from "@/lib/portal/nav-config";
import { IconSearch, IconX } from "@/components/admin/dashboard/icons";

export function CommandPalette({
  open,
  onClose,
  nav = ADMIN_NAV,
}: {
  open: boolean;
  onClose: () => void;
  /** Entitlement-filtered admin nav — ⌘K must not surface a gated module. */
  nav?: NavSection[];
}) {
  const t = useTranslations();
  const tShell = useTranslations("shell");
  const router = useRouter();
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEscToClose(onClose, open);

  useEffect(() => {
    if (open) {
      setQuery("");
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const labeled = flattenNav(nav).map((item) => ({
      item,
      label: t(item.labelKey as Parameters<typeof t>[0]),
    }));
    if (!q) return labeled;
    return labeled.filter((r) => r.label.toLowerCase().includes(q));
  }, [query, t, nav]);

  function go(href: string) {
    router.push(href);
    onClose();
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          className="fixed inset-0 z-[100] flex items-start justify-center pt-[14vh] backdrop-blur-[8px]"
          style={{ background: "color-mix(in srgb, var(--text) 25%, transparent)" }}
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg overflow-hidden rounded-2xl border"
            style={{
              background: "linear-gradient(148deg, var(--refract), transparent 42%), var(--glass)",
              borderColor: "var(--edge)",
              backdropFilter: "blur(var(--blur-lg)) saturate(1.9)",
              WebkitBackdropFilter: "blur(var(--blur-lg)) saturate(1.9)",
              boxShadow: "var(--shadow), inset 0 1px 0 var(--sheen), inset 0 -1px 0 var(--sheen2)",
            }}
          >
            <div className="flex items-center gap-2.5 border-b px-4 py-3" style={{ borderColor: "var(--hair)" }}>
              <IconSearch className="h-[18px] w-[18px] shrink-0 text-muted" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && results[0]) go(results[0].item.href);
                }}
                placeholder={tShell("palette.placeholder")}
                className="flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-muted"
              />
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-muted transition hover:bg-[--glass2] hover:text-ink"
              >
                <IconX className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="max-h-80 overflow-y-auto p-1.5">
              {results.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-muted">{tShell("palette.empty")}</p>
              ) : (
                results.map(({ item, label }) => (
                  <button
                    key={item.href}
                    type="button"
                    onClick={() => go(item.href)}
                    className="flex w-full items-center rounded-lg px-3 py-2.5 text-left text-sm font-medium text-ink transition-colors hover:bg-[--t2]"
                  >
                    {label}
                  </button>
                ))
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
