"use client";

import type { TeacherAvailabilityRow } from "@/app/portal/admin/availability/page";
import { GlassPanel } from "@/components/portal/admin/glass/GlassPanel";

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Mon–Sat–Sun

function formatTime(t: string) {
  // "HH:MM:SS" → "9:00 am"
  const [h, m] = t.split(":").map(Number);
  const ampm = h < 12 ? "am" : "pm";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${ampm}`;
}

const DAY_ABBR: Record<number, string> = {
  0: "Sun", 1: "Mon", 2: "Tue", 3: "Wed", 4: "Thu", 5: "Fri", 6: "Sat",
};

export function AdminAvailabilityView({ rows }: { rows: TeacherAvailabilityRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <h1 className="text-xl font-semibold text-ink">Teacher availability</h1>
        <p className="mt-6 text-sm text-muted">No teachers or availability slots on record yet.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <div>
        <h1 className="text-xl font-semibold text-ink">Teacher availability</h1>
        <p className="mt-0.5 text-sm text-muted">Read-only view of slots teachers have marked as available</p>
      </div>

      <div className="space-y-3">
        {rows.map((teacher) => (
          <GlassPanel key={teacher.teacherId} className="!p-0 overflow-hidden">
            <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "var(--hair)" }}>
              <p className="text-sm font-medium text-ink">{teacher.teacherName}</p>
              {teacher.slots.length === 0 && (
                <span className="text-xs text-muted">No availability set</span>
              )}
            </div>
            {teacher.slots.length > 0 && (
              <div className="flex flex-wrap gap-2 px-4 py-3">
                {DAY_ORDER.flatMap((day) =>
                  teacher.slots
                    .filter((s) => s.day === day)
                    .map((slot, i) => (
                      <div
                        key={`${day}-${i}`}
                        className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5"
                        style={{ background: "var(--t2)", border: "1px solid var(--tb)" }}
                      >
                        <span className="text-xs font-semibold text-ink">{DAY_ABBR[day]}</span>
                        <span className="text-xs text-muted">
                          {formatTime(slot.startTime)} – {formatTime(slot.endTime)}
                        </span>
                        {slot.notes && (
                          <span className="max-w-[120px] truncate text-xs text-muted" title={slot.notes}>
                            · {slot.notes}
                          </span>
                        )}
                      </div>
                    ))
                )}
              </div>
            )}
          </GlassPanel>
        ))}
      </div>
    </div>
  );
}
