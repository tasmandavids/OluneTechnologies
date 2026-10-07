import { describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";

vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));

import { isStaleSubscriptionEvent } from "@/lib/plans/webhook";

function supabaseWith(row: { stripe_subscription_id: string | null; status: string } | null) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: async () => ({ data: row }),
  };
  return { from: () => chain } as never;
}

const event = (type: string, subId: string) =>
  ({ type, data: { object: type.startsWith("customer.subscription.") ? { id: subId } : { subscription: subId } } }) as unknown as Stripe.Event;

describe("isStaleSubscriptionEvent (audit B-05)", () => {
  const live = supabaseWith({ stripe_subscription_id: "sub_new", status: "active" });

  it("ignores a deleted event for a superseded subscription", async () => {
    expect(await isStaleSubscriptionEvent(event("customer.subscription.deleted", "sub_old"), "s1", live)).toBe(true);
  });
  it("ignores invoice events for a superseded subscription", async () => {
    expect(await isStaleSubscriptionEvent(event("invoice.payment_failed", "sub_old"), "s1", live)).toBe(true);
  });
  it("applies events for the tracked subscription", async () => {
    expect(await isStaleSubscriptionEvent(event("customer.subscription.deleted", "sub_new"), "s1", live)).toBe(false);
  });
  it("lets a lapsed studio re-subscribe", async () => {
    const lapsed = supabaseWith({ stripe_subscription_id: "sub_old", status: "canceled" });
    expect(await isStaleSubscriptionEvent(event("customer.subscription.created", "sub_new"), "s1", lapsed)).toBe(false);
  });
  it("applies anything when no subscription is tracked yet", async () => {
    expect(await isStaleSubscriptionEvent(event("invoice.paid", "sub_x"), "s1", supabaseWith(null))).toBe(false);
  });
});
