import { describe, it, expect } from "vitest";
import { getClockState, getStudioTimesheets } from "@/lib/timeclock/queries";

type EntryRow = {
  id: string;
  staff_id: string;
  entry_date: string;
  clock_in_at: string;
  clock_out_at: string | null;
  hour_type: string;
  source: string;
  location_name: string | null;
  note: string | null;
  approved_at: string | null;
};

type ShiftRow = { staff_id: string; shift_date: string; start_time: string; end_time: string };

function entry(over: Partial<EntryRow> & { id: string }): EntryRow {
  return {
    staff_id: "staff-1",
    entry_date: "2026-08-05",
    clock_in_at: "2026-08-05T09:00:00Z",
    clock_out_at: "2026-08-05T17:00:00Z",
    hour_type: "regular",
    source: "portal",
    location_name: null,
    note: null,
    approved_at: null,
    ...over,
  };
}

/**
 * Chainable stand-in for the Supabase query builder.
 *
 * Every filter method returns the builder; awaiting it yields the dataset for
 * the table. The one query that needs distinguishing is the open-shift read —
 * it's the only one ending in maybeSingle(), so that method serves `openEntry`
 * while `await` serves the list.
 */
function makeClient(data: {
  entries?: EntryRow[];
  openEntry?: { id: string; clock_in_at: string; source: string } | null;
  shifts?: ShiftRow[];
  profiles?: { id: string; full_name: string | null }[];
}) {
  const queried: string[] = [];

  const build = (table: string) => {
    const rows =
      table === "staff_time_entries"
        ? (data.entries ?? [])
        : table === "staff_shifts"
          ? (data.shifts ?? [])
          : (data.profiles ?? []);

    const chain = {
      select: () => chain,
      eq: () => chain,
      in: () => chain,
      is: () => chain,
      not: () => chain,
      gte: () => chain,
      lte: () => chain,
      order: () => chain,
      maybeSingle: async () => ({ data: data.openEntry ?? null, error: null }),
      then: (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
        Promise.resolve({ data: rows, error: null }).then(resolve),
    };
    return chain;
  };

  const client = {
    from(table: string) {
      queried.push(table);
      return build(table);
    },
  };

  // Deliberately partial — see the comment above.
  return { client: client as never, queried };
}

describe("getClockState", () => {
  it("reports the open shift and leaves it out of the week's total", async () => {
    // An open shift has an unknown duration, not a zero one. Counting it as
    // worked time would inflate the week; counting it as zero would be a lie
    // the card then has to walk back when it closes.
    const { client } = makeClient({
      entries: [
        entry({ id: "a" }), // 8h closed
        entry({ id: "b", entry_date: "2026-08-06", clock_out_at: null }),
      ],
      openEntry: { id: "b", clock_in_at: "2026-08-06T09:00:00Z", source: "nfc" },
    });

    const state = await getClockState(client, "staff-1", new Date("2026-08-07T12:00:00"));

    expect(state.open).toEqual({
      id: "b",
      clockInAt: "2026-08-06T09:00:00Z",
      source: "nfc",
    });
    expect(state.weekMinutes).toBe(480);
    expect(state.entries).toHaveLength(2);
    expect(state.entries.find((e) => e.id === "b")?.minutes).toBeNull();
  });

  it("sums a split day's rostered shifts rather than taking one of them", async () => {
    // Morning desk plus an evening class is two staff_shifts rows and one
    // working day; a variance computed off either row alone is wrong.
    const { client } = makeClient({
      entries: [],
      shifts: [
        { staff_id: "staff-1", shift_date: "2026-08-05", start_time: "09:00", end_time: "12:00" },
        { staff_id: "staff-1", shift_date: "2026-08-05", start_time: "17:00", end_time: "19:30" },
      ],
    });

    const state = await getClockState(client, "staff-1", new Date("2026-08-07T12:00:00"));

    expect(state.scheduledMinutes).toBe(330); // 3h + 2h30
  });

  it("returns a usable state when nothing has been recorded", async () => {
    const { client } = makeClient({});
    const state = await getClockState(client, "staff-1", new Date("2026-08-07T12:00:00"));

    expect(state.open).toBeNull();
    expect(state.weekMinutes).toBe(0);
    expect(state.scheduledMinutes).toBe(0);
    expect(state.entries).toEqual([]);
  });
});

describe("getStudioTimesheets", () => {
  const range = { from: "2026-08-03", to: "2026-08-09" };

  it("measures each entry against that staff member's roster for that day", async () => {
    const { client } = makeClient({
      entries: [entry({ id: "a", clock_out_at: "2026-08-05T17:30:00Z" })], // 8h30
      shifts: [
        { staff_id: "staff-1", shift_date: "2026-08-05", start_time: "09:00", end_time: "17:00" },
      ],
      profiles: [{ id: "staff-1", full_name: "Ada Reed" }],
    });

    const [row] = await getStudioTimesheets(client, "studio-1", range);

    expect(row.staffName).toBe("Ada Reed");
    expect(row.minutes).toBe(510);
    expect(row.scheduledMinutes).toBe(480);
    expect(row.varianceMinutes).toBe(30);
  });

  it("leaves variance null for a day nobody was rostered for", async () => {
    // Null and 0 are different answers: "not rostered" must not read as
    // "rostered for nothing and therefore entirely over".
    const { client } = makeClient({
      entries: [entry({ id: "a" })],
      shifts: [],
      profiles: [{ id: "staff-1", full_name: "Ada Reed" }],
    });

    const [row] = await getStudioTimesheets(client, "studio-1", range);

    expect(row.scheduledMinutes).toBeNull();
    expect(row.varianceMinutes).toBeNull();
  });

  it("leaves variance null while the shift is still open", async () => {
    const { client } = makeClient({
      entries: [entry({ id: "a", clock_out_at: null })],
      shifts: [
        { staff_id: "staff-1", shift_date: "2026-08-05", start_time: "09:00", end_time: "17:00" },
      ],
      profiles: [{ id: "staff-1", full_name: "Ada Reed" }],
    });

    const [row] = await getStudioTimesheets(client, "studio-1", range);

    expect(row.minutes).toBeNull();
    expect(row.scheduledMinutes).toBe(480);
    expect(row.varianceMinutes).toBeNull();
  });

  it("does not query rosters or names when there are no entries", async () => {
    const { client, queried } = makeClient({ entries: [] });

    const rows = await getStudioTimesheets(client, "studio-1", range);

    expect(rows).toEqual([]);
    expect(queried).toEqual(["staff_time_entries"]);
  });

  it("falls back to a null name rather than dropping an unnamed staff member", async () => {
    const { client } = makeClient({
      entries: [entry({ id: "a" })],
      profiles: [],
    });

    const [row] = await getStudioTimesheets(client, "studio-1", range);

    expect(row.staffId).toBe("staff-1");
    expect(row.staffName).toBeNull();
  });
});
