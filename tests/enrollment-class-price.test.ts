import { describe, it, expect } from "vitest";
import { loadStudioClassPrice, loadStudioClassPrices } from "@/lib/enrollment-class-price";

describe("loadStudioClassPrice", () => {
  it("returns null when class is missing", async () => {
    const client = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null }),
            }),
          }),
        }),
      }),
    };
    const r = await loadStudioClassPrice(client as never, "studio-1", "class-1");
    expect(r).toBeNull();
  });

  it("maps DB price_cents and never invents a client price", async () => {
    const client = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: "class-1",
                  name: "Ballet",
                  price_cents: 44500,
                  studio_id: "studio-1",
                  recurring_group_id: null,
                },
              }),
            }),
          }),
        }),
      }),
    };
    const r = await loadStudioClassPrice(client as never, "studio-1", "class-1");
    expect(r).toEqual({
      id: "class-1",
      name: "Ballet",
      priceCents: 44500,
      studioId: "studio-1",
      recurringGroupId: null,
      productId: null,
      accountCode: null,
      itemCode: null,
      taxTreatment: "standard",
      taxRateBp: 1500,
      hours: 0,
    });
  });

  // Hours pricing measures the class; a class with no finish time can't be
  // measured, and counting it as zero is more honest than guessing.
  it("derives weekly hours from the class times", async () => {
    const row = (start: string | null, end: string | null) => ({
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: "class-1",
                  name: "Ballet",
                  price_cents: 44500,
                  studio_id: "studio-1",
                  recurring_group_id: null,
                  start_time: start,
                  end_time: end,
                },
              }),
            }),
          }),
        }),
      }),
    });

    expect((await loadStudioClassPrice(row("16:00", "17:30") as never, "studio-1", "c"))?.hours).toBe(1.5);
    expect((await loadStudioClassPrice(row("16:00", null) as never, "studio-1", "c"))?.hours).toBe(0);
    expect((await loadStudioClassPrice(row(null, null) as never, "studio-1", "c"))?.hours).toBe(0);
  });

  // Since the billing catalogue (0105) the linked product is the source of
  // truth; classes.price_cents is only a fallback for rows that predate it.
  it("prefers the linked catalogue product over classes.price_cents", async () => {
    const client = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: "class-1",
                  name: "Ballet",
                  price_cents: 44500,
                  studio_id: "studio-1",
                  recurring_group_id: null,
                  xero_account_code: "200",
                  xero_item_code: null,
                  product_id: "prod-1",
                  product: {
                    id: "prod-1",
                    unit_amount_cents: 50000,
                    account_code: "210",
                    item_code: "TUITION",
                    tax_treatment: "zero_rated",
                    tax_rate_bp: 0,
                    active: true,
                  },
                },
              }),
            }),
          }),
        }),
      }),
    };
    const r = await loadStudioClassPrice(client as never, "studio-1", "class-1");
    expect(r?.priceCents).toBe(50000);
    expect(r?.productId).toBe("prod-1");
    expect(r?.accountCode).toBe("210");
    expect(r?.itemCode).toBe("TUITION");
    expect(r?.taxTreatment).toBe("zero_rated");
    expect(r?.taxRateBp).toBe(0);
  });

  // Archiving means "stop selling this", not "bill it at nothing" — classes
  // already pointing at the product keep charging what it says.
  it("keeps pricing from an archived product", async () => {
    const client = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: "class-1",
                  name: "Ballet",
                  price_cents: 0,
                  studio_id: "studio-1",
                  recurring_group_id: null,
                  product_id: "prod-1",
                  product: {
                    id: "prod-1",
                    unit_amount_cents: 50000,
                    account_code: null,
                    item_code: null,
                    tax_treatment: "standard",
                    tax_rate_bp: 1500,
                    active: false,
                  },
                },
              }),
            }),
          }),
        }),
      }),
    };
    const r = await loadStudioClassPrice(client as never, "studio-1", "class-1");
    expect(r?.priceCents).toBe(50000);
  });

  // 0082/0083 codes stay readable for classes the backfill never linked.
  it("falls back to the class's own Xero codes when there is no product", async () => {
    const client = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: "class-1",
                  name: "Ballet",
                  price_cents: 44500,
                  studio_id: "studio-1",
                  recurring_group_id: null,
                  xero_account_code: "200-02",
                  xero_item_code: "LEGACY",
                  product_id: null,
                  product: null,
                },
              }),
            }),
          }),
        }),
      }),
    };
    const r = await loadStudioClassPrice(client as never, "studio-1", "class-1");
    expect(r?.priceCents).toBe(44500);
    expect(r?.accountCode).toBe("200-02");
    expect(r?.itemCode).toBe("LEGACY");
  });
});

describe("loadStudioClassPrices", () => {
  it("returns a map keyed by class id", async () => {
    const client = {
      from: () => ({
        select: () => ({
          eq: () => ({
            in: async () => ({
              data: [
                {
                  id: "c1",
                  name: "A",
                  price_cents: 1000,
                  studio_id: "s1",
                  recurring_group_id: null,
                },
                {
                  id: "c2",
                  name: "B",
                  price_cents: 2000,
                  studio_id: "s1",
                  recurring_group_id: "g1",
                },
              ],
            }),
          }),
        }),
      }),
    };
    const map = await loadStudioClassPrices(client as never, "s1", ["c1", "c2"]);
    expect(map.size).toBe(2);
    expect(map.get("c2")?.priceCents).toBe(2000);
    expect(map.get("c2")?.recurringGroupId).toBe("g1");
  });
});
