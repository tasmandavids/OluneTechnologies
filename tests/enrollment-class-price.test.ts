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
    });
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
