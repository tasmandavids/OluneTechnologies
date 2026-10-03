"use client";

// ============================================================================
//  CommandCentre — the top of the Family Hub: four glass stat pills, a
//  "needs you this week" list, and the coming week's classes. Mirrors the
//  owner portal's Today screen (PulseRow + AttentionQueue), in the studio's
//  own colour.
// ============================================================================

import Link from "next/link";
import { motion } from "framer-motion";
import { useLocale, useTranslations } from "next-intl";
import { useFormatMoney } from "@/lib/i18n/format";
import { GlassPanel } from "@/components/portal/admin/glass/GlassPanel";
import { onMagnetLeave, onMagnetMove } from "@/components/portal/admin/glass/useMicroInteractions";

type UpcomingClass = {
  childName: string;
  className: string;
  dayOfWeek: number;
  startTime: string | null;
  room?: string | null;
  teacher?: string | null;
};

type ActionItem = {
  key: string;
  title: string;
  action: string;
  href: string;
  primary?: boolean;
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

function getNextOccurrences(classes: UpcomingClass[]): { date: Date; cls: UpcomingClass }[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const results: { date: Date; cls: UpcomingClass }[] = [];
  for (const cls of classes) {
    for (let offset = 0; offset < 7; offset++) {
      const d = new Date(today);
      d.setDate(d.getDate() + offset);
      if (d.getDay() === cls.dayOfWeek) {
        results.push({ date: d, cls });
        break;
      }
    }
  }
  results.sort((a, b) => a.date.getTime() - b.date.getTime() || (a.cls.startTime ?? "").localeCompare(b.cls.startTime ?? ""));
  return results;
}

function formatTime(time: string | null, locale: string) {
  if (!time) return "";
  const [h, m] = time.split(":").map(Number);
  const d = new Date(2000, 0, 1, h, m);
  return d.toLocaleTimeString(locale, { hour: "numeric", minute: m === 0 ? undefined : "2-digit" });
}

const PILL_STYLE: React.CSSProperties = {
  background: "linear-gradient(148deg, var(--refract), transparent 42%), var(--glass)",
  borderColor: "var(--edge)",
  backdropFilter: "blur(var(--blur)) saturate(1.85)",
  WebkitBackdropFilter: "blur(var(--blur))",
  boxShadow: "var(--shadow-s), inset 0 1px 0 var(--sheen), inset 0 -1px 0 var(--sheen2), inset 1px 0 0 var(--sheen2)",
};

/** How many things on the hub need the parent — the greeting's subhead uses it. */
export function countParentActions(p: Pick<CommandCentreProps, "outstandingCents" | "pendingFormCount" | "costumeActionCount" | "unreadMessageCount">) {
  return (p.outstandingCents > 0 ? 1 : 0) + (p.pendingFormCount > 0 ? 1 : 0) + (p.costumeActionCount > 0 ? 1 : 0) + ((p.unreadMessageCount ?? 0) > 0 ? 1 : 0);
}

export function CommandCentre({
  upcomingClasses,
  outstandingCents,
  pendingFormCount,
  costumeActionCount,
  unreadNotificationCount,
  unreadMessageCount = 0,
}: CommandCentreProps) {
  const t = useTranslations("parent.hub.week");
  const tHub = useTranslations("parent.hub");
  const locale = useLocale();
  const formatMoney = useFormatMoney();
  const schedule = getNextOccurrences(upcomingClasses);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const actions: ActionItem[] = [];
  if (outstandingCents > 0)
    actions.push({ key: "pay", title: t("outstandingAction", { amount: formatMoney(outstandingCents) }), action: t("pay"), href: "/portal/parent/billing", primary: true });
  if (pendingFormCount > 0)
    actions.push({ key: "forms", title: t("formsAction", { count: pendingFormCount }), action: t("open"), href: "/portal/parent/forms" });
  if (costumeActionCount > 0)
    actions.push({ key: "costumes", title: t("costumesAction", { count: costumeActionCount }), action: t("open"), href: "/portal/parent/recital" });
  if (unreadMessageCount > 0)
    actions.push({ key: "messages", title: t("messagesAction", { count: unreadMessageCount }), action: t("read"), href: "/portal/parent/chat" });

  const pills = [
    { key: "outstanding", label: tHub("outstanding"), value: formatMoney(outstandingCents, { maximumFractionDigits: 0 }), href: "/portal/parent/billing" },
    { key: "classes", label: t("classesThisWeek"), value: String(schedule.length), href: "/portal/parent/schedule" },
    { key: "messages", label: t("unreadMessages"), value: String(unreadMessageCount), href: "/portal/parent/chat" },
    { key: "notifications", label: t("notifications"), value: String(unreadNotificationCount), href: "/portal/parent/notifications" },
  ];

  const rise = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } };

  return (
    <>
      <motion.div variants={rise} className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {pills.map((p) => (
          <Link
            key={p.key}
            href={p.href}
            prefetch={false}
            onMouseMove={onMagnetMove}
            onMouseLeave={onMagnetLeave}
            className="relative overflow-hidden rounded-[18px] border p-[13px_15px] transition-transform duration-300"
            style={PILL_STYLE}
          >
            <span
              aria-hidden
              className="pointer-events-none absolute -right-5 -top-10 h-[120px] w-[120px] rounded-full animate-[admin-halo_7s_ease-in-out_infinite]"
              style={{ background: "radial-gradient(circle, var(--t3), transparent 70%)" }}
            />
            <span className="relative block text-[9px] font-semibold uppercase tracking-[0.16em] text-muted">{p.label}</span>
            <span className="relative my-1 block font-display text-[25px] font-medium leading-[1.1] tabular-nums text-ink">{p.value}</span>
          </Link>
        ))}
      </motion.div>

      <motion.div variants={rise} className="grid gap-3.5 lg:grid-cols-2">
        <GlassPanel>
          <h2 className="mb-3 font-display text-lg font-medium tracking-tight text-ink">{t("needsYou")}</h2>
          {actions.length === 0 ? (
            <p className="text-sm text-muted">{t("allClear")}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {actions.map((a) => (
                <li key={a.key}>
                  <Link
                    href={a.href}
                    prefetch={false}
                    className="flex min-h-[56px] items-center gap-3 rounded-2xl border p-3 transition hover:-translate-y-px"
                    style={{ borderColor: "var(--hair)", background: "var(--glass2)" }}
                  >
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: a.primary ? "var(--brand)" : "var(--muted)" }} />
                    <span className="min-w-0 flex-1 text-sm font-semibold text-ink">{a.title}</span>
                    <span
                      className="inline-flex h-9 shrink-0 items-center rounded-[11px] px-3.5 text-[12.5px] font-semibold"
                      style={
                        a.primary
                          ? { background: "var(--brand)", color: "#fff" }
                          : { border: "1px solid var(--edge)", background: "var(--glass2)", color: "var(--text)" }
                      }
                    >
                      {a.action}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </GlassPanel>

        <GlassPanel>
          <div className="mb-1 flex items-baseline justify-between">
            <h2 className="font-display text-lg font-medium tracking-tight text-ink">{t("title")}</h2>
            <Link href="/portal/parent/schedule" prefetch={false} className="text-xs font-semibold text-ink hover:text-(--brand)">
              {t("fullSchedule")} →
            </Link>
          </div>
          {schedule.length === 0 ? (
            <p className="py-2 text-sm text-muted">{tHub("noClassesThisWeek")}</p>
          ) : (
            <ul>
              {schedule.map(({ date, cls }, i) => {
                const isToday = date.getTime() === today.getTime();
                const isTomorrow = date.getTime() === tomorrow.getTime();
                const dayLabel = isToday ? t("today") : isTomorrow ? t("tomorrow") : date.toLocaleDateString(locale, { weekday: "short" });
                return (
                  <li key={i} className="flex items-center gap-3.5 border-b border-(--hair) py-2.5 last:border-0">
                    <div className="w-[52px] shrink-0 text-center">
                      <div className={`text-[9.5px] font-semibold uppercase tracking-[0.14em] ${isToday ? "text-ink" : "text-muted"}`}>{dayLabel}</div>
                      <div className="font-display text-[22px] font-medium leading-tight tabular-nums text-ink">{date.getDate()}</div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">{cls.className}</p>
                      <p className="truncate text-[12.5px] text-muted">
                        {[formatTime(cls.startTime, locale), cls.room, cls.teacher].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <span
                      className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11.5px] font-semibold text-ink"
                      style={{ background: "var(--t1)", borderColor: "var(--hair)" }}
                    >
                      <span className="h-[7px] w-[7px] rounded-full" style={{ background: "var(--brand)" }} />
                      {cls.childName}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </GlassPanel>
      </motion.div>
    </>
  );
}
