import { describe, expect, it } from "vitest";
import {
  formatHours,
  ladderBandFor,
  ladderTopUpCents,
  ladderTotalCents,
  normaliseLadder,
  type HourBand,
} from "@/lib/billing/hours-ladder";

/** The table the studio owner actually described, in cents. */
const BANDS: HourBand[] = [
  { minHours: 1.0, totalCents: 9500 },
  { minHours: 1.5, totalCents: 13500 },
  { minHours: 2.0, totalCents: 17000 },
  { minHours: 3.0, totalCents: 23000 },
  { minHours: 4.0, totalCents: 27000 },
  { minHours: 5.0, totalCents: 29000 },
];

const ladder = normaliseLadder(BANDS, 2500);
const capped = normaliseLadder(BANDS, null);

describe("normaliseLadder", () => {
  it("sorts bands that arrive out of order", () => {
    const messy = normaliseLadder(
      [
        { minHours: 3, totalCents: 23000 },
        { minHours: 1, totalCents: 9500 },
        { minHours: 2, totalCents: 17000 },
      ],
      null,
    );
    expect(messy.bands.map((b) => b.minHours)).toEqual([1, 2, 3]);
  });

  it("drops rows a half-typed form produces", () => {
    const partial = normaliseLadder(
      [
        { minHours: 0, totalCents: 9500 },
        { minHours: Number.NaN, totalCents: 100 },
        { minHours: 2, totalCents: 17000 },
      ],
      null,
    );
    expect(partial.bands).toEqual([{ minHours: 2, totalCents: 17000 }]);
  });

  it("treats a negative overflow rate as no overflow", () => {
    expect(normaliseLadder(BANDS, -100).overflowRateCents).toBeNull();
  });
});

describe("ladderTotalCents", () => {
  it("prices an exact band", () => {
    expect(ladderTotalCents(ladder, 2)).toBe(17000);
    expect(ladderTotalCents(ladder, 3)).toBe(23000);
  });

  it("takes the highest band reached, not the nearest", () => {
    // 1.75 hrs is past the 1.5 row and short of 2.0, so it pays 1.5.
    expect(ladderTotalCents(ladder, 1.75)).toBe(13500);
    expect(ladderTotalCents(ladder, 2.9)).toBe(17000);
  });

  it("charges the smallest row below the smallest row", () => {
    // A 45-minute dancer on a ladder starting at an hour pays the hour.
    expect(ladderTotalCents(ladder, 0.75)).toBe(9500);
    expect(ladderTotalCents(ladder, 0.25)).toBe(9500);
  });

  it("adds the overflow rate past the last band", () => {
    expect(ladderTotalCents(ladder, 6)).toBe(29000 + 2500);
    // Fractional extra hours multiply exactly: $290 + $25 × 1.5 = $327.50.
    expect(ladderTotalCents(ladder, 6.5)).toBe(32750);
  });

  it("caps at the last band when there's no overflow rate", () => {
    expect(ladderTotalCents(capped, 6.5)).toBe(29000);
    expect(ladderTotalCents(capped, 20)).toBe(29000);
  });

  it("charges nothing for no hours or no ladder", () => {
    expect(ladderTotalCents(ladder, 0)).toBe(0);
    expect(ladderTotalCents(ladder, -3)).toBe(0);
    expect(ladderTotalCents(normaliseLadder([], 2500), 3)).toBe(0);
  });
});

describe("ladderBandFor", () => {
  it("reports the row and how far past it the dancer is", () => {
    expect(ladderBandFor(ladder, 6.5)).toEqual({
      band: { minHours: 5, totalCents: 29000 },
      index: 5,
      extraHours: 1.5,
    });
  });

  it("reports no overflow when the dancer isn't on the last band", () => {
    expect(ladderBandFor(ladder, 2.5).extraHours).toBe(0);
  });

  it("has no band at all for an empty ladder", () => {
    expect(ladderBandFor(normaliseLadder([], null), 3).band).toBeNull();
  });
});

describe("ladderTopUpCents", () => {
  it("charges the band difference, not the whole band", () => {
    // The case this feature exists for: 2 hrs ($170) picks up an hour, moves to
    // the 3 hr band ($230), owes $60.
    expect(ladderTopUpCents(ladder, 2, 1)).toBe(6000);
  });

  it("charges nothing when the extra hour doesn't move a band", () => {
    // 2.0 → 2.5 is still the 2.0 row.
    expect(ladderTopUpCents(ladder, 2, 0.5)).toBe(0);
  });

  it("charges the full band for a dancer starting from nothing", () => {
    expect(ladderTopUpCents(ladder, 0, 2)).toBe(17000);
  });

  it("prices a top-up entirely inside the overflow region", () => {
    // 6.0 ($315) → 7.0 ($340) is one overflow hour.
    expect(ladderTopUpCents(ladder, 6, 1)).toBe(2500);
  });

  it("never returns a credit", () => {
    expect(ladderTopUpCents(ladder, 3, -1)).toBe(0);
    expect(ladderTopUpCents(ladder, -1, 0)).toBe(0);
  });
});

describe("formatHours", () => {
  it("reads the way a studio would write it", () => {
    expect(formatHours(1)).toBe("1 hr");
    expect(formatHours(3)).toBe("3 hrs");
    expect(formatHours(2.5)).toBe("2.5 hrs");
    expect(formatHours(0.75)).toBe("0.75 hrs");
  });
});
