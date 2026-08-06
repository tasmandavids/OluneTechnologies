"use client";

// Step 1: Select child + class (browse by day / discipline, capacity check).
// Pure file split from EnrollModal.tsx (1.6.1) — no logic changes.

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations } from "next-intl";
import { useShortDayNames, useFormatTimeShort } from "@/lib/i18n/client";
import type { Child } from "@/app/portal/parent/page";
import { getAvailableClasses, type AvailableClass } from "@/app/portal/parent/enroll/actions";
import { NZD } from "./types";

function ClassCard({
  cls,
  selected,
  includedInBatch,
  onToggle,
}: {
  cls: AvailableClass;
  selected: boolean;
  includedInBatch: boolean;
  onToggle: () => void;
}) {
  const t = useTranslations("parent.enroll");
  const dayShort = useShortDayNames();
  const fmtTime = useFormatTimeShort();
  const spotsLeft = cls.capacity - cls.enrolled;
  const isFull = spotsLeft <= 0;

  return (
    <button
      type="button"
      onClick={isFull ? undefined : onToggle}
      disabled={isFull}
      className={`w-full rounded-xl border p-4 text-left transition-all ${
        selected
          ? "border-[--brand] bg-[color-mix(in_srgb,var(--brand)_8%,transparent)]"
          : isFull
          ? "border-[--hair] bg-surface opacity-60 cursor-not-allowed"
          : "border-[--hair] bg-surface hover:border-[--brand]"
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
            selected
              ? "border-[--brand] bg-[--brand] text-white"
              : "border-[--hair] bg-base"
          }`}
        >
          {selected && (
            <svg viewBox="0 0 10 8" fill="none" className="h-2.5 w-2.5">
              <path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </div>
        <div className="flex flex-1 items-start justify-between gap-2">
          <div>
            <p className="font-semibold text-ink">{cls.name}</p>
            <p className="mt-0.5 text-xs text-muted">
              {cls.discipline}
              {cls.level ? ` · ${cls.level}` : ""}
            </p>
            <p className="mt-1 text-xs text-muted">
              {cls.dayOfWeek !== null ? dayShort[cls.dayOfWeek] : ""}
              {cls.startTime ? ` · ${fmtTime(cls.startTime)}` : ""}
            </p>
          </div>
          <div className="text-right shrink-0">
            {includedInBatch ? (
              <p className="text-sm font-bold" style={{ color: "var(--brand)" }}>
                {t("programIncluded")}
              </p>
            ) : (
              <p className="text-sm font-bold text-ink">
                {cls.priceCents > 0 ? NZD.format(cls.priceCents / 100) : t("free")}
              </p>
            )}
            <p
              className="mt-1 text-[0.62rem] font-semibold uppercase tracking-wide"
              style={{ color: isFull ? "#ef4444" : spotsLeft <= 3 ? "var(--brand-hot)" : "var(--muted)" }}
            >
              {isFull ? t("fullWaitlist") : t("spotsLeft", { count: spotsLeft })}
            </p>
          </div>
        </div>
      </div>
    </button>
  );
}

function SuggestedClassesPanel({
  childName,
  suggestions,
  onAdd,
}: {
  childName: string | null;
  suggestions: AvailableClass[];
  onAdd: (id: string) => void;
}) {
  const t = useTranslations("parent.enroll");
  const dayShort = useShortDayNames();
  const fmtTime = useFormatTimeShort();

  if (suggestions.length === 0 || typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ x: 336, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 336, opacity: 0 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        className="fixed inset-y-0 right-0 z-[60] hidden w-80 flex-col gap-3 overflow-y-auto border-l border-[--hair] bg-base p-5 shadow-2xl lg:flex"
      >
        <div>
          <p className="text-[0.62rem] font-semibold uppercase tracking-wider text-muted">
            {t("suggestedTitle", { name: childName ?? t("yourDancer") })}
          </p>
          <p className="mt-1 text-xs text-muted">{t("suggestedHint")}</p>
        </div>
        <div className="flex flex-col gap-2">
          {suggestions.map((cls) => (
            <div key={cls.id} className="box rounded-xl p-3">
              <p className="text-sm font-semibold text-ink">{cls.name}</p>
              <p className="mt-0.5 text-xs text-muted">
                {cls.discipline}
                {cls.level ? ` · ${cls.level}` : ""}
              </p>
              <p className="mt-0.5 text-xs text-muted">
                {cls.dayOfWeek !== null ? dayShort[cls.dayOfWeek] : ""}
                {cls.startTime ? ` · ${fmtTime(cls.startTime)}` : ""}
              </p>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-xs font-bold" style={{ color: "var(--brand)" }}>
                  {t("programIncluded")}
                </span>
                <button
                  type="button"
                  onClick={() => onAdd(cls.id)}
                  className="rounded-lg px-3 py-1 text-xs font-bold text-white transition-opacity hover:opacity-90"
                  style={{ background: "var(--brand)" }}
                >
                  {t("addClass")}
                </button>
              </div>
            </div>
          ))}
        </div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}

export function Step1SelectClass({
  familyChildren,
  onNext,
}: {
  familyChildren: Child[];
  onNext: (data: { childId: string; childName: string | null; classes: AvailableClass[] }) => void;
}) {
  const t = useTranslations("parent.enroll");
  const dayShort = useShortDayNames();
  const [childId, setChildId] = useState(familyChildren[0]?.studentId ?? "");
  const [classes, setClasses] = useState<AvailableClass[]>([]);
  const [filter, setFilter] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getAvailableClasses().then((res) => {
      if (res.ok) setClasses(res.data);
      else setError(res.error);
      setLoading(false);
    });
  }, []);

  const filtered = classes.filter((c) => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      (c.discipline?.toLowerCase().includes(q) ?? false) ||
      (c.level?.toLowerCase().includes(q) ?? false) ||
      (c.dayOfWeek !== null && dayShort[c.dayOfWeek].toLowerCase().includes(q))
    );
  });

  function toggleClass(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const selectedChild = familyChildren.find((c) => c.studentId === childId);
  const selectedClasses = classes.filter((c) => selectedIds.has(c.id));

  // Compute which selected classes are "included" (linked recurring-series
  // sibling of one already counted, not the first). Only an explicit shared
  // recurringGroupId counts — never matched by class name.
  const paidGroupsInSelection = new Set<string>();
  const includedInBatchIds = new Set<string>();
  for (const c of selectedClasses) {
    if (!c.recurringGroupId) continue;
    if (paidGroupsInSelection.has(c.recurringGroupId)) {
      includedInBatchIds.add(c.id);
    } else {
      paidGroupsInSelection.add(c.recurringGroupId);
    }
  }
  const totalCents = selectedClasses
    .filter((c) => !includedInBatchIds.has(c.id))
    .reduce((sum, c) => sum + c.priceCents, 0);

  // Suggested classes: other days of a linked recurring series the dancer is
  // already enrolled in (or has just selected) — same recurringGroupId, so
  // they'd be billed as "Included" per lib/enrollment-billing.ts.
  const activeClassIds = new Set((selectedChild?.classes ?? []).map((c) => c.id));
  const relevantGroupIds = new Set(
    [
      ...(selectedChild?.classes ?? []).map((c) => c.recurringGroupId),
      ...selectedClasses.map((c) => c.recurringGroupId),
    ].filter((id): id is string => !!id),
  );
  const suggestions = classes.filter(
    (c) =>
      !selectedIds.has(c.id) &&
      !activeClassIds.has(c.id) &&
      c.capacity - c.enrolled > 0 &&
      !!c.recurringGroupId &&
      relevantGroupIds.has(c.recurringGroupId),
  );

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-base font-bold text-ink">{t("chooseClass")}</h3>

      {/* Child selector */}
      {familyChildren.length > 1 && (
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted">
            {t("enrollingFor")}
          </label>
          <select
            value={childId}
            onChange={(e) => { setChildId(e.target.value); setSelectedIds(new Set()); }}
            className="w-full rounded-lg border border-[--hair] bg-base px-3 py-2 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-[--brand]"
          >
            {familyChildren.map((c) => (
              <option key={c.studentId} value={c.studentId}>
                {c.name ?? t("unnamedDancer")}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Search */}
      <input
        type="text"
        placeholder={t("searchClasses")}
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="w-full rounded-lg border border-[--hair] bg-base px-3 py-2 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-[--brand]"
      />

      {/* Class list */}
      {loading ? (
        <div className="py-8 text-center text-sm text-muted animate-pulse">{t("loadingClasses")}</div>
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</div>
      ) : filtered.length === 0 ? (
        <div className="py-8 text-center text-sm text-muted">{t("noClassesMatch")}</div>
      ) : (
        <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
          {filtered.map((cls) => (
            <ClassCard
              key={cls.id}
              cls={cls}
              selected={selectedIds.has(cls.id)}
              includedInBatch={includedInBatchIds.has(cls.id)}
              onToggle={() => toggleClass(cls.id)}
            />
          ))}
        </div>
      )}

      {/* Selection summary */}
      {selectedIds.size > 0 && (
        <div className="box flex items-center justify-between rounded-lg px-3 py-2 text-xs">
          <span className="text-muted">
            {selectedIds.size === 1
              ? t("classSelected", { count: 1 })
              : t("classesSelected", { count: selectedIds.size })}
          </span>
          {totalCents > 0 && (
            <span className="font-bold text-ink">{NZD.format(totalCents / 100)}</span>
          )}
        </div>
      )}

      <button
        type="button"
        disabled={selectedIds.size === 0 || !childId}
        onClick={() => {
          if (selectedClasses.length > 0) {
            onNext({ childId, childName: selectedChild?.name ?? null, classes: selectedClasses });
          }
        }}
        className="mt-2 w-full rounded-xl py-3 text-sm font-bold text-white transition-opacity disabled:opacity-40"
        style={{ background: "var(--brand)" }}
      >
        {t("continue")}
      </button>

      <SuggestedClassesPanel
        childName={selectedChild?.name ?? null}
        suggestions={suggestions}
        onAdd={toggleClass}
      />
    </div>
  );
}
