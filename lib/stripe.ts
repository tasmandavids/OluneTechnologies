// ============================================================================
//  Stripe singleton — server-side only.
//  Import this instead of instantiating Stripe directly in each route.
//  Lazy-init so `next build` succeeds when STRIPE_SECRET_KEY is unset locally;
//  routes throw on first use if the key is still missing at runtime.
// ============================================================================

import Stripe from "stripe";

let client: Stripe | undefined;

function getStripeClient(): Stripe {
  if (!client) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error("Missing STRIPE_SECRET_KEY environment variable.");
    }
    client = new Stripe(key, {
      apiVersion: "2026-05-27.dahlia",
      typescript: true,
    });
  }
  return client;
}

export const stripe: Stripe = new Proxy({} as Stripe, {
  get(_target, prop, receiver) {
    const value = Reflect.get(getStripeClient(), prop, receiver);
    return typeof value === "function" ? value.bind(getStripeClient()) : value;
  },
});

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}
