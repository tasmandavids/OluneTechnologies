"use client";

// ============================================================================
//  TimeClockCard — the staff member's own clock.
//
//  Mounted on both /portal/teacher and /portal/office because both roles clock
//  in and the card is identical for each; the difference between a teacher and
//  a front-desk shift is a column on the row, not a different screen.
//
//  The card never decides who may clock in — the server action and the 0118
//  triggers do. What it owns is that the button says the right thing, that a
//  double-click can't fire twice, and that a rejection is legible instead of a
//  silent no-op.
// ============================================================================

import { useEffect, useState, useTransition } from "react";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { useFormatTimeShort } from "@/lib/i18n/format";
import { clockIn, clockOut } from "@/app/portal/timeclock/actions";
import { formatMinutes } from "@/lib/timeclock/hours";
import type { ClockState } from "@/lib/timeclock/types";

/**
 * Minutes elapsed since `since`, or null before the first client tick.
 *
 * Null on the server render on purpose: an elapsed time computed during SSR is
 * stale by the time it paints and mismatches on hydration. The card shows the
 * start time until the first tick, which is true at every moment.
 */
function useElapsedMinutes(since: string | null): number | null {
  const [minutes, setMinutes] = useState<number | null>(null);

  useEffect(() => {
    if (!since) {
      setMinutes(null);
      return;
    }
    const start = Date.parse(since);
    if (!Number.isFinite(start)) return;

    const tick = () => setMinutes(Math.max(0, (Date.now() - start) / 60_000));
    tick();
    // 15s rather than 60s so the displayed minute turns over promptly instead
    // of lagging by up to a minute after a clock-in.
    const id = setInterval(tick, 15_000);
    return () => clearInterval(id);
  }, [since]);

  return minutes;
}

function StatusDot({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className={`inline-block h-2 w-2 rounded-full ${on ? "animate-pulse" : ""}`}
      style={{ background: on ? "#22c55e" : "var(--muted, #8b8b92)" }}
    />
  );
}

export default function TimeClockCard({ state }: { state: ClockState }) {
  const t = useTranslations("timeclock");
  const fmtTime = useFormatTimeShort();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [showNote, setShowNote] = useState(false);

  const open = state.open;
  const elapsed = useElapsedMinutes(open?.clockInAt ?? null);

  const submit = (run: () => Promise<{ ok: true } | { ok: false; error: string }>) => {
    setError(null);
    startTransition(async () => {
      const result = await run();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // The action revalidates this route, so the card re-renders from the
      // database rather than from optimistic local state — the clock is a
      // payroll record and the screen should show what was actually written.
      setNote("");
      setShowNote(false);
    });
  };

  // Total for the week including the shift in progress, so the figure doesn't
  // visibly drop the moment someone clocks in.
  const weekSoFar = state.weekMinutes + (elapsed ?? 0);
  const rosterDelta = state.scheduledMinutes > 0 ? weekSoFar - state.scheduledMinutes : null;

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="box rounded-2xl p-5"
      aria-label={t("title")}
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-ink">{t("title")}</h2>
          <p className="mt-0.5 flex items-center gap-2 text-xs text-muted">
            <StatusDot on={Boolean(open)} />
            {open
              ? t("clockedInSince", { time: fmtTime(isoToClockTime(open.clockInAt)) })
              : t("notClockedIn")}
            {open?.source === "nfc" && <span className="box-pill px-2 py-0.5">{t("viaCard")}</span>}
          </p>
        </div>

        <div className="text-right">
          <p className="text-2xl font-black tabular-nums text-ink">
            {open ? (elapsed === null ? "—" : formatMinutes(elapsed)) : formatMinutes(state.weekMinutes)}
          </p>
          <p className="text-[0.62rem] font-semibold uppercase tracking-wider text-muted">
            {open ? t("onTheClock") : t("thisWeek")}
          </p>
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {error}
        </p>
      )}

      {open ? (
        <div className="space-y-3">
          {showNote && (
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              placeholder={t("notePlaceholder")}
              className="w-full rounded-xl border border-[--hair] bg-surface px-4 py-2.5 text-sm text-ink"
            />
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => submit(() => clockOut(note))}
              className="rounded-xl px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
              style={{ background: "var(--ink, #16161a)" }}
            >
              {pending ? t("working") : t("clockOut")}
            </button>
            {!showNote && (
              <button
                type="button"
                onClick={() => setShowNote(true)}
                className="rounded-xl border border-[--hair] px-4 py-2.5 text-sm font-medium text-muted transition hover:text-ink"
              >
                {t("addNote")}
              </button>
            )}
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={pending}
          onClick={() => submit(() => clockIn())}
          className="rounded-xl px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
          style={{ background: "var(--brand)" }}
        >
          {pending ? t("working") : t("clockIn")}
        </button>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-[--hair] pt-3 text-xs text-muted">
        <span>{t("weekTotal", { total: formatMinutes(weekSoFar) })}</span>
        {state.scheduledMinutes > 0 && (
          <span>{t("rostered", { total: formatMinutes(state.scheduledMinutes) })}</span>
        )}
        {rosterDelta !== null && Math.abs(rosterDelta) >= 1 && (
          <span className={rosterDelta > 0 ? "text-amber-600" : ""}>
            {rosterDelta > 0
              ? t("overRoster", { amount: formatMinutes(rosterDelta) })
              : t("underRoster", { amount: formatMinutes(-rosterDelta) })}
          </span>
        )}
      </div>

      {state.entries.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {state.entries.slice(0, 5).map((entry) => (
            <li key={entry.id} className="flex items-center justify-between gap-3 text-xs">
              <span className="truncate text-muted">
                {entry.entryDate} · {fmtTime(isoToClockTime(entry.clockInAt))}
                {entry.clockOutAt ? `–${fmtTime(isoToClockTime(entry.clockOutAt))}` : ""}
              </span>
              <span className="shrink-0 tabular-nums text-ink">
                {entry.minutes === null ? t("openShift") : formatMinutes(entry.minutes)}
                {entry.approvedAt && <span className="ml-2 text-green-600">{t("approved")}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </motion.section>
  );
}

/**
 * ISO instant → "HH:MM" in the viewer's own timezone, which is the studio's
 * for anyone standing in it. formatTimeShort takes wall-clock strings because
 * everything else feeding it (staff_shifts, classes) stores wall-clock times;
 * a clock entry stores an instant, so it's converted here rather than widening
 * that helper.
 */
function isoToClockTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
