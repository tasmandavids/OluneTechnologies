"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { useLocale, useTranslations } from "next-intl";
import { useFormatTimeShort } from "@/lib/i18n/client";
import type {
  ScheduleCalendarItem,
  ScheduleChild,
} from "@/lib/students/schedule-types";
import { addWeeks, getWeekRange } from "@/lib/staff/week";
import { itemsForDate } from "@/lib/students/schedule-utils";

const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

const DISC_COLORS: Record<string, string> = {
  Ballet: "#C8102E",
  Jazz: "#5B5BFF",
  "Hip-Hop": "#E84A8A",
  Contemporary: "#13B6A4",
  Tap: "#C9A227",
  Lyrical: "#8B5CF6",
  Acro: "#F97316",
  Pointe: "#EC4899",
};

function itemColor(item: ScheduleCalendarItem) {
  if (item.kind === "class") {
    const disc = item.discipline;
    return disc && DISC_COLORS[disc] ? DISC_COLORS[disc] : "var(--brand)";
  }
  return "var(--brand-hot)";
}

export default function ParentScheduleCalendar({
  linkedChildren,
  items,
  weekStart: initialWeekStart,
}: {
  linkedChildren: ScheduleChild[];
  items: ScheduleCalendarItem[];
  weekStart: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations("parent.schedule");
  const locale = useLocale();
  const fmt = useFormatTimeShort();
  const [childFilter, setChildFilter] = useState<string>("all");

  const { weekDates } = useMemo(
    () => getWeekRange(new Date(`${initialWeekStart}T12:00:00`)),
    [initialWeekStart],
  );

  const goToWeek = (weekStart: string) => {
    router.push(`${pathname}?week=${weekStart}`);
  };

  const filteredItems = useMemo(() => {
    if (childFilter === "all") return items;
    return items.filter((item) => item.studentId === childFilter);
  }, [items, childFilter]);

  const weekLabel = `${new Date(`${weekDates[0]}T12:00:00`).toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
  })} – ${new Date(`${weekDates[6]}T12:00:00`).toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  })}`;

  const todayIso = new Date().toISOString().slice(0, 10);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto max-w-5xl space-y-6 p-6"
    >
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/portal/parent" className="text-xs text-muted hover:text-ink">
            {t("backToHub")}
          </Link>
          <h1 className="mt-2 text-2xl font-black tracking-tight text-ink">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted">{t("subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => goToWeek(addWeeks(initialWeekStart, -1))}
            className="rounded-lg border border-[--hair] px-3 py-1.5 text-sm text-muted hover:text-ink"
            aria-label={t("prevWeek")}
          >
            ←
          </button>
          <span className="min-w-[10rem] text-center text-sm font-semibold text-ink">{weekLabel}</span>
          <button
            type="button"
            onClick={() => goToWeek(addWeeks(initialWeekStart, 1))}
            className="rounded-lg border border-[--hair] px-3 py-1.5 text-sm text-muted hover:text-ink"
            aria-label={t("nextWeek")}
          >
            →
          </button>
        </div>
      </header>

      {linkedChildren.length > 1 && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setChildFilter("all")}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              childFilter === "all" ? "bg-brand text-white" : "border border-[--hair] text-muted"
            }`}
          >
            {t("allChildren")}
          </button>
          {linkedChildren.map((child) => (
            <button
              key={child.studentId}
              type="button"
              onClick={() => setChildFilter(child.studentId)}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                childFilter === child.studentId
                  ? "bg-brand text-white"
                  : "border border-[--hair] text-muted"
              }`}
            >
              {child.name ?? t("unnamedDancer")}
            </button>
          ))}
        </div>
      )}

      <div className="box overflow-x-auto rounded-2xl">
        <div className="min-w-[720px]">
          <div className="grid grid-cols-7 border-b border-[--hair]">
            {weekDates.map((date, i) => (
              <div
                key={date}
                className={`border-r border-[--hair] px-2 py-2 text-center last:border-r-0 ${
                  date === todayIso ? "bg-brand/5" : ""
                }`}
              >
                <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-muted">
                  {t(`days.${DAY_KEYS[i]}`)}
                </p>
                <p
                  className={`text-xs font-bold ${date === todayIso ? "text-brand" : "text-ink"}`}
                >
                  {new Date(`${date}T12:00:00`).getDate()}
                </p>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {weekDates.map((date) => {
              const dayItems = itemsForDate(filteredItems, date);
              return (
                <div
                  key={date}
                  className={`min-h-[140px] border-r border-[--hair] p-2 last:border-r-0 ${
                    date === todayIso ? "bg-brand/[0.03]" : ""
                  }`}
                >
                  {dayItems.length === 0 ? (
                    <p className="px-1 py-4 text-center text-[0.62rem] text-muted">{t("nothingScheduled")}</p>
                  ) : (
                    <div className="space-y-1.5">
                      {dayItems.map((item) => {
                        const color = itemColor(item);
                        const key =
                          item.kind === "class"
                            ? `class-${item.classId}-${item.studentId}-${date}`
                            : `entry-${item.id}`;
                        return (
                          <div
                            key={key}
                            className="rounded-lg px-2 py-1.5"
                            style={{
                              background: `${color}18`,
                              borderLeft: `2px solid ${color}`,
                            }}
                          >
                            {linkedChildren.length > 1 && childFilter === "all" && (
                              <p className="text-[0.55rem] font-semibold uppercase tracking-wide text-muted">
                                {item.studentName ?? t("unnamedDancer")}
                              </p>
                            )}
                            <p className="text-[0.65rem] font-bold leading-tight text-ink">
                              {item.kind === "class" ? item.name : item.title}
                            </p>
                            {item.startTime && (
                              <p className="text-[0.58rem] text-muted">
                                {fmt(item.startTime)}
                                {"endTime" in item && item.endTime
                                  ? ` – ${fmt(item.endTime)}`
                                  : ""}
                              </p>
                            )}
                            {item.kind === "entry" && (
                              <p className="text-[0.55rem] uppercase tracking-wide text-muted">
                                {t(`types.${item.entryType}`)}
                              </p>
                            )}
                            {item.kind === "class" && item.discipline && (
                              <p className="text-[0.55rem] text-muted">{item.discipline}</p>
                            )}
                            {item.kind === "entry" && item.locationName && (
                              <p className="text-[0.55rem] text-muted">{item.locationName}</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <p className="text-xs text-muted">{t("legend")}</p>
    </motion.div>
  );
}
