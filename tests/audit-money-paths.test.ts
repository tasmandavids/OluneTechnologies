// Regression guards for the 2026-10-03 audit of payer-side money paths.
// Source-level assertions, matching tests/stripe-v2-event-destination.test.ts:
// these routes need Stripe and a live session to exercise end to end.

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(fileURLToPath(new URL(`../${path}`, import.meta.url)), "utf8");

describe("v1 Stripe webhook retry semantics", () => {
  for (const route of ["app/api/webhooks/stripe/route.ts", "app/api/webhooks/stripe-connect/route.ts"]) {
    const source = read(route);

    it(`${route} does not process an event without its idempotency claim`, () => {
      expect(source).toContain('error: "Event ledger unavailable"');
      expect(source).not.toContain("(continuing)");
    });

    it(`${route} releases the claim when processing fails`, () => {
      expect(source).toMatch(/catch \(err\)[\s\S]*?from\("stripe_events"\)[\s\S]*?\.delete\(\)[\s\S]*?event\.id/);
    });
  }
});

describe("payer payment routes", () => {
  it("create-intent refuses invoices that are not open", () => {
    const source = read("app/api/payments/create-intent/route.ts");
    expect(source).toContain('new Set(["sent", "overdue"])');
    expect(source).toMatch(/PAYABLE_INVOICE_STATUSES\.has\(invoice\.status/);
    expect(source).toMatch(/intent\.status === "succeeded"/);
  });

  it("event purchase validates input and never downgrades a paid ticket", () => {
    const source = read("app/api/events/purchase/route.ts");
    expect(source).toContain("z.number().int().min(1).max(10)");
    expect(source).toMatch(/existingTicket\?\.status === "paid"[\s\S]*?status: 409/);
    expect(source).not.toMatch(/await supabase\s*\.from\("event_tickets"\)/);
  });

  it("shop checkout only accepts positive integer quantities and writes server-side", () => {
    const source = read("app/api/shop/checkout/route.ts");
    expect(source).toContain("qty: z.number().int().min(1)");
    expect(source).not.toMatch(/supabase\s*\.from\("orders"\)/);
    expect(source).not.toMatch(/supabase\.from\("order_items"\)/);
  });

  it("front-desk routes resolve access through getAdminStudio", () => {
    for (const route of [
      "app/api/passes/redeem/route.ts",
      "app/api/passes/classes/route.ts",
      "app/api/events/tickets/scan/route.ts",
    ]) {
      const source = read(route);
      expect(source, route).toContain("await getAdminStudio()");
      expect(source, route).not.toContain('select("role, studio_id")');
    }
  });
});

describe("payer write lock migration", () => {
  const file = readdirSync(fileURLToPath(new URL("../supabase/migrations", import.meta.url))).find((f) =>
    f.endsWith("_lock_payer_money_writes.sql"),
  );
  const sql = read(`supabase/migrations/${file}`);

  it("guards invoice writes by non-admins", () => {
    expect(sql).toContain("create trigger invoices_guard_payer_write");
    expect(sql).toMatch(/before insert or update on public\.invoices/);
    expect(sql).toContain("array['stripe_payment_intent_id']");
  });

  it("makes holder policies read-only", () => {
    expect(sql).toMatch(/create policy "event_tickets_own" on public\.event_tickets\s+for select/);
    expect(sql).toMatch(/create policy "orders_own" on public\.orders\s+for select/);
    for (const policy of [
      "term_plans_payer_insert",
      "term_plans_payer_update_own",
      "term_plan_invoices_payer_insert",
      "subscriptions_payer_insert",
      "subscriptions_payer_update_own",
    ]) {
      expect(sql).toContain(`drop policy if exists "${policy}"`);
    }
  });
});

describe("ticket re-purchase after a refund (audit D-04)", () => {
  const route = read("app/api/events/purchase/route.ts");
  const sql = read("supabase/migrations/20261021090000_audit_d04_ticket_per_purchase.sql");

  it("only live tickets are unique per buyer, so a refunded row stays as history", () => {
    expect(sql).toMatch(/drop constraint if exists event_tickets_event_id_user_id_key/);
    expect(sql).toMatch(/unique index[\s\S]*?\(event_id, user_id\)[\s\S]*?where status in \('reserved', 'paid'\)/);
  });

  it("the purchase route inserts a new row instead of rewriting a refunded one", () => {
    expect(route).not.toContain("upsert(");
    expect(route).not.toContain('onConflict: "event_id,user_id"');
    expect(route).toMatch(/\.in\("status", \["reserved", "paid"\]\)/);
    expect(route).toMatch(/\.insert\(\{ event_id: event\.id, user_id: user\.id/);
    // Only the buyer's own unpaid reservation is ever updated in place.
    expect(route).toMatch(/\.update\(fields\)[\s\S]*?\.eq\("status", "reserved"\)/);
  });
});
