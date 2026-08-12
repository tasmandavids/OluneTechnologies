import { describe, it, expect } from "vitest";
import { applyStaffTapToClock } from "@/lib/timeclock/nfc";

type OpenRow = { id: string; clock_in_at: string } | null;

/**
 * Minimal stand-in for the Supabase query builder covering exactly the two
 * chains applyStaffTapToClock uses: a select of the open shift, and an
 * insert/update. Records what was written so the assertions can check the
 * payload rather than just the outcome string.
 */
function makeClient(opts: {
  open: OpenRow;
  insertError?: { code?: string } | null;
  updateError?: { code?: string } | null;
  /** Simulates the conditional update matching no row (someone else closed it). */
  updateMatchesNothing?: boolean;
}) {
  const writes: { table: string; op: "insert" | "update"; payload: Record<string, unknown> }[] = [];

  const client = {
    from(table: string) {
      return {
        select() {
          return {
            eq() {
              return {
                is() {
                  return { maybeSingle: async () => ({ data: opts.open }) };
                },
              };
            },
          };
        },
        insert(payload: Record<string, unknown>) {
          writes.push({ table, op: "insert", payload });
          return Promise.resolve({ error: opts.insertError ?? null });
        },
        update(payload: Record<string, unknown>) {
          writes.push({ table, op: "update", payload });
          return {
            eq() {
              return {
                is() {
                  return {
                    select() {
                      return {
                        maybeSingle: async () => ({
                          data: opts.updateMatchesNothing ? null : { id: "entry-1" },
                          error: opts.updateError ?? null,
                        }),
                      };
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };

  // The shape is deliberately partial — see the comment above.
  return { client: client as never, writes };
}

const BASE = {
  studioId: "studio-1",
  staffId: "staff-1",
  timezone: "Pacific/Auckland",
};

describe("applyStaffTapToClock — tapping in", () => {
  it("opens a shift with source 'nfc' and the studio-local date", async () => {
    // 20:00 UTC is the next calendar day in NZ — the entry must be dated in the
    // studio's day, not UTC's.
    const at = new Date("2026-08-07T20:00:00Z");
    const { client, writes } = makeClient({ open: null });

    const outcome = await applyStaffTapToClock(client, { ...BASE, direction: "in", at });

    expect(outcome).toBe("clocked_in");
    expect(writes).toHaveLength(1);
    expect(writes[0].payload).toMatchObject({
      staff_id: "staff-1",
      studio_id: "studio-1",
      source: "nfc",
      entry_date: "2026-08-08",
      clock_in_at: at.toISOString(),
    });
  });

  it("does not open a second shift when one is already open", async () => {
    const { client, writes } = makeClient({
      open: { id: "entry-1", clock_in_at: "2026-08-07T09:00:00Z" },
    });

    const outcome = await applyStaffTapToClock(client, {
      ...BASE,
      direction: "in",
      at: new Date("2026-08-07T13:00:00Z"),
    });

    expect(outcome).toBe("already_clocked_in");
    expect(writes).toHaveLength(0);
  });

  it("treats a lost race with the portal clock-in as already-clocked-in, not a failure", async () => {
    // The unique index fired because a portal clock-in landed first. The person
    // is on the clock either way — failing the door tap would be wrong.
    const { client } = makeClient({ open: null, insertError: { code: "23505" } });

    const outcome = await applyStaffTapToClock(client, {
      ...BASE,
      direction: "in",
      at: new Date("2026-08-07T09:00:00Z"),
    });

    expect(outcome).toBe("already_clocked_in");
  });

  it("reports a genuine write failure without throwing", async () => {
    const { client } = makeClient({ open: null, insertError: { code: "42501" } });

    await expect(
      applyStaffTapToClock(client, { ...BASE, direction: "in", at: new Date() }),
    ).resolves.toBe("failed");
  });
});

describe("applyStaffTapToClock — tapping out", () => {
  it("closes an open shift", async () => {
    const at = new Date("2026-08-07T17:00:00Z");
    const { client, writes } = makeClient({
      open: { id: "entry-1", clock_in_at: "2026-08-07T09:00:00Z" },
    });

    const outcome = await applyStaffTapToClock(client, { ...BASE, direction: "out", at });

    expect(outcome).toBe("clocked_out");
    expect(writes[0].payload).toEqual({ clock_out_at: at.toISOString() });
  });

  it("ignores a bounced double tap instead of recording a zero-minute shift", async () => {
    // Without this guard the direction alternation turns one physical double
    // tap into in-then-out, and the close either violates
    // clock_out_at > clock_in_at (a 500 on a door reader) or books 0 minutes.
    const openedAt = "2026-08-07T09:00:00Z";
    const { client, writes } = makeClient({ open: { id: "entry-1", clock_in_at: openedAt } });

    const outcome = await applyStaffTapToClock(client, {
      ...BASE,
      direction: "out",
      at: new Date("2026-08-07T09:00:03Z"), // 3 seconds later
    });

    expect(outcome).toBe("ignored_double_tap");
    expect(writes).toHaveLength(0); // shift left open for a real tap-out later
  });

  it("closes normally once past the double-tap window", async () => {
    const { client } = makeClient({ open: { id: "entry-1", clock_in_at: "2026-08-07T09:00:00Z" } });

    const outcome = await applyStaffTapToClock(client, {
      ...BASE,
      direction: "out",
      at: new Date("2026-08-07T09:02:00Z"),
    });

    expect(outcome).toBe("clocked_out");
  });

  it("reports tapping out with nothing open", async () => {
    const { client } = makeClient({ open: null });

    const outcome = await applyStaffTapToClock(client, {
      ...BASE,
      direction: "out",
      at: new Date(),
    });

    expect(outcome).toBe("not_clocked_in");
  });

  it("does not double-close when another reader won the race", async () => {
    // The conditional `.is('clock_out_at', null)` matched nothing, meaning
    // someone else closed it between our read and our write.
    const { client } = makeClient({
      open: { id: "entry-1", clock_in_at: "2026-08-07T09:00:00Z" },
      updateMatchesNothing: true,
    });

    const outcome = await applyStaffTapToClock(client, {
      ...BASE,
      direction: "out",
      at: new Date("2026-08-07T17:00:00Z"),
    });

    expect(outcome).toBe("not_clocked_in");
  });
});

describe("applyStaffTapToClock — write ordering", () => {
  it("only ever touches staff_time_entries, never the safety register", async () => {
    // building_taps is written by performTap before this module is reached and
    // must not be re-touched here — the tap is committed by the time the clock
    // runs, which is what makes a clock failure survivable.
    const { client, writes } = makeClient({ open: null });
    await applyStaffTapToClock(client, { ...BASE, direction: "in", at: new Date() });

    expect(writes.every((w) => w.table === "staff_time_entries")).toBe(true);
  });

  it("reports every failure as an outcome rather than a thrown error", async () => {
    // Exhaustive over the error paths this module can produce, so a future
    // refactor cannot start throwing and silently 500 the door reader.
    const cases = [
      { open: null, insertError: { code: "42501" }, direction: "in" as const },
      {
        open: { id: "e", clock_in_at: "2026-08-07T09:00:00Z" },
        updateError: { code: "42501" },
        direction: "out" as const,
      },
    ];

    for (const c of cases) {
      const { client } = makeClient(c);
      await expect(
        applyStaffTapToClock(client, {
          ...BASE,
          direction: c.direction,
          at: new Date("2026-08-07T17:00:00Z"),
        }),
      ).resolves.toBe("failed");
    }
  });
});
