import { describe, expect, it } from "vitest";
import {
  comboSavingsCents,
  matchCombos,
  type BasketItem,
  type ComboDefinition,
} from "@/lib/billing/combo-match";

function item(overrides: Partial<BasketItem> & { classId: string }): BasketItem {
  return {
    productId: "prod-int",
    name: "Intermediate",
    priceCents: 29900,
    ...overrides,
  };
}

function combo(overrides: Partial<ComboDefinition> = {}): ComboDefinition {
  return {
    productId: "combo-int",
    code: "COMBO-INT",
    name: "Intermediate — both nights",
    priceCents: 29900,
    components: [{ productId: "prod-int", quantity: 2 }],
    ...overrides,
  };
}

describe("matchCombos", () => {
  it("replaces two classes on one product with the combo price", () => {
    // The complaint this feature exists for: $299 priced once, charged twice.
    const basket = [
      item({ classId: "c-mon", name: "Intermediate Mon" }),
      item({ classId: "c-wed", name: "Intermediate Wed" }),
    ];

    const { fires, leftovers } = matchCombos(basket, [combo()]);

    expect(leftovers).toEqual([]);
    expect(fires).toHaveLength(1);
    expect(fires[0].combo.priceCents).toBe(29900);
    expect(fires[0].savingsCents).toBe(29900);
    expect(fires[0].consumed.map((i) => i.classId).sort()).toEqual(["c-mon", "c-wed"]);
  });

  it("matches two distinct products as well as one product twice", () => {
    const basket = [
      item({ classId: "c-mon", productId: "prod-mon" }),
      item({ classId: "c-wed", productId: "prod-wed" }),
    ];
    const twoProducts = combo({
      components: [
        { productId: "prod-mon", quantity: 1 },
        { productId: "prod-wed", quantity: 1 },
      ],
    });

    expect(matchCombos(basket, [twoProducts]).fires).toHaveLength(1);
  });

  it("does not fire on a partial match", () => {
    // Two of a three-class combo is two classes, not two-thirds of a discount.
    const basket = [item({ classId: "c-mon" }), item({ classId: "c-wed" })];
    const threeOf = combo({ components: [{ productId: "prod-int", quantity: 3 }] });

    const { fires, leftovers } = matchCombos(basket, [threeOf]);
    expect(fires).toEqual([]);
    expect(leftovers).toHaveLength(2);
  });

  it("never fires a combo that costs more than the classes it replaces", () => {
    const basket = [item({ classId: "c-mon" }), item({ classId: "c-wed" })];
    const overpriced = combo({ priceCents: 70000 });

    expect(matchCombos(basket, [overpriced]).fires).toEqual([]);
  });

  it("never fires a combo priced exactly the same as its parts", () => {
    const basket = [item({ classId: "c-mon" }), item({ classId: "c-wed" })];
    expect(matchCombos(basket, [combo({ priceCents: 59800 })]).fires).toEqual([]);
  });

  it("fires the same combo twice when the basket supports it", () => {
    const basket = [
      item({ classId: "c1" }),
      item({ classId: "c2" }),
      item({ classId: "c3" }),
      item({ classId: "c4" }),
    ];

    const { fires, leftovers } = matchCombos(basket, [combo()]);
    expect(fires).toHaveLength(2);
    expect(leftovers).toEqual([]);
  });

  it("returns uncovered classes at their own price", () => {
    const basket = [
      item({ classId: "c-mon" }),
      item({ classId: "c-wed" }),
      item({ classId: "c-jazz", productId: "prod-jazz", name: "Jazz", priceCents: 20000 }),
    ];

    const { fires, leftovers } = matchCombos(basket, [combo()]);
    expect(fires).toHaveLength(1);
    expect(leftovers.map((l) => l.classId)).toEqual(["c-jazz"]);
  });

  it("cannot match a class that has no catalogue product", () => {
    const basket = [item({ classId: "c-mon", productId: null }), item({ classId: "c-wed" })];
    expect(matchCombos(basket, [combo()]).fires).toEqual([]);
  });

  it("consumes the dearest classes so the family saves the most", () => {
    const basket = [
      item({ classId: "c-cheap", priceCents: 10000 }),
      item({ classId: "c-dear", priceCents: 40000 }),
      item({ classId: "c-mid", priceCents: 25000 }),
    ];

    const { fires, leftovers } = matchCombos(basket, [combo()]);
    expect(fires[0].consumed.map((i) => i.classId)).toEqual(["c-dear", "c-mid"]);
    expect(leftovers.map((l) => l.classId)).toEqual(["c-cheap"]);
  });

  it("takes the combo that saves the family the most", () => {
    const basket = [item({ classId: "c-mon" }), item({ classId: "c-wed" })];
    const small = combo({ productId: "p-small", code: "A-SMALL", priceCents: 50000 });
    const big = combo({ productId: "p-big", code: "Z-BIG", priceCents: 29900 });

    const { fires } = matchCombos(basket, [small, big]);
    expect(fires).toHaveLength(1);
    expect(fires[0].combo.productId).toBe("p-big");
  });

  it("breaks a savings tie on how much the combo covers", () => {
    const basket = [
      item({ classId: "c1", productId: "p-a", priceCents: 20000 }),
      item({ classId: "c2", productId: "p-b", priceCents: 20000 }),
    ];
    const narrow = combo({
      productId: "p-narrow",
      code: "A-NARROW",
      priceCents: 10000,
      components: [{ productId: "p-a", quantity: 1 }],
    });
    const wide = combo({
      productId: "p-wide",
      code: "Z-WIDE",
      priceCents: 30000,
      components: [
        { productId: "p-a", quantity: 1 },
        { productId: "p-b", quantity: 1 },
      ],
    });

    // Both save $100; the one covering both classes wins.
    const { fires } = matchCombos(basket, [narrow, wide]);
    expect(fires[0].combo.productId).toBe("p-wide");
  });

  it("breaks a full tie on code, so the same basket always resolves the same", () => {
    const basket = [item({ classId: "c-mon" }), item({ classId: "c-wed" })];
    const zed = combo({ productId: "p-z", code: "Z-COMBO" });
    const ay = combo({ productId: "p-a", code: "A-COMBO" });

    expect(matchCombos(basket, [zed, ay]).fires[0].combo.code).toBe("A-COMBO");
    expect(matchCombos(basket, [ay, zed]).fires[0].combo.code).toBe("A-COMBO");
  });

  it("terminates on a catalogue that would otherwise loop", () => {
    const basket = Array.from({ length: 60 }, (_, i) => item({ classId: `c${i}` }));
    const { fires } = matchCombos(basket, [combo()]);
    expect(fires.length).toBeLessThanOrEqual(20);
  });

  it("leaves the basket alone when the studio has no combos", () => {
    const basket = [item({ classId: "c-mon" })];
    expect(matchCombos(basket, [])).toEqual({ fires: [], leftovers: basket });
  });

  it("ignores a combo with no contents", () => {
    const basket = [item({ classId: "c-mon" })];
    expect(matchCombos(basket, [combo({ components: [] })]).fires).toEqual([]);
  });
});

describe("comboSavingsCents", () => {
  it("reports the saving for the editor's live readout", () => {
    const basket = [item({ classId: "c-mon" }), item({ classId: "c-wed" })];
    expect(comboSavingsCents(basket, combo())).toBe(29900);
  });

  it("reports a negative saving so the editor can warn", () => {
    const basket = [item({ classId: "c-mon" }), item({ classId: "c-wed" })];
    expect(comboSavingsCents(basket, combo({ priceCents: 70000 }))).toBe(-10200);
  });

  it("is null when the basket can't satisfy the combo", () => {
    expect(comboSavingsCents([item({ classId: "c-mon" })], combo())).toBeNull();
  });
});
