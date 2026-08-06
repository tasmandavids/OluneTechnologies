// ============================================================================
//  BuildingCountWidget — compact "N people in the building" stat for the
//  Today dashboard, linking through to the full /portal/admin/checkin roster.
//  Presentational only; count is fetched server-side (lib/checkin/roster.ts)
//  and passed in as a prop, same pattern as the other Today widgets.
// ============================================================================

import Link from "next/link";

export function BuildingCountWidget({ count }: { count: number }) {
  return (
    <Link href="/portal/admin/checkin" className="flex h-full flex-col justify-between">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">In the building</p>
        <p className="mt-2 text-4xl font-black tabular-nums text-ink">{count}</p>
        <p className="mt-1 text-xs text-muted">
          {count === 1 ? "person checked in right now" : "people checked in right now"}
        </p>
      </div>
      <span className="mt-4 text-[12px] font-semibold text-ink">View roster →</span>
    </Link>
  );
}
