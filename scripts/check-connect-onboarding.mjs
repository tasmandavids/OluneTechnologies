#!/usr/bin/env node
// ============================================================================
//  Can a studio actually start Stripe onboarding right now?
//
//  Stripe refuses `v2.core.accounts.create` until the platform's Connect
//  profile questionnaire is complete, and there is no read-only endpoint that
//  reports that state — the only way to know is to try. So this reproduces
//  exactly what app/api/stripe/connect/route.ts does for a brand-new studio,
//  both halves of it:
//
//    1. create the merchant-configured account (where a missing platform
//       profile fails), then
//    2. mint the hosted onboarding link (where an unconfigured redirect or
//       branding setting fails).
//
//  A studio's onboarding breaks if EITHER half does, so testing only the
//  create would give a false pass.
//
//  The account it makes is a throwaway: no studio, no database row, closed
//  again before the script exits. Nothing here touches
//  `stripe_connect_accounts`, so a probe can never be mistaken for a real
//  studio's connection.
//
//  Usage:
//    node --env-file=.env.local scripts/check-connect-onboarding.mjs --live
//    STRIPE_SECRET_KEY=sk_live_... node scripts/check-connect-onboarding.mjs --live
//
//  Flags:
//    --live            Required acknowledgement when STRIPE_SECRET_KEY is a live key.
//    --expect <acct_>  Refuse to run unless the key belongs to this account.
//                      Checked BEFORE anything is created.
//    --keep            Leave the probe account open (to inspect it in the
//                      dashboard). Close it yourself afterwards.
// ============================================================================

import Stripe from "stripe";
import { pathToFileURL } from "node:url";

/**
 * Mirrors app/api/stripe/connect/route.ts. Kept in step with
 * STUDIO_ACCOUNT_DEFAULTS / STUDIO_ACCOUNT_CONFIGURATIONS in
 * lib/stripe/connect.ts — a probe that asks Stripe for a different shape than
 * onboarding does can pass while onboarding still fails.
 */
export const PROBE_ACCOUNT = {
  display_name: "Olune onboarding probe",
  identity: { country: "NZ" },
  dashboard: "full",
  defaults: {
    responsibilities: { fees_collector: "stripe", losses_collector: "stripe" },
    currency: "nzd",
  },
  configuration: {
    merchant: { capabilities: { card_payments: { requested: true } } },
  },
  metadata: { olune_probe: "connect-onboarding-check" },
};

function describeStripeError(err) {
  const parts = [];
  if (err?.type) parts.push(`type=${err.type}`);
  if (err?.code) parts.push(`code=${err.code}`);
  if (err?.raw?.code && err.raw.code !== err.code) parts.push(`raw=${err.raw.code}`);
  return parts.join(" ");
}

async function main() {
  const argv = process.argv.slice(2);
  const live = argv.includes("--live");
  const keep = argv.includes("--keep");
  const expectIdx = argv.indexOf("--expect");
  const expect = expectIdx === -1 ? null : (argv[expectIdx + 1] ?? null);
  const key = process.env.STRIPE_SECRET_KEY;

  if (!key) {
    console.error("STRIPE_SECRET_KEY is not set.");
    process.exit(1);
  }
  if (key.startsWith("sk_live_") && !live) {
    console.error("STRIPE_SECRET_KEY is a LIVE key. Re-run with --live to confirm.");
    process.exit(1);
  }

  const stripe = new Stripe(key, { apiVersion: "2026-05-27.dahlia" });

  // Which platform are we probing? The cutover left more than one Olune-adjacent
  // live key in circulation, and a pass on the wrong account is worse than a
  // failure on the right one.
  const platform = await stripe.accounts.retrieve();
  console.log(
    `Platform: ${platform.id} (${platform.business_profile?.name ?? "unnamed"}) — ` +
      `${key.startsWith("sk_live_") ? "LIVE" : "test"} mode`,
  );
  if (expect && platform.id !== expect) {
    // Stop before creating anything. A probe on the wrong platform is not just
    // uninformative — it makes a real connected account on someone else's live
    // Stripe account.
    console.log("");
    console.error(`Expected ${expect}, but STRIPE_SECRET_KEY belongs to ${platform.id}.`);
    console.error("Nothing was created. Fix the key and re-run.");
    process.exit(1);
  }
  console.log("");

  let account;
  try {
    account = await stripe.v2.core.accounts.create(PROBE_ACCOUNT);
    console.log(`  [1/2] accounts.create        PASS  → ${account.id}`);
  } catch (err) {
    console.log(`  [1/2] accounts.create        FAIL`);
    console.log("");
    console.log(`  ${err instanceof Error ? err.message : err}`);
    const detail = describeStripeError(err);
    if (detail) console.log(`  ${detail}`);
    console.log("");

    // Two very different failures land here and the advice for one is actively
    // misleading for the other. This code means the key's account is not a
    // Connect platform at all — which is a wrong-key problem, not a
    // questionnaire problem, and no amount of dashboard form-filling on the
    // intended platform will change it.
    const code = err?.code ?? err?.raw?.code;
    if (code === "non_connect_platform_accounts_v2_access_blocked") {
      console.log(`  ${platform.id} is not a Connect platform, so this run says NOTHING`);
      console.log("  about whether onboarding works on the account you meant.");
      console.log("");
      console.log("  Check the Platform line above. If it is not the account you intended,");
      console.log("  fix STRIPE_SECRET_KEY (in .env.local for a local run) and try again.");
    } else {
      console.log("  Connect onboarding is still blocked. If the message mentions the");
      console.log("  platform profile, the questionnaire at");
      console.log("  dashboard.stripe.com/connect/accounts/overview is not fully accepted yet");
      console.log("  — saving it and Stripe approving it are two different things.");
    }
    process.exit(2);
  }

  let linkOk = false;
  try {
    const link = await stripe.v2.core.accountLinks.create({
      account: account.id,
      use_case: {
        type: "account_onboarding",
        account_onboarding: {
          configurations: ["merchant"],
          refresh_url: "https://www.olune.co.nz/api/stripe/connect/refresh",
          return_url: "https://www.olune.co.nz/api/stripe/connect/return",
        },
      },
    });
    linkOk = Boolean(link.url);
    console.log(`  [2/2] accountLinks.create    PASS  → ${new URL(link.url).origin}`);
  } catch (err) {
    console.log(`  [2/2] accountLinks.create    FAIL`);
    console.log("");
    console.log(`  ${err instanceof Error ? err.message : err}`);
    const detail = describeStripeError(err);
    if (detail) console.log(`  ${detail}`);
  }

  if (keep) {
    console.log("");
    console.log(`Left ${account.id} open (--keep). Close it in the dashboard when done.`);
  } else {
    try {
      await stripe.v2.core.accounts.close(account.id, {
        applied_configurations: ["merchant"],
      });
      console.log(`  cleanup: closed ${account.id}`);
    } catch (err) {
      console.log("");
      console.log(
        `  cleanup FAILED for ${account.id} — close it by hand in the dashboard: ` +
          `${err instanceof Error ? err.message : err}`,
      );
    }
  }

  console.log("");
  console.log(
    linkOk
      ? "Connect onboarding is working — a studio can register now."
      : "Account creation works, but the onboarding link does not. Studios still cannot finish.",
  );
  process.exit(linkOk ? 0 : 2);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
