#!/usr/bin/env node
// ============================================================================
//  Create Olune's own subscription Products and Prices in Stripe, then record
//  the Price ids in platform_plan_prices.
//
//  This is the missing half of migration 0119. The catalogue (what each tier
//  costs and unlocks) lives in lib/plans/catalog.ts, but Stripe issues a
//  DIFFERENT Price id for the same plan in test mode and in live mode, so the
//  ids cannot be a constant in the repo — 0119 puts them in a table instead and
//  leaves the table empty. Until something fills it, resolvePriceId() returns
//  null for all six plan/interval pairs and /api/plans/checkout answers 503.
//  This is that something.
//
//  Idempotent. Products are matched on metadata.olune_plan and Prices on
//  lookup_key, so re-running finds what it made last time rather than stacking
//  up duplicates — which matters because a duplicate Price is invisible in the
//  API but very visible on a customer's card.
//
//  Usage:
//    STRIPE_SECRET_KEY=sk_test_... node scripts/setup-plan-prices.mjs
//    node --env-file=.env.local scripts/setup-plan-prices.mjs --write-db
//
//  Flags:
//    --write-db   Also upsert platform_plan_prices. Needs NEXT_PUBLIC_SUPABASE_URL
//                 and SUPABASE_SERVICE_ROLE_KEY. Off by default: creating Stripe
//                 objects is harmless, but pointing a database at price ids from
//                 the wrong mode breaks checkout in a way that reads as a Stripe
//                 outage rather than a config mistake.
//    --live       Required acknowledgement when STRIPE_SECRET_KEY is a live key.
//    --dry-run    Print what would be created; touch nothing.
//
//  The constants below are exported and the body only runs when this file is
//  executed directly, so tests/plan-price-script.test.ts can import the pricing
//  table without the script trying to talk to Stripe.
// ============================================================================

import Stripe from "stripe";
import { pathToFileURL } from "node:url";

/**
 * The plans, as Stripe needs them.
 *
 * Duplicated from lib/plans/catalog.ts rather than imported, because that file
 * is TypeScript and this script is plain ESM run by node directly. The
 * duplication is guarded: tests/plan-price-script.test.ts imports both and
 * fails if a price here ever drifts from the catalogue, so a price change in
 * one place cannot silently fail to reach Stripe.
 */
export const PLAN_PRICING = [
  {
    key: "solo",
    name: "Olune Solo",
    description: "For the one-person studio. Classes, rolls, attendance and fees.",
    monthlyCents: 2900,
    annualCents: 29000,
  },
  {
    key: "studio",
    name: "Olune Studio",
    description: "For a team. Adds staff, leads, enrolment forms, your site and shop.",
    monthlyCents: 5900,
    annualCents: 59000,
  },
  {
    key: "scale",
    name: "Olune Scale",
    description: "Every module Olune has, including production, costumes and competitions.",
    monthlyCents: 12000,
    annualCents: 120000,
  },
];

export const CURRENCY = "nzd";

