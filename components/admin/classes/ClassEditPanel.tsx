"use client";

import { panelSlide } from "@/lib/motion";
import { useState, useTransition } from "react";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import {
  createClass,
  updateClass,
  createRecurringClasses,
  linkClassToSeries,
  type SeriesSelection,
} from "@/app/portal/admin/classes/actions";
import type { ClassRow, TeacherOption } from "@/app/portal/admin/classes/page";
import type { XeroAccountOption, XeroItemOption } from "@/lib/xero/chart-of-accounts";

const DISCIPLINE_KEYS = [
  "ballet", "jazz", "hipHop", "contemporary", "tap", "lyrical",
  "acro", "pointe", "musicalTheatre", "ballroom", "latin", "aerial", "other",
] as const;

const DISCIPLINE_VALUES: Record<(typeof DISCIPLINE_KEYS)[number], string> = {
  ballet: "Ballet",
  jazz: "Jazz",
  hipHop: "Hip-Hop",
  contemporary: "Contemporary",
  tap: "Tap",
  lyrical: "Lyrical",
  acro: "Acro",
  pointe: "Pointe",
  musicalTheatre: "Musical Theatre",
  ballroom: "Ballroom",
  latin: "Latin",
  aerial: "Aerial",
  other: "Other",
};

const DAY_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;
const DAY_SHORT_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

function decodeSeriesChoice(value: string): SeriesSelection {
  if (value.startsWith("group:")) return { type: "group", groupId: value.slice(6) };
  if (value.startsWith("class:")) return { type: "class", classId: value.slice(6) };
  return { type: "none" };
}

type FormState = {
  name: string;
  discipline: string;
  level: string;
  room: string;
  dayOfWeek: number;
  days: number[];
  startTime: string;
  endTime: string;
  capacity: number;
  priceCents: number;
  teacherId: string;
  xeroAccountCode: string;
  xeroItemCode: string;
};

const EMPTY_FORM: FormState = {
  name: "",
  discipline: "",
  level: "",
  room: "",
  dayOfWeek: 1,
  days: [1],
  startTime: "16:00",
  endTime: "17:00",
  capacity: 20,
  priceCents: 0,
  teacherId: "",
  xeroAccountCode: "",
  xeroItemCode: "",
};

function formFromClass(c: ClassRow): FormState {
  return {
    name: c.name,
    discipline: c.discipline ?? "",
    level: c.level ?? "",
    room: c.room ?? "",
    dayOfWeek: c.dayOfWeek,
    days: [c.dayOfWeek],
    startTime: c.startTime?.slice(0, 5) ?? "",
    endTime: c.endTime?.slice(0, 5) ?? "",
    capacity: c.capacity,
    priceCents: c.priceCents,
    teacherId: c.teacherId ?? "",
    xeroAccountCode: c.xeroAccountCode ?? "",
    xeroItemCode: c.xeroItemCode ?? "",
  };
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-1 block text-[0.68rem] font-semibold uppercase tracking-wider text-muted">
      {children}
    </label>
  );
}

function Input({
  value, onChange, type = "text", placeholder, min, max,
}: {
  value: string | number;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  min?: number;
  max?: number;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      min={min}
      max={max}
      className="w-full rounded-lg border border-[--hair] bg-base px-3 py-2 text-sm text-ink
                 placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-[--brand]"
    />
  );
}

function Select({
  value, onChange, children,
}: {
  value: string | number;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-[--hair] bg-base px-3 py-2 text-sm text-ink
                 focus:outline-none focus:ring-1 focus:ring-[--brand]"
    >
      {children}
    </select>
  );
}

