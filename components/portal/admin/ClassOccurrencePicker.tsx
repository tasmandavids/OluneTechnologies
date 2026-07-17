"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";

export type PickableClass = {
  id: string;
  name: string;
  discipline: string | null;
  level: string | null;
};

interface Props {
  classes: PickableClass[];
  onConfirm: (classId: string, date: string) => void;
  busy?: boolean;
}

function todayIso(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export default function ClassOccurrencePicker({ classes, onConfirm, busy }: Props) {
  const t = useTranslations("admin.passes");
  const [query, setQuery] = useState("");
  const [classId, setClassId] = useState<string | null>(null);
  const [date, setDate] = useState(todayIso());

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? classes.filter(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            (c.discipline ?? "").toLowerCase().includes(q) ||
            (c.level ?? "").toLowerCase().includes(q),
        )
      : classes.filter((c) => (c.discipline ?? "").toLowerCase().includes("ballet"));
    return base.length ? base : classes;
  }, [classes, query]);

  return (
    <div className="flex flex-col gap-3">
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted">
          {t("searchClass")}
        </label>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("searchClassPlaceholder")}
          className="w-full rounded-xl border border-[--hair] bg-base px-3 py-2 text-sm text-ink"
        />
      </div>

      <div className="max-h-56 overflow-y-auto rounded-xl border border-[--hair]">
        {filtered.length === 0 ? (
          <p className="px-3 py-4 text-center text-sm text-muted">{t("noClasses")}</p>
        ) : (
          filtered.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setClassId(c.id)}
              className={`block w-full border-b border-[--hair] px-3 py-2.5 text-left text-sm last:border-b-0 ${
                classId === c.id ? "bg-[color-mix(in_srgb,var(--brand)_14%,var(--surface))]" : "hover:bg-base"
              }`}
            >
              <span className="font-medium text-ink">{c.name}</span>
              <span className="ml-2 text-xs text-muted">
                {[c.discipline, c.level].filter(Boolean).join(" · ")}
              </span>
            </button>
          ))
        )}
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted">
          {t("occurrenceDate")}
        </label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-full rounded-xl border border-[--hair] bg-base px-3 py-2 text-sm text-ink"
        />
      </div>

      <button
        type="button"
        disabled={!classId || busy}
        onClick={() => classId && onConfirm(classId, date)}
        className="w-full rounded-xl bg-brand py-3 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40"
      >
        {busy ? t("redeeming") : t("confirmRedeem")}
      </button>
    </div>
  );
}
