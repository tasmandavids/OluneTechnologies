"use client";

// ============================================================================
//  CommandPalette — ⌘K search over every ADMIN_NAV destination (13 items incl.
//  children) PLUS live studio data (students, staff, parents, classes, leads)
//  via /api/portal/search. Nav results are instant/local; data results are
//  debounced and fetched from the server. "Every existing feature keeps a
//  home (rail) and gains a second path via ⌘K" — Redesign Strategy §3.
// ============================================================================

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";
import { useEscToClose } from "@/lib/useEscToClose";
import { ADMIN_NAV, flattenNav, type NavSection } from "@/lib/portal/nav-config";
import { IconSearch, IconX, IconUsers, IconCalendarDays, IconUserPlus } from "@/components/admin/dashboard/icons";
import type { PortalSearchResult } from "@/app/api/portal/search/route";

type Row =
  | { kind: "nav"; key: string; href: string; label: string }
  | { kind: "data"; key: string; href: string; label: string; sublabel: string | null; type: PortalSearchResult["type"] };

const DATA_TYPE_ICON: Record<PortalSearchResult["type"], typeof IconUsers> = {
  student: IconUsers,
  staff: IconUsers,
  parent: IconUsers,
  class: IconCalendarDays,
  lead: IconUserPlus,
};

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
  const [dataResults, setDataResults] = useState<PortalSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEscToClose(onClose, open);

  useEffect(() => {
    if (open) {
      setQuery("");
      setDataResults([]);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const navResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    const labeled = flattenNav(nav).map((item) => ({
      item,
      label: t(item.labelKey as Parameters<typeof t>[0]),
    }));
    if (!q) return labeled;
    return labeled.filter((r) => r.label.toLowerCase().includes(q));
  }, [query, t, nav]);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setDataResults([]);
      setSearching(false);
      return;
    }
    const controller = new AbortController();
    setSearching(true);
    const timer = setTimeout(() => {
      fetch(`/api/portal/search?q=${encodeURIComponent(term)}`, { signal: controller.signal })
        .then((res) => (res.ok ? res.json() : { results: [] }))
        .then((body: { results?: PortalSearchResult[] }) => setDataResults(body.results ?? []))
        .catch((err) => {
          if (err?.name !== "AbortError") setDataResults([]);
        })
        .finally(() => setSearching(false));
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const rows = useMemo<Row[]>(() => {
    const navRows: Row[] = navResults.map((r) => ({
      kind: "nav",
      key: `nav:${r.item.href}`,
      href: r.item.href,
      label: r.label,
    }));
    const dataRows: Row[] = dataResults.map((r) => ({
      kind: "data",
      key: `${r.type}:${r.id}`,
      href: r.href,
      label: r.label,
      sublabel: r.sublabel,
      type: r.type,
    }));
    return [...navRows, ...dataRows];
  }, [navResults, dataResults]);

  const groups = useMemo(() => {
    const byType = new Map<string, Row[]>();
    for (const row of rows) {
      const groupKey = row.kind === "nav" ? "pages" : row.type;
      if (!byType.has(groupKey)) byType.set(groupKey, []);
      byType.get(groupKey)!.push(row);
    }
    return byType;
  }, [rows]);

  function go(href: string) {
    router.push(href);
    onClose();
  }

  const groupOrder: { key: string; labelKey: Parameters<typeof tShell>[0] }[] = [
    { key: "pages", labelKey: "palette.pages" },
    { key: "student", labelKey: "palette.students" },
    { key: "staff", labelKey: "palette.staff" },
    { key: "parent", labelKey: "palette.parents" },
    { key: "class", labelKey: "palette.classes" },
    { key: "lead", labelKey: "palette.leads" },
  ];

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
                  if (e.key === "Enter" && rows[0]) go(rows[0].href);
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
            <div className="max-h-96 overflow-y-auto p-1.5">
              {rows.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-muted">
                  {searching ? tShell("palette.searching") : tShell("palette.empty")}
                </p>
              ) : (
                groupOrder.map(({ key, labelKey }) => {
                  const groupRows = groups.get(key);
                  if (!groupRows || groupRows.length === 0) return null;
                  return (
                    <div key={key} className="mb-1 last:mb-0">
                      <p className="px-3 pb-1 pt-2 text-[10.5px] font-semibold uppercase tracking-wide text-muted">
                        {tShell(labelKey)}
                      </p>
                      {groupRows.map((row) => {
                        const Icon = row.kind === "data" ? DATA_TYPE_ICON[row.type] : null;
                        return (
                          <button
                            key={row.key}
                            type="button"
                            onClick={() => go(row.href)}
                            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-ink transition-colors hover:bg-[--t2]"
                          >
                            {Icon && <Icon className="h-4 w-4 shrink-0 text-muted" />}
                            <span className="flex-1 truncate">{row.label}</span>
                            {row.kind === "data" && row.sublabel && (
                              <span className="shrink-0 truncate text-xs font-normal text-muted">{row.sublabel}</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  );
                })
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
