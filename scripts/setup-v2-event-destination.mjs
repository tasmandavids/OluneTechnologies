#!/usr/bin/env node
// ============================================================================
//  Register (or re-point) the Stripe Event Destination that feeds
//  /api/webhooks/stripe-v2.
//
//  Why a script rather than the dashboard: studio accounts are Accounts v2, and
//  v2 event names cannot be added to a classic webhook endpoint — Stripe
//  rejects them. They are delivered to an Event Destination, which at the time
//  of writing has no dashboard UI for `events_from: ["@accounts"]`, the setting
//  that makes connected-account events arrive at all. Get that wrong and the
//  destination looks healthy while never delivering a single studio event.
//
//  Idempotent: matched on metadata.olune_destination, so re-running updates the
//  existing destination rather than creating a second one. Two destinations on
//  the same events would double-deliver — harmless (the stripe_events ledger
//  dedupes) but confusing to debug.
//
//  Usage:
//    node --env-file=.env.local scripts/setup-v2-event-destination.mjs \
//      --url https://www.olune.co.nz/api/webhooks/stripe-v2
//
//  Flags:
//    --url <url>  Required. The endpoint to deliver to. Must be https.
//    --live       Required acknowledgement when STRIPE_SECRET_KEY is a live key.
//    --dry-run    Print what would change; touch nothing.
//    --ping       After create/update, send a test ping through the destination.
//
//  On create, the signing secret is printed ONCE — Stripe will not show it
//  again. Put it in STRIPE_V2_WEBHOOK_SECRET for the matching environment.
//  Updating an existing destination does NOT rotate the secret, so a re-run to
//  change the URL leaves the deployed value working.
//
//  The constants are exported and the body only runs when this file is executed
//  directly, so tests/stripe-v2-event-destination.test.ts can check the event
//  list against lib/webhooks/process-stripe-v2-event.ts without talking to
//  Stripe.
// ============================================================================

import Stripe from "stripe";
import { pathToFileURL } from "node:url";

/**
 * Must stay identical to V2_DESTINATION_EVENT_TYPES in
 * lib/webhooks/process-stripe-v2-event.ts. Subscribing to an event the handler
 * ignores is only noise; handling an event the destination never sends is a
 * silent dead branch, which is the failure this pairing exists to prevent.
 * tests/stripe-v2-event-destination.test.ts asserts the two lists match.
 */
export const DESTINATION_EVENT_TYPES = [
  "v2.core.account.updated",
  "v2.core.account.closed",
  "v2.core.account[configuration.merchant].updated",
  "v2.core.account[configuration.merchant].capability_status_updated",
  "v2.core.account[requirements].updated",
  "v2.core.event_destination.ping",
];

/** Tag used to find our own destination on a re-run. */
export const DESTINATION_MARKER = "connect-account-status";

export const DESTINATION_NAME = "Olune — studio Connect account status";

/**
 * `@accounts` is the setting that matters. Without it the destination receives
 * only events from the platform account itself (`@self`) — i.e. none of the
 * studio account events this whole endpoint exists for.
 */
export const DESTINATION_PARAMS = {
  name: DESTINATION_NAME,
  description:
    "Accounts v2 status changes for studio Connect accounts. Consumed by /api/webhooks/stripe-v2.",
  enabled_events: DESTINATION_EVENT_TYPES,
  event_payload: "thin",
  events_from: ["@accounts"],
  type: "webhook_endpoint",
  metadata: { olune_destination: DESTINATION_MARKER },
};

function parseArgs(argv) {
  const args = { url: null, live: false, dryRun: false, ping: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--url") args.url = argv[++i] ?? null;
    else if (arg === "--live") args.live = true;
    else if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--ping") args.ping = true;
  }
  return args;
}

async function findExisting(stripe) {
  const res = await stripe.v2.core.eventDestinations.list({ limit: 100 });
  return (
    res.data.find((d) => d.metadata?.olune_destination === DESTINATION_MARKER) ?? null
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const key = process.env.STRIPE_SECRET_KEY;

  if (!key) {
    console.error("STRIPE_SECRET_KEY is not set.");
    process.exit(1);
  }
  if (!args.url) {
    console.error("--url is required, e.g. --url https://www.olune.co.nz/api/webhooks/stripe-v2");
    process.exit(1);
  }
  if (!args.url.startsWith("https://")) {
    // Stripe refuses plain http anyway; failing here says why.
    console.error("--url must be https.");
    process.exit(1);
  }
  if (key.startsWith("sk_live_") && !args.live && !args.dryRun) {
    console.error(
      "STRIPE_SECRET_KEY is a LIVE key. Re-run with --live to confirm you mean the live account.",
    );
    process.exit(1);
  }

  const stripe = new Stripe(key, { apiVersion: "2026-05-27.dahlia" });

  // Which account are we actually about to change? The cutover left more than
  // one Olune-adjacent key in circulation, so print it before doing anything.
  const account = await stripe.accounts.retrieve();
  const mode = key.startsWith("sk_live_") ? "LIVE" : "test";
  console.log(
    `Account: ${account.id} (${account.business_profile?.name ?? "unnamed"}) — ${mode} mode`,
  );

  const existing = await findExisting(stripe);

  if (args.dryRun) {
    console.log(existing ? `Would UPDATE ${existing.id}` : "Would CREATE a new destination");
    console.log(JSON.stringify({ ...DESTINATION_PARAMS, webhook_endpoint: { url: args.url } }, null, 2));
    return;
  }

  let destination;
  if (existing) {
    destination = await stripe.v2.core.eventDestinations.update(existing.id, {
      name: DESTINATION_PARAMS.name,
      description: DESTINATION_PARAMS.description,
      enabled_events: DESTINATION_EVENT_TYPES,
      metadata: DESTINATION_PARAMS.metadata,
      webhook_endpoint: { url: args.url },
    });
    console.log(`Updated ${destination.id} → ${args.url}`);
    console.log("Signing secret unchanged — STRIPE_V2_WEBHOOK_SECRET stays as it is.");
  } else {
    destination = await stripe.v2.core.eventDestinations.create({
      ...DESTINATION_PARAMS,
      webhook_endpoint: { url: args.url },
      include: ["webhook_endpoint.signing_secret"],
    });
    console.log(`Created ${destination.id} → ${args.url}`);
    const secret = destination.webhook_endpoint?.signing_secret;
    console.log("");
    console.log("  STRIPE_V2_WEBHOOK_SECRET=" + (secret ?? "<not returned — check the dashboard>"));
    console.log("");
    console.log("Shown once. Set it for the matching Vercel environment before the next deploy.");
  }

  if (destination.status !== "enabled") {
    await stripe.v2.core.eventDestinations.enable(destination.id);
    console.log("Enabled the destination.");
  }

  if (args.ping) {
    await stripe.v2.core.eventDestinations.ping(destination.id);
    console.log("Ping sent — expect a v2.core.event_destination.ping in the route's logs.");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
