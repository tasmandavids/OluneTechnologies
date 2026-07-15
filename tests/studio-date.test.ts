import { describe, it, expect } from "vitest";
import { studioLocalYmd, studioLocalYmdOffset } from "@/lib/date/studio-date";

describe("studioLocalYmd", () => {
  it("resolves the NZ-local date, not the lagging UTC date, in the UTC-lag window", () => {
    // 20:00 UTC on the 15th is 08:00 NZST (+12) on the 16th — the exact
    // window where new Date().toISOString().slice(0, 10) used to be wrong.
    const instant = new Date("2026-07-15T20:00:00Z");
    expect(instant.toISOString().slice(0, 10)).toBe("2026-07-15");
    expect(studioLocalYmd("Pacific/Auckland", instant)).toBe("2026-07-16");
  });

  it("agrees with UTC once the UTC day has caught up", () => {
    const instant = new Date("2026-07-16T05:00:00Z"); // 17:00 NZST same day
    expect(studioLocalYmd("Pacific/Auckland", instant)).toBe("2026-07-16");
  });

  it("defaults to Pacific/Auckland when no timezone is given", () => {
    const instant = new Date("2026-07-15T20:00:00Z");
    expect(studioLocalYmd(undefined, instant)).toBe("2026-07-16");
    expect(studioLocalYmd(null, instant)).toBe("2026-07-16");
  });

  it("respects a different IANA timezone", () => {
    const instant = new Date("2026-07-15T20:00:00Z");
    expect(studioLocalYmd("UTC", instant)).toBe("2026-07-15");
  });
});

describe("studioLocalYmdOffset", () => {
  it("offsets the local calendar date forward", () => {
    const instant = new Date("2026-07-15T20:00:00Z"); // NZ-local: 2026-07-16
    expect(studioLocalYmdOffset(7, "Pacific/Auckland", instant)).toBe("2026-07-23");
  });

  it("offsets the local calendar date backward", () => {
    const instant = new Date("2026-07-15T20:00:00Z"); // NZ-local: 2026-07-16
    expect(studioLocalYmdOffset(-1, "Pacific/Auckland", instant)).toBe("2026-07-15");
  });
});
