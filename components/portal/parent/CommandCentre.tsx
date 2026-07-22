"use client";

import Link from "next/link";
import { motion } from "framer-motion";

const NZD = new Intl.NumberFormat("en-NZ", {
  style: "currency",
  currency: "NZD",
  maximumFractionDigits: 0,
});

type UpcomingClass = {
  childName: string;
  className: string;
  dayOfWeek: number;
  startTime: string | null;
  room?: string | null;
  teacher?: string | null;
};

type ActionItem = {
  type: "invoice" | "form" | "costume" | "absence" | "event";
  label: string;
  href: string;
  urgent?: boolean;
};

export type CommandCentreProps = {
  upcomingClasses: UpcomingClass[];
  outstandingCents: number;
  pendingFormCount: number;
  costumeActionCount: number;
  unreadNotificationCount: number;
  /** Unread chat + email messages for this parent — flags a buried inbox. */
  unreadMessageCount?: number;
};

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function getNextOccurrences(classes: UpcomingClass[]): { date: Date; cls: UpcomingClass }[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() + 7);

  const results: { date: Date; cls: UpcomingClass }[] = [];

  for (const cls of classes) {
    // Find next occurrence of cls.dayOfWeek within 7 days
    for (let offset = 0; offset < 7; offset++) {
      const d = new Date(today);
      d.setDate(d.getDate() + offset);
      if (d.getDay() === cls.dayOfWeek && d < cutoff) {
        results.push({ date: d, cls });
        break;
      }
    }
  }

  results.sort((a, b) => a.date.getTime() - b.date.getTime());
  return results;
}

function fmt12(time: string | null) {
  if (!time) return "";
  const [h, m] = time.split(":").map(Number);
  const period = h < 12 ? "am" : "pm";
  const hour = h % 12 || 12;
  return m === 0 ? `${hour}${period}` : `${hour}:${String(m).padStart(2, "0")}${period}`;
}

export function CommandCentre({
  upcomingClasses,
  outstandingCents,
  pendingFormCount,
  costumeActionCount,
  unreadNotificationCount,
  unreadMessageCount = 0,
}: CommandCentreProps) {
  const schedule = getNextOccurrences(upcomingClasses);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const actions: ActionItem[] = [];
  if (outstandingCents > 0)
    actions.push({
      type: "invoice",
      label: `${NZD.format(outstandingCents / 100)} outstanding`,
      href: "/portal/parent/billing",
      urgent: true,
    });
  if (pendingFormCount > 0)
    actions.push({
      type: "form",
      label: `${pendingFormCount} form${pendingFormCount > 1 ? "s" : ""} to complete`,
      href: "/portal/parent/forms",
      urgent: true,
    });
  if (costumeActionCount > 0)
    actions.push({
      type: "costume",
      label: `${costumeActionCount} costume size${costumeActionCount > 1 ? "s" : ""} needed`,
      href: "/portal/parent/recital",
    });

  if (schedule.length === 0 && actions.length === 0 && unreadMessageCount === 0)
    return null;

  return (
    <motion.section
      variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }}
      className="rounded-2xl border border-[--hair] bg-surface overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-[--hair] px-5 py-3.5">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted">
          This week
        </h2>
        <div className="flex items-center gap-4">
          {unreadMessageCount > 0 && (
            <Link
              href="/portal/parent/chat"
              className="flex items-center gap-1.5 text-xs font-semibold text-[--brand] hover:underline"
            >
              <span className="relative inline-grid place-items-center text-ink">
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="3" y="5" width="18" height="14" rx="2" />
                  <path d="m3 7 9 6 9-6" />
                </svg>
                <span
                  className="absolute -right-1.5 -top-1.5 grid h-3.5 min-w-[0.875rem] place-items-center rounded-full px-0.5 text-[0.55rem] font-black text-white"
                  style={{ background: "var(--brand-hot)" }}
                >
                  {unreadMessageCount > 9 ? "9+" : unreadMessageCount}
                </span>
              </span>
              {unreadMessageCount === 1
                ? "1 new message"
                : `${unreadMessageCount} new messages`}
            </Link>
          )}
          {unreadNotificationCount > 0 && (
            <Link
              href="/portal/parent/notifications"
              className="flex items-center gap-1.5 text-xs font-semibold text-[--brand] hover:underline"
            >
              <span
                className="grid h-4 w-4 place-items-center rounded-full text-[0.6rem] font-black text-white"
                style={{ background: "var(--brand-hot)" }}
              >
                {unreadNotificationCount > 9 ? "9+" : unreadNotificationCount}
              </span>
              {unreadNotificationCount} new
            </Link>
          )}
        </div>
      </div>

      <div className="grid divide-y divide-[--hair] sm:grid-cols-[1fr_auto] sm:divide-x sm:divide-y-0">
        {/* Schedule strip */}
        <div className="overflow-x-auto">
          {schedule.length === 0 ? (
            <p className="px-5 py-4 text-sm text-muted">No classes this week.</p>
          ) : (
            <div className="flex min-w-max gap-0 divide-x divide-[--hair]">
              {schedule.map(({ date, cls }, i) => {
                const isToday = date.getTime() === today.getTime();
                const isTomorrow = date.getTime() === tomorrow.getTime();
                const dayLabel = isToday ? "Today" : isTomorrow ? "Tomorrow" : DAY_NAMES[date.getDay()];
                return (
                  <div
                    key={i}
                    className={`min-w-[120px] px-4 py-4 ${isToday ? "bg-[color-mix(in_srgb,var(--brand)_6%,transparent)]" : ""}`}
                  >
                    <p className={`text-[0.65rem] font-bold uppercase tracking-wider ${isToday ? "text-[--brand]" : "text-muted"}`}>
                      {dayLabel}
                      <span className="ml-1 font-normal">
                        {date.getDate()} {date.toLocaleString("default", { month: "short" })}
                      </span>
                    </p>
                    <p className="mt-1 text-sm font-semibold leading-tight text-ink">{cls.className}</p>
                    <p className="mt-0.5 text-xs text-muted">{cls.childName}</p>
                    {cls.startTime && (
                      <p className="mt-1 text-xs font-medium tabular-nums text-ink">{fmt12(cls.startTime)}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Actions column */}
        {actions.length > 0 && (
          <div className="flex flex-col justify-center gap-1 px-4 py-3 sm:min-w-[220px]">
            <p className="mb-1 text-[0.65rem] font-semibold uppercase tracking-wider text-muted">
              Action needed
            </p>
            {actions.map((a, i) => (
              <Link
                key={i}
                href={a.href}
                className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition hover:bg-[color-mix(in_srgb,var(--brand)_8%,transparent)] ${
                  a.urgent ? "text-[--brand-hot]" : "text-ink"
                }`}
              >
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: a.urgent ? "var(--brand-hot)" : "var(--brand)" }}
                />
                {a.label}
              </Link>
            ))}
          </div>
        )}
      </div>
    </motion.section>
  );
}