/** Stable, human-readable handle for a Price. Also what makes this idempotent. */
export function lookupKey(planKey, interval) {
  return `olune_${planKey}_${interval}`;
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const WRITE_DB = args.has("--write-db");
  const DRY_RUN = args.has("--dry-run");

  const sk = process.env.STRIPE_SECRET_KEY?.trim();
  if (!sk) {
    console.error("STRIPE_SECRET_KEY is not set.");
    process.exit(1);
  }

  const isLive = sk.startsWith("sk_live_");
  if (isLive && !args.has("--live")) {
    console.error(
      "Refusing to run: STRIPE_SECRET_KEY is a LIVE key.\n" +
        "Live Prices are what real studios get charged against, and a duplicate\n" +
        "created by a careless re-run is hard to notice and awkward to unwind.\n" +
        "Re-run with --live if that is genuinely what you want.",
    );
    process.exit(1);
  }

  const stripe = new Stripe(sk, { apiVersion: "2026-05-27.dahlia" });

  const account = await stripe.accounts.retrieve();
  const accountName = account.settings?.dashboard?.display_name ?? account.id;

  console.log(`Stripe account : ${account.id} — ${accountName}`);
  console.log(`Mode           : ${isLive ? "LIVE" : "test"}`);
  console.log(`Currency       : ${CURRENCY.toUpperCase()}, tax_behavior=inclusive (NZ GST convention)`);
  console.log(`Write to DB    : ${WRITE_DB ? "yes" : "no (pass --write-db)"}`);
  console.log(DRY_RUN ? "DRY RUN        : nothing will be created\n" : "");

  /** The Price for this plan+interval, if we have already made one. */
  async function findPrice(plan, interval) {
    const found = await stripe.prices.list({
      lookup_keys: [lookupKey(plan.key, interval)],
      limit: 1,
      active: true,
    });
    return found.data[0] ?? null;
  }

  /**
   * The Product for this plan, creating it only if nothing points at one yet.
   *
   * Nothing here consults `products.search`, deliberately. That index lags
   * writes by up to a minute, and both lookups below are strongly consistent:
   *
   *   1. the Product the existing Prices already point at — Prices are found by
   *      lookup_key via `prices.list`, which reads the primary store;
   *   2. failing that, a Product created under a DETERMINISTIC id, retrieved
   *      by that id.
   *
   * The search-first version of this cost us twice on the same day: a re-run
   * inside the lag window created a duplicate product per plan in the sandbox,
   * and then — after an explicit poll showed the index had caught up — a
   * duplicate "Olune Studio" on the live account anyway, because the index went
   * stale again between the check and the run. An index you have to poll is not
   * a lookup you can build idempotency on.
   *
   * Products that predate this (created by hand, or by the search-era script)
   * keep their random ids and are found by path 1, which is why that path
   * stays first rather than being replaced.
   */
  function deterministicProductId(planKey) {
    return `olune_plan_${planKey}`;
  }

  async function ensureProduct(plan, existingPrices) {
    const anchor = existingPrices.find(Boolean);
    if (anchor) {
      const id = typeof anchor.product === "string" ? anchor.product : anchor.product.id;
      return { product: { id }, created: false };
    }

    const id = deterministicProductId(plan.key);
    try {
      const product = await stripe.products.retrieve(id);
      return { product, created: false };
    } catch (e) {
      if (e?.code !== "resource_missing") throw e;
    }

    if (DRY_RUN) return { product: { id: `(new) ${id}` }, created: true };

    const product = await stripe.products.create({
      id,
      name: plan.name,
      description: plan.description,
      metadata: { olune_plan: plan.key },
    });
    return { product, created: true };
  }

  /** Reuse the Price we already found for this plan+interval, or make it. */
  async function ensurePrice(plan, productId, interval, unitAmount, existing) {
    const key = lookupKey(plan.key, interval);

    if (existing) {
      const price = existing;
      // A price whose amount no longer matches the catalogue is a real problem —
      // Stripe Prices are immutable, so this cannot be repaired by an update and
      // needs a deliberate new Price plus a migration of anyone already on it.
      if (price.unit_amount !== unitAmount) {
        console.warn(
          `  ! ${key} exists at ${price.unit_amount} but the catalogue says ${unitAmount}.\n` +
            `    Stripe Prices are immutable. Create a new one and migrate subscribers deliberately.`,
        );
      }
      return { price, created: false };
    }

    if (DRY_RUN) {
      return { price: { id: `(new) price_${key}`, unit_amount: unitAmount }, created: true };
    }

    const price = await stripe.prices.create({
      product: productId,
      currency: CURRENCY,
      unit_amount: unitAmount,
      recurring: { interval },
      // NZ retail convention, and what /pricing already tells studios: the number
      // they see is the number they pay, GST included.
      tax_behavior: "inclusive",
      lookup_key: key,
      metadata: { olune_plan: plan.key, olune_interval: interval },
    });
    return { price, created: true };
  }

  const rows = [];

  for (const plan of PLAN_PRICING) {
    const intervals = [
      ["month", plan.monthlyCents],
      ["year", plan.annualCents],
    ];

    // Looked up before the product, so the product can be resolved from
    // whichever price already exists rather than from the lagging search index.
    const existingPrices = await Promise.all(intervals.map(([i]) => findPrice(plan, i)));

    const { product, created: productCreated } = await ensureProduct(plan, existingPrices);
    console.log(`${plan.name}  ${product.id}${productCreated ? "  (created)" : "  (existing)"}`);

    for (const [idx, [interval, cents]] of intervals.entries()) {
      const { price, created } = await ensurePrice(
        plan,
        product.id,
        interval,
        cents,
        existingPrices[idx],
      );
      const dollars = (cents / 100).toFixed(2);
      console.log(
        `  ${interval.padEnd(5)} $${dollars.padStart(8)} ${CURRENCY.toUpperCase()}  ` +
          `${price.id}${created ? "  (created)" : "  (existing)"}`,
      );
      rows.push({
        plan_key: plan.key,
        billing_interval: interval,
        stripe_price_id: price.id,
        active: true,
      });
    }
  }

  if (!WRITE_DB) {
    console.log("\nStripe is set up. platform_plan_prices NOT written (no --write-db).");
    console.log("Run again with --write-db once this account is the one production uses.");
    return;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error("\n--write-db needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }

  if (DRY_RUN) {
    console.log("\nDRY RUN — would upsert:");
    console.log(JSON.stringify(rows, null, 2));
    return;
  }

  const res = await fetch(`${supabaseUrl}/rest/v1/platform_plan_prices`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify(rows),
  });

  if (!res.ok) {
    console.error(`\nplatform_plan_prices upsert failed: ${res.status} ${await res.text()}`);
    process.exit(1);
  }

  console.log(`\nplatform_plan_prices: ${rows.length} rows upserted against ${supabaseUrl}.`);
  console.log("Checkout should now resolve a price for every plan and interval.");
}

// Only when run directly — importing this file must not talk to Stripe.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
