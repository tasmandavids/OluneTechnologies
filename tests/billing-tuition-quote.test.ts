import { describe, expect, it } from "vitest";
import { normaliseLadder } from "@/lib/billing/hours-ladder";
import type { ComboDefinition } from "@/lib/billing/combo-match";
import { quoteTuition, type QuoteClass } from "@/lib/billing/tuition-quote";

function cls(overrides: Partial<QuoteClass> & { classId: string }): QuoteClass {
  return {
    name: "Intermediate",
    productId: "prod-int",
    priceCents: 44500,
    hours: 1,
    recurringGroupId: null,
    ...overrides,
  };
}

const ladder = normaliseLadder(
  [
    { minHours: 1.0, totalCents: 9500 },
    { minHours: 1.5, totalCents: 13500 },
    { minHours: 2.0, totalCents: 17000 },
    { minHours: 3.0, totalCents: 23000 },
    { minHours: 4.0, totalCents: 27000 },
    { minHours: 5.0, totalCents: 29000 },
  ],
  2500,
);

// ─────────────────────────────────────────────────────────────────────────────
//  per_class — the rules live studios are already priced under.
//
//  These were enforced by lib/enrollment-billing.ts, a Supabase-level module
//  quoteTuition replaced in the enrolment path and which has since been
//  deleted. This block is now the only specification of the behaviour: the
//  cents below are what real invoices have been issued for, so a change that
//  moves any of them re-prices existing families. Treat a failure here as "the
//  change is wrong", not "the expectation is stale".
// ─────────────────────────────────────────────────────────────────────────────

describe("quoteTuition — per_class", () => {
  const quote = (adding: QuoteClass[], existing: QuoteClass[] = []) =>
    quoteTuition({ model: "per_class", adding, existing });

  it("bills a free class at nothing", () => {
    expect(quote([cls({ classId: "c1", priceCents: 0 })]).totalCents).toBe(0);
  });

  it("bills a standalone class in full", () => {
    expect(quote([cls({ classId: "c1", priceCents: 12000 })]).totalCents).toBe(12000);
  });

  it("bills two same-named but unlinked classes in full — no name matching", () => {
    // The bug this whole feature started from. Under per_class it is still the
    // correct behaviour: only an explicit link, or a combo, changes the price.
    const result = quote([
      cls({ classId: "c-mon", name: "Intermediate", priceCents: 29900 }),
      cls({ classId: "c-wed", name: "Intermediate", priceCents: 29900 }),
    ]);
    expect(result.totalCents).toBe(59800);
  });

  it("bills the first day of a linked series and includes the rest", () => {
    const result = quote([
      cls({ classId: "c-mon", recurringGroupId: "group-1" }),
      cls({ classId: "c-wed", recurringGroupId: "group-1" }),
    ]);

    expect(result.totalCents).toBe(44500);
    expect(result.lines.map((l) => l.chargeCents)).toEqual([44500, 0]);
    expect(result.lines[1].includedReason).toBe("programme");
  });

  it("bills a standalone class in the same batch independently of the series", () => {
    const result = quote([
      cls({ classId: "c-mon", recurringGroupId: "group-1" }),
      cls({ classId: "c-wed", recurringGroupId: "group-1" }),
      cls({ classId: "c-adult", priceCents: 22000 }),
    ]);

    expect(result.lines.map((l) => l.chargeCents)).toEqual([44500, 0, 22000]);
    expect(result.totalCents).toBe(66500);
  });

  it("bills nothing for a series already covered by a prior enrolment", () => {
    const result = quote(
      [cls({ classId: "c-wed", recurringGroupId: "group-1" })],
      [cls({ classId: "c-mon", recurringGroupId: "group-1" })],
    );

    expect(result.totalCents).toBe(0);
    expect(result.lines[0].includedReason).toBe("programme");
  });

  it("ignores an existing enrolment in a different group", () => {
    const result = quote(
      [cls({ classId: "c-wed", recurringGroupId: "group-1" })],
      [cls({ classId: "c-mon", recurringGroupId: "group-2" })],
    );
    expect(result.totalCents).toBe(44500);
  });
});

describe("quoteTuition — hours", () => {
  const quote = (
    adding: QuoteClass[],
    existing: QuoteClass[] = [],
    priorInvoicedCents = 0,
  ) =>
    quoteTuition({
      model: "hours",
      adding,
      existing,
      ladder,
      ladderProductId: "prod-ladder",
      priorInvoicedCents,
    });

  it("prices the dancer's whole week as one line", () => {
    const result = quote([
      cls({ classId: "c-ballet", hours: 1.5 }),
      cls({ classId: "c-jazz", hours: 1 }),
    ]);

    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].kind).toBe("hours");
    expect(result.lines[0].productId).toBe("prod-ladder");
    expect(result.hours).toMatchObject({ before: 0, after: 2.5 });
    expect(result.totalCents).toBe(17000);
  });

  it("charges only the band difference on a mid-term add", () => {
    // 2 hrs already invoiced at $170; one more hour moves them to the 3 hr
    // band at $230, so they owe $60 — not $230.
    const result = quote([cls({ classId: "c-new", hours: 1 })], [cls({ classId: "c-old", hours: 2 })], 17000);

    expect(result.grossCents).toBe(23000);
    expect(result.priorCreditCents).toBe(17000);
    expect(result.totalCents).toBe(6000);
  });

  it("charges nothing when the same enrolment is submitted twice", () => {
    // The retry: the classes are already active and already invoiced.
    const result = quote([], [cls({ classId: "c-old", hours: 3 })], 23000);
    expect(result.totalCents).toBe(0);
  });

  it("never returns a credit when prior invoices exceed the band", () => {
    const result = quote([], [cls({ classId: "c-old", hours: 1 })], 50000);
    expect(result.totalCents).toBe(0);
  });

  it("counts every day of a linked series, unlike per_class", () => {
    // Hours already counts each class's duration, so zeroing the second night
    // would undercount the ladder. Two 1.5 hr nights is 3 hrs, not 1.5.
    const result = quote([
      cls({ classId: "c-mon", hours: 1.5, recurringGroupId: "group-1" }),
      cls({ classId: "c-wed", hours: 1.5, recurringGroupId: "group-1" }),
    ]);

    expect(result.hours?.after).toBe(3);
    expect(result.totalCents).toBe(23000);
  });

  it("charges nothing when the studio hasn't typed a rate card yet", () => {
    const result = quoteTuition({
      model: "hours",
      adding: [cls({ classId: "c1", hours: 2 })],
      existing: [],
      ladder: normaliseLadder([], null),
    });
    expect(result.totalCents).toBe(0);
  });

  it("counts a class with no finish time as no hours", () => {
    const result = quote([cls({ classId: "c-unknown", hours: 0 })]);
    expect(result.hours?.after).toBe(0);
    expect(result.totalCents).toBe(0);
  });
});

