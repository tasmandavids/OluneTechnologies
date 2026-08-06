// ============================================================================
//  WhosInRoster — presentational table for the Check-in admin page. Data is
//  fetched server-side (lib/checkin/roster.ts) and passed in as a prop.
// ============================================================================

import type { RosterEntry } from "@/lib/checkin/roster";

function initials(name: string | null): string {
  return (name ?? "?")
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function elapsedSince(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  return `${hours}h ${mins % 60}m`;
}

export function WhosInRoster({ entries }: { entries: RosterEntry[] }) {
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-bold text-ink">In the building</h2>
        <span className="text-xs text-muted">
          {entries.length} {entries.length === 1 ? "person" : "people"}
        </span>
      </div>

      {entries.length === 0 ? (
        <p className="text-sm text-muted">Nobody has tapped in yet today.</p>
      ) : (
        <ul className="divide-y" style={{ borderColor: "var(--hair)" }}>
          {entries.map((entry) => (
            <li key={entry.studentId} className="flex items-center gap-3 py-2.5">
              <span
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-black text-white"
                style={{ background: "var(--brand)" }}
              >
                {initials(entry.fullName)}
              </span>
              <span className="flex-1 truncate text-sm font-medium text-ink">
                {entry.fullName ?? "Unknown"}
              </span>
              <span className="shrink-0 text-xs text-muted">in {elapsedSince(entry.tappedInAt)} ago</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
