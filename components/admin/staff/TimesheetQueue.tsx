"use client";

// ============================================================================
//  TimesheetQueue — the manager's approval surface.
//
//  Jackrabbit's equivalent is a list of hours to tick off. This one also shows
//  what each shift was rostered for, because staff_shifts (0046) already holds
//  that and the comparison is the question a manager is actually asking: not
//  "did they work" but "did they work what we planned".
//
//  Open shifts appear in the queue and cannot be approved. That is the point —
//  a shift someone forgot to close is the thing most worth seeing, and it is
//  fixed here with the same edit form as any other correction.
// ============================================================================

import { useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { GlassPanel } from "@/components/portal/admin/glass/GlassPanel";
import { formatMinutes } from "@/lib/timeclock/hours";
import type { ManagedTimesheet } from "@/lib/timeclock/types";
import type { StaffOption } from "@/lib/staff/types";
import {
  approveTimeEntries,
  approveTimeEntry,
  createTimeEntry,
  deleteTimeEntry,
  unapproveTimeEntry,
  updateTimeEntry,
} from "@/app/portal/admin/staff/actions";

type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

/** ISO instant → the "HH:MM" a `<input type="time">` wants, in local time. */
function toTimeInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * A date and a wall-clock time → an ISO instant.
 *
 * Interpreted in the browser's timezone, which for a manager correcting their
 * own studio's timesheet is the studio's. A manager working from another
 * timezone is a real edge case and the honest fix is a studio-timezone picker
 * on the form, not a silent guess here.
 */
function toIso(date: string, time: string): string | null {
  if (!date || !time) return null;
  const d = new Date(`${date}T${time}:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function SourceBadge({ source }: { source: ManagedTimesheet["source"] }) {
  const t = useTranslations("timeclock.admin");
  return (
    <span className="rounded-full border border-[--hair] px-2 py-0.5 text-[0.55rem] font-semibold uppercase tracking-wider text-muted">
      {t(`source.${source}`)}
    </span>
  );
}

function Variance({ entry }: { entry: ManagedTimesheet }) {
  const t = useTranslations("timeclock.admin");

  if (entry.minutes === null) return <span className="text-amber-600">{t("stillOpen")}</span>;
  if (entry.scheduledMinutes === null) return <span className="text-muted">{t("notRostered")}</span>;

  const delta = entry.varianceMinutes ?? 0;
  if (Math.abs(delta) < 1) return <span className="text-green-600">{t("onRoster")}</span>;

  return (
    <span className={delta > 0 ? "text-amber-600" : "text-muted"}>
      {delta > 0
        ? t("overBy", { amount: formatMinutes(delta) })
        : t("underBy", { amount: formatMinutes(-delta) })}
    </span>
  );
}

function EditRow({
  entry,
  onDone,
  onError,
}: {
  entry: ManagedTimesheet;
  onDone: () => void;
  onError: (message: string) => void;
}) {
  const t = useTranslations("timeclock.admin");
  const [pending, startTransition] = useTransition();
  const [date, setDate] = useState(entry.entryDate);
  const [start, setStart] = useState(toTimeInput(entry.clockInAt));
  const [end, setEnd] = useState(toTimeInput(entry.clockOutAt));
  const [hourType, setHourType] = useState(entry.hourType);
  const [note, setNote] = useState(entry.note ?? "");

  const save = () => {
    const clockInAt = toIso(date, start);
    if (!clockInAt) {
      onError(t("errors.needStart"));
      return;
    }
    // An empty end deliberately leaves the shift open rather than inventing a
    // finish time — "still working" is a legitimate state to save.
    const clockOutAt = end ? toIso(date, end) : null;

    startTransition(async () => {
      const result = await updateTimeEntry(entry.id, {
        entryDate: date,
        clockInAt,
        clockOutAt,
        hourType,
        note,
      });
      if (!result.ok) onError(result.error);
      else onDone();
    });
  };

  return (
    <div className="mt-3 flex flex-wrap items-end gap-2 rounded-xl border border-[--hair] bg-base p-3">
      <label className="text-xs text-muted">
        {t("fields.date")}
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="mt-1 block rounded-lg border border-[--hair] bg-surface px-2 py-1.5 text-sm text-ink"
        />
      </label>
      <label className="text-xs text-muted">
        {t("fields.start")}
        <input
          type="time"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          className="mt-1 block rounded-lg border border-[--hair] bg-surface px-2 py-1.5 text-sm text-ink"
        />
      </label>
      <label className="text-xs text-muted">
        {t("fields.end")}
        <input
          type="time"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          className="mt-1 block rounded-lg border border-[--hair] bg-surface px-2 py-1.5 text-sm text-ink"
        />
      </label>
      <label className="text-xs text-muted">
        {t("fields.hourType")}
        <select
          value={hourType}
          onChange={(e) => setHourType(e.target.value as ManagedTimesheet["hourType"])}
          className="mt-1 block rounded-lg border border-[--hair] bg-surface px-2 py-1.5 text-sm text-ink"
        >
          {(["regular", "overtime", "holiday", "sick", "vacation", "unpaid"] as const).map((h) => (
            <option key={h} value={h}>
              {t(`hourType.${h}`)}
            </option>
          ))}
        </select>
      </label>
      <label className="min-w-[10rem] flex-1 text-xs text-muted">
        {t("fields.note")}
        <input
          type="text"
          value={note}
          maxLength={500}
          onChange={(e) => setNote(e.target.value)}
          className="mt-1 block w-full rounded-lg border border-[--hair] bg-surface px-2 py-1.5 text-sm text-ink"
        />
      </label>
      <button
        type="button"
        disabled={pending}
        onClick={save}
        className="rounded-lg px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
        style={{ background: "var(--brand)" }}
      >
        {t("save")}
      </button>
      <button
        type="button"
        onClick={onDone}
        className="rounded-lg border border-[--hair] px-3 py-1.5 text-xs font-medium text-muted"
      >
        {t("cancel")}
      </button>
    </div>
  );
}

function AddEntryPanel({
  staffOptions,
  onDone,
  onError,
}: {
  staffOptions: StaffOption[];
  onDone: () => void;
  onError: (message: string) => void;
}) {
  const t = useTranslations("timeclock.admin");
  const [pending, startTransition] = useTransition();
  const [staffId, setStaffId] = useState(staffOptions[0]?.id ?? "");
  const [date, setDate] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [hourType, setHourType] = useState<ManagedTimesheet["hourType"]>("regular");

  const submit = () => {
    const clockInAt = toIso(date, start);
    if (!staffId || !clockInAt) {
      onError(t("errors.needStaffAndStart"));
      return;
    }
    startTransition(async () => {
      const result = await createTimeEntry({
        staffId,
        entryDate: date,
        clockInAt,
        clockOutAt: end ? toIso(date, end) : null,
        hourType,
      });
      if (!result.ok) onError(result.error);
      else onDone();
    });
  };

  return (
    <GlassPanel className="mb-4">
      <p className="mb-3 text-sm font-bold text-ink">{t("addEntry")}</p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-muted">
          {t("fields.staff")}
          <select
            value={staffId}
            onChange={(e) => setStaffId(e.target.value)}
            className="mt-1 block rounded-lg border border-[--hair] bg-surface px-2 py-1.5 text-sm text-ink"
          >
            {staffOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name ?? s.id.slice(0, 8)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted">
          {t("fields.date")}
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1 block rounded-lg border border-[--hair] bg-surface px-2 py-1.5 text-sm text-ink"
          />
        </label>
        <label className="text-xs text-muted">
          {t("fields.start")}
          <input
            type="time"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="mt-1 block rounded-lg border border-[--hair] bg-surface px-2 py-1.5 text-sm text-ink"
          />
        </label>
        <label className="text-xs text-muted">
          {t("fields.end")}
          <input
            type="time"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className="mt-1 block rounded-lg border border-[--hair] bg-surface px-2 py-1.5 text-sm text-ink"
          />
        </label>
        <label className="text-xs text-muted">
          {t("fields.hourType")}
          <select
            value={hourType}
            onChange={(e) => setHourType(e.target.value as ManagedTimesheet["hourType"])}
            className="mt-1 block rounded-lg border border-[--hair] bg-surface px-2 py-1.5 text-sm text-ink"
          >
            {(["regular", "overtime", "holiday", "sick", "vacation", "unpaid"] as const).map((h) => (
              <option key={h} value={h}>
                {t(`hourType.${h}`)}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={pending}
          onClick={submit}
          className="rounded-lg px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
          style={{ background: "var(--brand)" }}
        >
          {t("save")}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="rounded-lg border border-[--hair] px-3 py-2 text-xs font-medium text-muted"
        >
          {t("cancel")}
        </button>
      </div>
    </GlassPanel>
  );
}

export default function TimesheetQueue({
  entries,
  staffOptions,
  rangeStart,
  rangeEnd,
}: {
  entries: ManagedTimesheet[];
  staffOptions: StaffOption[];
  rangeStart: string;
  rangeEnd: string;
}) {
  const t = useTranslations("timeclock.admin");
  const [pendingOnly, setPendingOnly] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const visible = useMemo(
    () => (pendingOnly ? entries.filter((e) => !e.approvedAt) : entries),
    [entries, pendingOnly],
  );

  // Only closed, unapproved entries can be batch-approved, so the checkbox
  // column is absent on the rest rather than offering an action that fails.
  const selectable = visible.filter((e) => !e.approvedAt && e.minutes !== null);

  const totals = useMemo(() => {
    let actual = 0;
    let open = 0;
    for (const entry of visible) {
      if (entry.minutes === null) open += 1;
      else actual += entry.minutes;
    }
    return { actual, open };
  }, [visible]);

  const run = (fn: () => Promise<ActionResult>) => {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) setError(result.error);
      else setSelected(new Set());
    });
  };

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted">
            {t("range", { from: rangeStart, to: rangeEnd })}
          </p>
          <p className="text-sm font-semibold text-ink">
            {t("summary", { total: formatMinutes(totals.actual), count: visible.length })}
            {totals.open > 0 && (
              <span className="ml-2 font-normal text-amber-600">
                {t("openCount", { count: totals.open })}
              </span>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-muted">
            <input
              type="checkbox"
              checked={pendingOnly}
              onChange={(e) => setPendingOnly(e.target.checked)}
            />
            {t("pendingOnly")}
          </label>
          <button
            type="button"
            onClick={() => setAdding((v) => !v)}
            className="rounded-xl border border-[--hair] px-3 py-2 text-xs font-medium text-ink"
          >
            {t("addEntry")}
          </button>
          <button
            type="button"
            disabled={pending || selected.size === 0}
            onClick={() => run(() => approveTimeEntries([...selected]))}
            className="rounded-xl px-3 py-2 text-xs font-bold text-white disabled:opacity-40"
            style={{ background: "var(--brand)" }}
          >
            {t("approveSelected", { count: selected.size })}
          </button>
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </p>
      )}

      {adding && (
        <AddEntryPanel
          staffOptions={staffOptions}
          onDone={() => setAdding(false)}
          onError={setError}
        />
      )}

      {selectable.length > 0 && (
        <button
          type="button"
          onClick={() =>
            setSelected((prev) =>
              prev.size === selectable.length ? new Set() : new Set(selectable.map((e) => e.id)),
            )
          }
          className="text-xs font-medium text-muted underline"
        >
          {selected.size === selectable.length ? t("selectNone") : t("selectAll")}
        </button>
      )}

      {visible.length === 0 ? (
        <GlassPanel>
          <p className="py-12 text-center text-sm text-muted">{t("empty")}</p>
        </GlassPanel>
      ) : (
        <ul className="space-y-2">
          {visible.map((entry) => (
            <li key={entry.id}>
              <GlassPanel className="!p-4">
                <div className="flex flex-wrap items-center gap-3">
                  {!entry.approvedAt && entry.minutes !== null ? (
                    <input
                      type="checkbox"
                      checked={selected.has(entry.id)}
                      onChange={() => toggle(entry.id)}
                      aria-label={t("selectEntry")}
                    />
                  ) : (
                    <span className="w-[13px]" aria-hidden />
                  )}

                  <div className="min-w-[9rem] flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-semibold text-ink">
                      {entry.staffName ?? t("unknownStaff")}
                      <SourceBadge source={entry.source} />
                      {entry.hourType !== "regular" && (
                        <span className="rounded-full bg-brand/15 px-2 py-0.5 text-[0.55rem] font-semibold uppercase tracking-wider text-brand">
                          {t(`hourType.${entry.hourType}`)}
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted">
                      {entry.entryDate} · {toTimeInput(entry.clockInAt)}
                      {entry.clockOutAt ? `–${toTimeInput(entry.clockOutAt)}` : `–${t("openEnd")}`}
                      {entry.note ? ` · ${entry.note}` : ""}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="font-black tabular-nums text-ink">
                      {entry.minutes === null ? "—" : formatMinutes(entry.minutes)}
                    </p>
                    <p className="text-[0.68rem]">
                      <Variance entry={entry} />
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {entry.approvedAt ? (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => run(() => unapproveTimeEntry(entry.id))}
                        className="rounded-lg border border-[--hair] px-3 py-1.5 text-xs font-medium text-muted disabled:opacity-50"
                      >
                        {t("unapprove")}
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          disabled={pending || entry.minutes === null}
                          onClick={() => run(() => approveTimeEntry(entry.id))}
                          className="rounded-lg px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40"
                          style={{ background: "var(--brand)" }}
                        >
                          {t("approve")}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditing(editing === entry.id ? null : entry.id)}
                          className="rounded-lg border border-[--hair] px-3 py-1.5 text-xs font-medium text-muted"
                        >
                          {t("edit")}
                        </button>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => run(() => deleteTimeEntry(entry.id))}
                          className="rounded-lg border border-[--hair] px-3 py-1.5 text-xs font-medium text-red-600 disabled:opacity-50"
                        >
                          {t("delete")}
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {editing === entry.id && (
                  <EditRow entry={entry} onDone={() => setEditing(null)} onError={setError} />
                )}
              </GlassPanel>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