describe("quoteTuition — per_class_combos", () => {
  const combo: ComboDefinition = {
    productId: "combo-int",
    code: "COMBO-INT",
    name: "Intermediate — both nights",
    priceCents: 29900,
    components: [{ productId: "prod-int", quantity: 2 }],
  };

  const quote = (adding: QuoteClass[], existing: QuoteClass[] = []) =>
    quoteTuition({ model: "per_class_combos", adding, existing, combos: [combo] });

  it("charges the combo price once instead of each class", () => {
    const result = quote([
      cls({ classId: "c-mon", name: "Intermediate Mon", priceCents: 29900 }),
      cls({ classId: "c-wed", name: "Intermediate Wed", priceCents: 29900 }),
    ]);

    expect(result.totalCents).toBe(29900);
    expect(result.lines.map((l) => l.kind)).toEqual(["combo", "combo_detail", "combo_detail"]);
    expect(result.lines[1].chargeCents).toBe(0);
    expect(result.lines[1].includedReason).toBe("combo");
  });

  it("prices classes no combo covers per class", () => {
    const result = quote([
      cls({ classId: "c-mon", priceCents: 29900 }),
      cls({ classId: "c-wed", priceCents: 29900 }),
      cls({ classId: "c-jazz", productId: "prod-jazz", name: "Jazz", priceCents: 20000 }),
    ]);

    expect(result.totalCents).toBe(49900);
    expect(result.lines.at(-1)).toMatchObject({ kind: "class", chargeCents: 20000 });
  });

  it("still applies the linked-series rule to leftovers", () => {
    const result = quote([
      cls({ classId: "c-mon", productId: "prod-a", recurringGroupId: "group-1" }),
      cls({ classId: "c-wed", productId: "prod-a", recurringGroupId: "group-1" }),
    ]);

    // No combo covers prod-a, so this falls through to per-class + programme.
    expect(result.totalCents).toBe(44500);
  });

  it("falls back to per-class when the studio has no combos", () => {
    const result = quoteTuition({
      model: "per_class_combos",
      adding: [cls({ classId: "c-mon", priceCents: 29900 }), cls({ classId: "c-wed", priceCents: 29900 })],
      existing: [],
      combos: [],
    });
    expect(result.totalCents).toBe(59800);
  });
});

describe("quoteTuition — sibling discount", () => {
  it("applies once to the whole quote, not once per class", () => {
    const result = quoteTuition({
      model: "per_class",
      adding: [
        cls({ classId: "c1", priceCents: 10000 }),
        cls({ classId: "c2", priceCents: 10000 }),
      ],
      existing: [],
      siblingDiscountPct: 10,
    });

    expect(result.grossCents).toBe(20000);
    expect(result.siblingDiscountCents).toBe(2000);
    expect(result.totalCents).toBe(18000);
  });

  it("leaves the lines summing to the total, to the cent", () => {
    // Invoice lines have to reconcile against invoices.amount_cents, so an
    // indivisible discount has to land somewhere rather than evaporating.
    const result = quoteTuition({
      model: "per_class",
      adding: [
        cls({ classId: "c1", priceCents: 3333 }),
        cls({ classId: "c2", priceCents: 3333 }),
        cls({ classId: "c3", priceCents: 3333 }),
      ],
      existing: [],
      siblingDiscountPct: 15,
    });

    const summed = result.lines.reduce((sum, l) => sum + l.chargeCents, 0);
    expect(summed).toBe(result.totalCents);
  });

  it("applies to the ladder total in hours mode", () => {
    const result = quoteTuition({
      model: "hours",
      adding: [cls({ classId: "c1", hours: 3 })],
      existing: [],
      ladder,
      siblingDiscountPct: 10,
    });

    expect(result.grossCents).toBe(23000);
    expect(result.totalCents).toBe(20700);
  });

  it("does nothing for a self-managed adult", () => {
    const result = quoteTuition({
      model: "per_class",
      adding: [cls({ classId: "c1", priceCents: 10000 })],
      existing: [],
      siblingDiscountPct: 0,
    });
    expect(result.siblingDiscountCents).toBe(0);
    expect(result.totalCents).toBe(10000);
  });
});
