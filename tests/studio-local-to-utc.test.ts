import { describe, expect, it } from "vitest";
import { studioLocalToUtcIso } from "@/lib/date/studio-date";

describe("studioLocalToUtcIso (audit F1-03)", () => {
  it("stores a 7pm NZDT recital as 06:00Z the same day", () => {
    expect(studioLocalToUtcIso("2026-11-20T19:00", "Pacific/Auckland")).toBe("2026-11-20T06:00:00.000Z");
  });
  it("uses NZST (+12) outside daylight saving", () => {
    expect(studioLocalToUtcIso("2026-07-15T19:00:00", "Pacific/Auckland")).toBe("2026-07-15T07:00:00.000Z");
  });
  it("handles the September spring-forward and April fall-back days", () => {
    // DST starts Sun 27 Sep 2026 at 02:00 NZST; ends Sun 5 Apr 2026 at 03:00 NZDT.
    expect(studioLocalToUtcIso("2026-09-27T12:00", "Pacific/Auckland")).toBe("2026-09-26T23:00:00.000Z");
    expect(studioLocalToUtcIso("2026-09-26T12:00", "Pacific/Auckland")).toBe("2026-09-26T00:00:00.000Z");
    expect(studioLocalToUtcIso("2026-04-05T12:00", "Pacific/Auckland")).toBe("2026-04-05T00:00:00.000Z");
    expect(studioLocalToUtcIso("2026-04-04T12:00", "Pacific/Auckland")).toBe("2026-04-03T23:00:00.000Z");
  });
  it("defaults to Pacific/Auckland and passes explicit offsets through", () => {
    expect(studioLocalToUtcIso("2026-11-20T19:00")).toBe("2026-11-20T06:00:00.000Z");
    expect(studioLocalToUtcIso("2026-11-20T19:00:00+13:00", "UTC")).toBe("2026-11-20T06:00:00.000Z");
  });
  it("returns null for junk", () => {
    expect(studioLocalToUtcIso("not a date")).toBeNull();
  });
});
