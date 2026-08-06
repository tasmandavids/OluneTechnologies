"use client";

import { useLocale, useTranslations } from "next-intl";
import type { AttendanceRecord } from "@/lib/portal/student-progress-data";

const STATUS_COLORS: Record<AttendanceRecord["status"], string> = {
  present: "#22c55e",
  late: "#f59e0b",
  absent: "#ef4444",
  excused: "#8b8b92",
};

export default function AttendanceHistory({ records }: { records: AttendanceRecord[] }) {
  const t = useTranslations("portal.progress.attendance");
  const locale = useLocale();

  const presentCount = records.filter((r) => r.status === "present" || r.status === "late").length;
  const rate = records.length > 0 ? Math.round((presentCount / records.length) * 100) : null;

  return (
    <section className="box rounded-2xl p-5">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted">
            {t("title", { count: records.length })}
          </h2>
          {rate !== null && (
            <p className="mt-1 text-sm text-muted">{t("attendanceRate", { rate })}</p>
          )}
        </div>
      </div>

      {records.length === 0 ? (
        <p className="rounded-xl bg-base px-4 py-8 text-center text-sm text-muted">{t("empty")}</p>
      ) : (
        <div className="box overflow-hidden rounded-xl">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[--hair] bg-base">
                <th className="px-4 py-2.5 text-left text-[0.62rem] font-semibold uppercase tracking-wider text-muted">
                  {t("date")}
                </th>
                <th className="px-4 py-2.5 text-left text-[0.62rem] font-semibold uppercase tracking-wider text-muted">
                  {t("class")}
                </th>
                <th className="px-4 py-2.5 text-left text-[0.62rem] font-semibold uppercase tracking-wider text-muted">
                  {t("statusColumn")}
                </th>
              </tr>
            </thead>
            <tbody>
              {records.map((row) => (
                <tr key={row.id} className="border-b border-[--hair] last:border-0">
                  <td className="px-4 py-3 text-ink">
                    {new Date(row.date).toLocaleDateString(locale, {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                    })}
                  </td>
                  <td className="px-4 py-3 text-ink">{row.className}</td>
                  <td className="px-4 py-3">
                    <span
                      className="inline-flex rounded-full px-2.5 py-0.5 text-[0.62rem] font-semibold uppercase tracking-wider text-white"
                      style={{ background: STATUS_COLORS[row.status] }}
                    >
                      {t(`status.${row.status}`)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