export function ClassEditPanel({
  mode,
  editing,
  teachers,
  allClasses = [],
  xeroAccounts = [],
  xeroItems = [],
  onClose,
}: {
  mode: "create" | "edit";
  editing: ClassRow | null;
  teachers: TeacherOption[];
  allClasses?: ClassRow[];
  xeroAccounts?: XeroAccountOption[];
  xeroItems?: XeroItemOption[];
  onClose: () => void;
}) {
  const t = useTranslations("admin.classes.form");
  const tShared = useTranslations("admin.shared");
  const tCommon = useTranslations("common");
  const [form, setForm] = useState<FormState>(
    mode === "edit" && editing ? formFromClass(editing) : EMPTY_FORM,
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Group the studio's other classes so an existing class can be attached to
  // an existing series (or paired with a standalone class to start one)
  // instead of being recreated via the multi-day picker.
  const otherClasses = editing ? allClasses.filter((c) => c.id !== editing.id) : allClasses;
  const seriesGroupMap = new Map<string, ClassRow[]>();
  const standaloneClasses: ClassRow[] = [];
  otherClasses.forEach((c) => {
    if (c.recurringGroupId) {
      const members = seriesGroupMap.get(c.recurringGroupId) ?? [];
      members.push(c);
      seriesGroupMap.set(c.recurringGroupId, members);
    } else {
      standaloneClasses.push(c);
    }
  });
  const seriesGroups = Array.from(seriesGroupMap.entries()).map(([groupId, members]) => ({
    groupId,
    label: t("seriesOptionGroupLabel", { name: members[0].name, count: members.length }),
  }));

  const [seriesChoice, setSeriesChoice] = useState<string>(() =>
    editing?.recurringGroupId && seriesGroupMap.has(editing.recurringGroupId)
      ? `group:${editing.recurringGroupId}`
      : "none",
  );
  const [seriesPending, startSeriesTransition] = useTransition();
  const [seriesError, setSeriesError] = useState<string | null>(null);

  const linkSeries = () => {
    if (!editing) return;
    setSeriesError(null);
    const selection = decodeSeriesChoice(seriesChoice);
    startSeriesTransition(async () => {
      const result = await linkClassToSeries(editing.id, selection);
      if (!result.ok) {
        setSeriesError(result.error);
        return;
      }
      onClose();
    });
  };

  const set = <K extends keyof FormState>(key: K, val: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: val }));

  const toggleDay = (day: number) =>
    setForm((prev) => ({
      ...prev,
      days: prev.days.includes(day)
        ? prev.days.filter((d) => d !== day)
        : [...prev.days, day].sort((a, b) => a - b),
    }));

  const submit = () => {
    setError(null);
    const base = {
      name: form.name,
      discipline: form.discipline,
      level: form.level,
      room: form.room,
      startTime: form.startTime || undefined,
      endTime: form.endTime || undefined,
      capacity: form.capacity,
      priceCents: form.priceCents,
      teacherId: form.teacherId || undefined,
      xeroAccountCode: form.xeroAccountCode || undefined,
      xeroItemCode: form.xeroItemCode || undefined,
    };

    if (mode === "create" && form.days.length === 0) {
      setError(t("pickDayError"));
      return;
    }

    startTransition(async () => {
      let result;
      if (mode === "edit" && editing) {
        result = await updateClass(editing.id, { ...base, dayOfWeek: form.dayOfWeek });
      } else if (form.days.length > 1) {
        result = await createRecurringClasses({ ...base, days: form.days });
      } else {
        result = await createClass({ ...base, dayOfWeek: form.days[0] });
      }

      if (!result.ok) {
        setError(result.error);
        return;
      }
      onClose();
    });
  };

  return (
    <>
      <motion.div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />

      <motion.aside
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col
                   border-l border-[--hair] bg-surface shadow-2xl"
        {...panelSlide}
      >
        <div className="flex items-center justify-between border-b border-[--hair] px-6 py-4">
          <h2 className="font-black text-ink">
            {mode === "create" ? t("newClass") : t("editClass")}
          </h2>
          <button
            onClick={onClose}
            className="text-muted transition-colors hover:text-ink"
            aria-label={tShared("close")}
          >
            ✕
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <div>
            <Label>{t("className")}</Label>
            <Input
              value={form.name}
              onChange={(v) => set("name", v)}
              placeholder={t("classNamePlaceholder")}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{t("discipline")}</Label>
              <Select value={form.discipline} onChange={(v) => set("discipline", v)}>
                <option value="">{tShared("none")}</option>
                {DISCIPLINE_KEYS.map((key) => (
                  <option key={key} value={DISCIPLINE_VALUES[key]}>
                    {tShared(`disciplines.${key}`)}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>{t("level")}</Label>
              <Input
                value={form.level}
                onChange={(v) => set("level", v)}
                placeholder={t("levelPlaceholder")}
              />
            </div>
          </div>

          <div>
            <Label>{t("room")}</Label>
            <Input
              value={form.room}
              onChange={(v) => set("room", v)}
              placeholder={t("roomPlaceholder")}
            />
          </div>

          {mode === "edit" ? (
            <div>
              <Label>{t("dayOfWeek")}</Label>
              <Select value={form.dayOfWeek} onChange={(v) => set("dayOfWeek", Number(v))}>
                {DAY_KEYS.map((key, i) => (
                  <option key={key} value={i}>{tCommon(`days.${key}`)}</option>
                ))}
              </Select>
            </div>
          ) : (
            <div>
              <Label>{t("daysOfWeek")}</Label>
              <div className="flex flex-wrap gap-1.5">
                {DAY_SHORT_KEYS.map((key, i) => {
                  const active = form.days.includes(i);
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => toggleDay(i)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                        active
                          ? "text-white"
                          : "border border-[--hair] text-muted hover:text-ink"
                      }`}
                      style={active ? { background: "var(--brand)" } : undefined}
                    >
                      {tCommon(`days.${key}`)}
                    </button>
                  );
                })}
              </div>
              {form.days.length > 1 && (
                <p className="mt-1.5 text-[0.68rem] text-muted">
                  {t("recurringHint", { count: form.days.length })}
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{t("startTime")}</Label>
              <Input type="time" value={form.startTime} onChange={(v) => set("startTime", v)} />
            </div>
            <div>
              <Label>{t("endTime")}</Label>
              <Input type="time" value={form.endTime} onChange={(v) => set("endTime", v)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{t("capacity")}</Label>
              <Input
                type="number"
                value={form.capacity}
                onChange={(v) => set("capacity", Number(v))}
                min={1}
                max={500}
              />
            </div>
            <div>
              <Label>{t("priceCents")}</Label>
              <Input
                type="number"
                value={form.priceCents}
                onChange={(v) => set("priceCents", Number(v))}
                min={0}
                placeholder={t("pricePlaceholder")}
              />
            </div>
          </div>

          <div>
            <Label>{t("teacher")}</Label>
            <Select value={form.teacherId} onChange={(v) => set("teacherId", v)}>
              <option value="">{tShared("unassignedOption")}</option>
              {teachers.map((teacher) => (
                <option key={teacher.id} value={teacher.id}>{teacher.name ?? teacher.email}</option>
              ))}
            </Select>
          </div>

          {mode === "edit" && editing && (
            <div className="rounded-xl border border-[--hair] bg-base/50 p-4">
              <Label>{t("seriesLabel")}</Label>
              <p className="mb-2 text-[0.68rem] text-muted">{t("seriesHint")}</p>
              <Select value={seriesChoice} onChange={setSeriesChoice}>
                <option value="none">{t("seriesNoneOption")}</option>
                {seriesGroups.length > 0 && (
                  <optgroup label={t("seriesExistingGroup")}>
                    {seriesGroups.map((g) => (
                      <option key={g.groupId} value={`group:${g.groupId}`}>
                        {g.label}
                      </option>
                    ))}
                  </optgroup>
                )}
                {standaloneClasses.length > 0 && (
                  <optgroup label={t("seriesStandaloneGroup")}>
                    {standaloneClasses.map((c) => (
                      <option key={c.id} value={`class:${c.id}`}>
                        {c.name} — {tCommon(`days.${DAY_SHORT_KEYS[c.dayOfWeek]}`)}
                        {c.startTime ? ` ${c.startTime.slice(0, 5)}` : ""}
                      </option>
                    ))}
                  </optgroup>
                )}
              </Select>
              {seriesError && (
                <p className="mt-2 rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-xs text-red-400">
                  {seriesError}
                </p>
              )}
              <button
                type="button"
                onClick={linkSeries}
                disabled={seriesPending}
                className="mt-3 w-full rounded-lg border border-[--hair] py-2 text-xs font-bold text-ink
                           transition-colors hover:bg-[--hair] disabled:opacity-50"
              >
                {seriesPending ? t("seriesLinking") : t("seriesLinkButton")}
              </button>
            </div>
          )}

          {/* Accounting is a back-office concern — tucked behind a closed
              disclosure, and only when Xero is actually connected (the option
              lists are empty otherwise). */}
          {(xeroAccounts.length > 0 || xeroItems.length > 0) && (
            <details className="rounded-xl border border-[--hair] bg-base/50">
              <summary className="cursor-pointer select-none px-4 py-3 text-[0.68rem] font-semibold uppercase tracking-wider text-muted">
                {t("xeroSection")}
              </summary>
              <div className="space-y-4 px-4 pb-4">
                <div>
                  <Label>{t("xeroAccountCode")}</Label>
                  <Select value={form.xeroAccountCode} onChange={(v) => set("xeroAccountCode", v)}>
                    <option value="">{t("xeroAccountCodeNone")}</option>
                    {xeroAccounts.map((acct) => (
                      <option key={acct.code} value={acct.code}>{acct.code} — {acct.name}</option>
                    ))}
                    {form.xeroAccountCode && !xeroAccounts.some((a) => a.code === form.xeroAccountCode) && (
                      <option value={form.xeroAccountCode}>
                        {form.xeroAccountCode} {t("xeroAccountCodeNotFound")}
                      </option>
                    )}
                  </Select>
                </div>

                <div>
                  <Label>{t("xeroItemCode")}</Label>
                  <Select value={form.xeroItemCode} onChange={(v) => set("xeroItemCode", v)}>
                    <option value="">{t("xeroItemCodeNone")}</option>
                    {xeroItems.map((item) => (
                      <option key={item.code} value={item.code}>{item.code} — {item.name}</option>
                    ))}
                    {form.xeroItemCode && !xeroItems.some((i) => i.code === form.xeroItemCode) && (
                      <option value={form.xeroItemCode}>
                        {form.xeroItemCode} {t("xeroItemCodeNotFound")}
                      </option>
                    )}
                  </Select>
                </div>
              </div>
            </details>
          )}

          {error && (
            <p className="rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-xs text-red-400">
              {error}
            </p>
          )}
        </div>

        <div className="flex gap-3 border-t border-[--hair] px-6 py-4">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-[--hair] py-2.5 text-sm text-muted
                       transition-colors hover:text-ink"
          >
            {tCommon("cancel")}
          </button>
          <button
            onClick={submit}
            disabled={pending || !form.name}
            className="flex-1 rounded-xl py-2.5 text-sm font-bold text-white transition-opacity
                       disabled:opacity-50"
            style={{ background: "var(--brand)" }}
          >
            {pending ? tShared("saving") : mode === "create" ? t("createClass") : t("saveChanges")}
          </button>
        </div>
      </motion.aside>
    </>
  );
}
