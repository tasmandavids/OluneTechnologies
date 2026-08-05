"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useLocale, useTranslations } from "next-intl";
import {
  cancelScheduleEntry,
  createScheduleEntry,
  deleteScheduleEntry,
  updateScheduleEntry,
} from "@/app/portal/admin/students/schedule-actions";
import {
  SCHEDULE_ENTRY_TYPES,
  type ScheduleEntry,
  type ScheduleEntryType,
} from "@/lib/students/schedule-types";
import { addWeeks, getWeekRange } from "@/lib/staff/week";
import { formatTimeShort } from "@/lib/i18n/format";
import { GlassPanel } from "@/components/portal/admin/glass/GlassPanel";

const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

type EntryForm = {
  id: string | null;
  title: string;
  description: string;
  entryDate: string;
  startTime: string;
  endTime: string;
  entryType: ScheduleEntryType;
  locationName: string;
};

const EMPTY_FORM: EntryForm = {
  id: null,
  title: "",
  description: "",
  entryDate: "",
  startTime: "16:00",
  endTime: "17:00",
  entryType: "other",
  locationName: "",
};

export default function StudentSchedulePanel({
  studentId,
  entries: initialEntries,
  weekStart: initialWeekStart,
}: {
  studentId: string;
  entries: ScheduleEntry[];
  weekStart: string;
}) {
  const t = useTranslations("admin.students.schedule");
  const tShared = useTranslations("admin.shared");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const [weekStart, setWeekStart] = useState(initialWeekStart);
  const entries = initialEntries;
  const [form, setForm] = useState<EntryForm | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const { weekDates } = useMemo(() => getWeekRange(new Date(`${weekStart}T12:00:00`)), [weekStart]);

  const entriesForWeek = useMemo(
    () => entries.filter((e) => weekDates.includes(e.entryDate)),
    [entries, weekDates],
  );

  const entriesByDate = useMemo(() => {
    const map = new Map<string, ScheduleEntry[]>();
    for (const entry of entriesForWeek) {
      const list = map.get(entry.entryDate) ?? [];
      list.push(entry);
      map.set(entry.entryDate, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => (a.startTime ?? "").localeCompare(b.startTime ?? ""));
    }
    return map;
  }, [entriesForWeek]);

  const weekLabel = `${new Date(`${weekDates[0]}T12:00:00`).toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
  })} – ${new Date(`${weekDates[6]}T12:00:00`).toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  })}`;

  const openNew = (entryDate: string) => {
    setForm({ ...EMPTY_FORM, entryDate });
    setError(null);
  };

  const openEdit = (entry: ScheduleEntry) => {
    setForm({
      id: entry.id,
      title: entry.title,
      description: entry.description ?? "",
      entryDate: entry.entryDate,
      startTime: entry.startTime ?? "16:00",
      endTime: entry.endTime ?? "17:00",
      entryType: entry.entryType,
      locationName: entry.locationName ?? "",
    });
    setError(null);
  };

  const save = () => {
    if (!form) return;
    setError(null);
    startTransition(async () => {
      const payload = {
        studentId,
        title: form.title,
        description: form.description,
        entryDate: form.entryDate,
        startTime: form.startTime,
        endTime: form.endTime,
        entryType: form.entryType,
        locationName: form.locationName,
      };
      const result = form.id
        ? await updateScheduleEntry(form.id, payload)
        : await createScheduleEntry(payload);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setForm(null);
      router.refresh();
    });
  };

  const remove = (entry: ScheduleEntry) => {
    setError(null);
    startTransition(async () => {
      const result = entry.cancelledAt
        ? await deleteScheduleEntry(entry.id, studentId)
        : await cancelScheduleEntry(entry.id, studentId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setForm(null);
      router.refresh();
    });
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-black uppercase tracking-widest text-ink">{t("title")}</h2>
          <p className="mt-1 text-xs text-muted">{t("subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setWeekStart(addWeeks(weekStart, -1))}
            className="rounded-lg border border-[--hair] px-3 py-1.5 text-sm text-muted hover:text-ink"
          >
            ←
          </button>
          <span className="min-w-[10rem] text-center text-sm font-semibold text-ink">{weekLabel}</span>
          <button
            type="button"
            onClick={() => setWeekStart(addWeeks(weekStart, 1))}
            className="rounded-lg border border-[--hair] px-3 py-1.5 text-sm text-muted hover:text-ink"
          >
            →
          </button>
        </div>
      </div>

      <GlassPanel className="!p-0 overflow-hidden">
        <div className="overflow-x-auto">
        <div className="min-w-[720px]">
          <div className="grid grid-cols-7 border-b border-[--hair]">
            {weekDates.map((date, i) => (
              <div
                key={date}
                className="border-r border-[--hair] px-2 py-2 text-center last:border-r-0"
              >
                <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-muted">
                  {t(`days.${DAY_KEYS[i]}`)}
                </p>
                <p className="text-xs font-bold text-ink">
                  {new Date(`${date}T12:00:00`).getDate()}
                </p>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {weekDates.map((date) => {
              const dayEntries = entriesByDate.get(date) ?? [];
              return (
                <div
                  key={date}
                  className="min-h-[120px] border-r border-[--hair] p-2 last:border-r-0"
                >
                  <button
                    type="button"
                    onClick={() => openNew(date)}
                    className="mb-2 w-full rounded-lg border border-dashed border-[--hair] px-2 py-1 text-[0.65rem] font-semibold text-muted hover:border-brand hover:text-brand"
                  >
                    {t("addEntry")}
                  </button>
                  <div className="space-y-1.5">
                    {dayEntries.map((entry) => (
                      <button
                        key={entry.id}
                        type="button"
                        onClick={() => openEdit(entry)}
                        className={`w-full rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-[--hair]/40 ${
                          entry.cancelledAt ? "opacity-50 line-through" : "bg-brand/10"
                        }`}
                      >
                        <p className="text-[0.65rem] font-bold leading-tight text-ink">{entry.title}</p>
                        {entry.startTime && (
                          <p className="text-[0.58rem] text-muted">
                            {formatTimeShort(entry.startTime, locale)}
                            {entry.endTime ? ` – ${formatTimeShort(entry.endTime, locale)}` : ""}
                          </p>
                        )}
                        <p className="text-[0.55rem] uppercase tracking-wide text-muted">
                          {t(`types.${entry.entryType}`)}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        </div>
      </GlassPanel>

      {form && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
        >
        <GlassPanel className="!p-5">
          <h3 className="text-sm font-black text-ink">
            {form.id ? t("editEntry") : t("newEntry")}
          </h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="text-xs font-semibold text-muted">{t("fields.title")}</span>
              <input
                value={form.title}
                onChange={(e) => setForm((f) => f && { ...f, title: e.target.value })}
                className="mt-1 w-full rounded-xl border border-[--hair] bg-bg px-3 py-2 text-sm"
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="text-xs font-semibold text-muted">{t("fields.description")}</span>
              <textarea
                value={form.description}
                onChange={(e) => setForm((f) => f && { ...f, description: e.target.value })}
                rows={2}
                className="mt-1 w-full rounded-xl border border-[--hair] bg-bg px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-muted">{t("fields.type")}</span>
              <select
                value={form.entryType}
                onChange={(e) =>
                  setForm((f) => f && { ...f, entryType: e.target.value as ScheduleEntryType })
                }
                className="mt-1 w-full rounded-xl border border-[--hair] bg-bg px-3 py-2 text-sm"
              >
                {SCHEDULE_ENTRY_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {t(`types.${type}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-muted">{t("fields.location")}</span>
              <input
                value={form.locationName}
                onChange={(e) => setForm((f) => f && { ...f, locationName: e.target.value })}
                className="mt-1 w-full rounded-xl border border-[--hair] bg-bg px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-muted">{t("fields.startTime")}</span>
              <input
                type="time"
                value={form.startTime}
                onChange={(e) => setForm((f) => f && { ...f, startTime: e.target.value })}
                className="mt-1 w-full rounded-xl border border-[--hair] bg-bg px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-muted">{t("fields.endTime")}</span>
              <input
                type="time"
                value={form.endTime}
                onChange={(e) => setForm((f) => f && { ...f, endTime: e.target.value })}
                className="mt-1 w-full rounded-xl border border-[--hair] bg-bg px-3 py-2 text-sm"
              />
            </label>
          </div>

          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending || !form.title.trim()}
              onClick={save}
              className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {pending ? tShared("saving") : tCommon("save")}
            </button>
            <button
              type="button"
              onClick={() => setForm(null)}
              className="rounded-xl border border-[--hair] px-4 py-2 text-sm text-muted"
            >
              {tCommon("cancel")}
            </button>
            {form.id && (
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  const entry = entries.find((e) => e.id === form.id);
                  if (entry) remove(entry);
                }}
                className="ml-auto rounded-xl border border-red-200 px-4 py-2 text-sm text-red-600"
              >
                {t("cancelEntry")}
              </button>
            )}
          </div>
        </GlassPanel>
        </motion.div>
      )}
    </section>
  );
}
