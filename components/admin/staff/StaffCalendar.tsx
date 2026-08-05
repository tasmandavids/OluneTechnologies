"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { motion } from "framer-motion";
import {
  createStaffShift,
  deleteStaffShift,
  updateStaffShift,
} from "@/app/portal/admin/staff/actions";
import type { StaffOption, StaffShift, TeachingBlock } from "@/lib/staff/types";
import { addWeeks, getWeekRange } from "@/lib/staff/week";
import { formatTimeShort } from "@/lib/i18n/format";
import { GlassPanel } from "@/components/portal/admin/glass/GlassPanel";

const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

type ShiftForm = {
  id: string | null;
  staffId: string;
  shiftDate: string;
  startTime: string;
  endTime: string;
  locationName: string;
  notes: string;
};

export default function StaffCalendar({
  shifts: initialShifts,
  teachingBlocks,
  staffOptions,
  locations,
  weekStart: initialWeekStart,
}: {
  shifts: StaffShift[];
  teachingBlocks: TeachingBlock[];
  staffOptions: StaffOption[];
  locations: string[];
  weekStart: string;
}) {
  const t = useTranslations("admin.staff.calendar");
  const tShared = useTranslations("admin.shared");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const [weekStart, setWeekStart] = useState(initialWeekStart);
  const [roleFilter, setRoleFilter] = useState<"all" | "teacher" | "office">("all");
  const [locationFilter, setLocationFilter] = useState("");
  const [shiftForm, setShiftForm] = useState<ShiftForm | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const { weekDates } = useMemo(() => getWeekRange(new Date(weekStart + "T12:00:00")), [weekStart]);

  const filteredStaff = staffOptions.filter(
    (s) => roleFilter === "all" || s.role === roleFilter,
  );

  const shiftsForWeek = initialShifts.filter((s) => weekDates.includes(s.shiftDate));

  const teachingByStaffDay = useMemo(() => {
    const map = new Map<string, TeachingBlock[]>();
    for (const block of teachingBlocks) {
      const jsDay = block.dayOfWeek;
      const isoDay = weekDates[jsDay === 0 ? 6 : jsDay - 1];
      if (!isoDay) continue;
      const key = `${block.staffId}-${isoDay}`;
      const list = map.get(key) ?? [];
      list.push(block);
      map.set(key, list);
    }
    return map;
  }, [teachingBlocks, weekDates]);

  const shiftsByStaffDay = useMemo(() => {
    const map = new Map<string, StaffShift[]>();
    for (const shift of shiftsForWeek) {
      if (locationFilter && shift.locationName !== locationFilter) continue;
      const key = `${shift.staffId}-${shift.shiftDate}`;
      const list = map.get(key) ?? [];
      list.push(shift);
      map.set(key, list);
    }
    return map;
  }, [shiftsForWeek, locationFilter]);

  const openNewShift = (staffId: string, shiftDate: string) => {
    setShiftForm({
      id: null,
      staffId,
      shiftDate,
      startTime: "09:00",
      endTime: "17:00",
      locationName: locations[0] ?? "",
      notes: "",
    });
    setError(null);
  };

  const openEditShift = (shift: StaffShift) => {
    setShiftForm({
      id: shift.id,
      staffId: shift.staffId,
      shiftDate: shift.shiftDate,
      startTime: shift.startTime,
      endTime: shift.endTime,
      locationName: shift.locationName ?? "",
      notes: shift.notes ?? "",
    });
    setError(null);
  };

  const saveShift = () => {
    if (!shiftForm) return;
    setError(null);
    startTransition(async () => {
      const payload = {
        staffId: shiftForm.staffId,
        shiftDate: shiftForm.shiftDate,
        startTime: shiftForm.startTime,
        endTime: shiftForm.endTime,
        locationName: shiftForm.locationName,
        notes: shiftForm.notes,
      };
      const result = shiftForm.id
        ? await updateStaffShift(shiftForm.id, payload)
        : await createStaffShift(payload);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setShiftForm(null);
      router.refresh();
    });
  };

  const removeShift = (id: string) => {
    startTransition(async () => {
      const result = await deleteStaffShift(id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setShiftForm(null);
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setWeekStart(addWeeks(weekStart, -1))}
            className="rounded-lg border border-[--hair] px-3 py-1.5 text-sm text-muted hover:text-ink"
          >
            {t("prevWeek")}
          </button>
          <span className="text-sm font-medium text-ink">
            {weekDates[0]} — {weekDates[6]}
          </span>
          <button
            type="button"
            onClick={() => setWeekStart(addWeeks(weekStart, 1))}
            className="rounded-lg border border-[--hair] px-3 py-1.5 text-sm text-muted hover:text-ink"
          >
            {t("nextWeek")}
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as typeof roleFilter)}
            className="rounded-lg border border-[--hair] bg-surface px-3 py-1.5 text-sm text-ink"
          >
            <option value="all">{t("filterAllRoles")}</option>
            <option value="teacher">{t("filterTeachers")}</option>
            <option value="office">{t("filterOffice")}</option>
          </select>
          {locations.length > 0 && (
            <select
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              className="rounded-lg border border-[--hair] bg-surface px-3 py-1.5 text-sm text-ink"
            >
              <option value="">{t("filterAllLocations")}</option>
              {locations.map((loc) => (
                <option key={loc} value={loc}>
                  {loc}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      <GlassPanel className="!p-0 overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-[--hair]">
              <th className="sticky left-0 z-10 bg-surface px-3 py-2 text-[0.62rem] font-semibold uppercase tracking-wider text-muted">
                {tCommon("name")}
              </th>
              {weekDates.map((date, i) => (
                <th
                  key={date}
                  className="min-w-[100px] px-2 py-2 text-center text-[0.62rem] font-semibold uppercase tracking-wider text-muted"
                >
                  {tCommon(`days.${DAY_KEYS[i]}`)}
                  <div className="font-normal normal-case text-muted">{date.slice(5)}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredStaff.map((member) => (
              <tr key={member.id} className="border-b border-[--hair] last:border-0">
                <td className="sticky left-0 z-10 bg-surface px-3 py-2 font-medium text-ink">
                  <div>{member.name ?? tShared("unknown")}</div>
                  <div className="text-[0.62rem] uppercase tracking-wider text-muted">
                    {member.role}
                  </div>
                </td>
                {weekDates.map((date) => {
                  const key = `${member.id}-${date}`;
                  const dayShifts = shiftsByStaffDay.get(key) ?? [];
                  const teaching = teachingByStaffDay.get(key) ?? [];
                  return (
                    <td key={date} className="align-top px-1 py-1">
                      <button
                        type="button"
                        onClick={() => openNewShift(member.id, date)}
                        className="mb-1 w-full min-h-[48px] rounded-lg border border-dashed border-[--hair] p-1 text-left transition hover:border-brand/40 hover:bg-base/50"
                      >
                        {dayShifts.map((s) => (
                          <div
                            key={s.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditShift(s);
                            }}
                            className="mb-1 rounded-md bg-brand/15 px-1.5 py-0.5 text-[0.65rem] font-medium text-brand"
                          >
                            {formatTimeShort(s.startTime, locale)}–{formatTimeShort(s.endTime, locale)}
                            {s.locationName ? ` · ${s.locationName}` : ""}
                          </div>
                        ))}
                        {teaching.map((tb) => (
                          <div
                            key={tb.id}
                            className="mb-1 rounded-md border border-[--hair] bg-base/80 px-1.5 py-0.5 text-[0.65rem] text-muted"
                            title={t("teachingClass")}
                          >
                            {tb.className} {formatTimeShort(tb.startTime, locale)}
                          </div>
                        ))}
                        {dayShifts.length === 0 && teaching.length === 0 && (
                          <span className="text-[0.62rem] text-muted">+</span>
                        )}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </GlassPanel>

      {shiftForm && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-[22px] border p-4"
          style={{
            background: "linear-gradient(148deg, var(--refract), transparent 42%), var(--glass)",
            borderColor: "var(--edge)",
            backdropFilter: "blur(var(--blur)) saturate(1.85)",
            WebkitBackdropFilter: "blur(var(--blur)) saturate(1.85)",
            boxShadow: "var(--shadow-s), inset 0 1px 0 var(--sheen), inset 0 -1px 0 var(--sheen2), inset 1px 0 0 var(--sheen2)",
          }}
        >
          <h3 className="mb-3 font-semibold text-ink">
            {shiftForm.id ? t("editShift") : t("addShift")}
          </h3>
          {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="mb-1 block text-xs text-muted">{tCommon("date")}</label>
              <input
                type="date"
                value={shiftForm.shiftDate}
                onChange={(e) => setShiftForm({ ...shiftForm, shiftDate: e.target.value })}
                className="w-full rounded-lg border border-[--hair] bg-base px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted">{t("startTime")}</label>
              <input
                type="time"
                value={shiftForm.startTime}
                onChange={(e) => setShiftForm({ ...shiftForm, startTime: e.target.value })}
                className="w-full rounded-lg border border-[--hair] bg-base px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted">{t("endTime")}</label>
              <input
                type="time"
                value={shiftForm.endTime}
                onChange={(e) => setShiftForm({ ...shiftForm, endTime: e.target.value })}
                className="w-full rounded-lg border border-[--hair] bg-base px-3 py-2 text-sm"
              />
            </div>
            {locations.length > 0 && (
              <div>
                <label className="mb-1 block text-xs text-muted">{t("location")}</label>
                <select
                  value={shiftForm.locationName}
                  onChange={(e) => setShiftForm({ ...shiftForm, locationName: e.target.value })}
                  className="w-full rounded-lg border border-[--hair] bg-base px-3 py-2 text-sm"
                >
                  <option value="">{tShared("none")}</option>
                  {locations.map((loc) => (
                    <option key={loc} value={loc}>
                      {loc}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <div className="mt-3">
            <label className="mb-1 block text-xs text-muted">{t("notes")}</label>
            <input
              value={shiftForm.notes}
              onChange={(e) => setShiftForm({ ...shiftForm, notes: e.target.value })}
              className="w-full rounded-lg border border-[--hair] bg-base px-3 py-2 text-sm"
            />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={saveShift}
              className="rounded-xl px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
              style={{ background: "var(--brand)" }}
            >
              {pending ? tShared("saving") : tCommon("save")}
            </button>
            <button
              type="button"
              onClick={() => setShiftForm(null)}
              className="rounded-xl border border-[--hair] px-4 py-2 text-sm text-muted"
            >
              {tCommon("cancel")}
            </button>
            {shiftForm.id && (
              <button
                type="button"
                disabled={pending}
                onClick={() => removeShift(shiftForm.id!)}
                className="rounded-xl border border-red-200 px-4 py-2 text-sm text-red-600"
              >
                {tCommon("delete")}
              </button>
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
}
