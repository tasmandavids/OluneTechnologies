import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { isoDate, planInvoiceReconcile } from "@/lib/xero/inbound-sync";
import { verifyXeroSignature } from "@/lib/xero/webhook-verify";

describe("planInvoiceReconcile", () => {
  it("promotes a local draft to sent when authorised in Xero, capturing final numbers", () => {
    const plan = planInvoiceReconcile("draft", "AUTHORISED");
    expect(plan.nextStatus).toBe("sent");
    expect(plan.syncAmount).toBe(true);
    expect(plan.syncDueDate).toBe(true);
    expect(plan.cancelStripe).toBe(false);
  });

  it("follows Xero's amount on an already-sent invoice without re-sending it", () => {
    for (const olune of ["sent", "overdue"] as const) {
      const plan = planInvoiceReconcile(olune, "AUTHORISED");
      expect(plan.nextStatus).toBeNull();
      expect(plan.syncAmount).toBe(true);
      expect(plan.syncDueDate).toBe(true);
      expect(plan.cancelStripe).toBe(false);
    }
  });

  it("marks paid and cancels the Stripe link when paid in Xero", () => {
    const plan = planInvoiceReconcile("sent", "PAID");
    expect(plan.nextStatus).toBe("paid");
    expect(plan.cancelStripe).toBe(true);
  });

  it("marks void and cancels the Stripe link when voided or deleted in Xero", () => {
    for (const xero of ["VOIDED", "DELETED"] as const) {
      const plan = planInvoiceReconcile("sent", xero);
      expect(plan.nextStatus).toBe("void");
      expect(plan.cancelStripe).toBe(true);
    }
  });

  it("syncs amount + due date on a two-sided draft without changing status", () => {
    const plan = planInvoiceReconcile("draft", "DRAFT");
    expect(plan.nextStatus).toBeNull();
    expect(plan.syncAmount).toBe(true);
    expect(plan.syncDueDate).toBe(true);
  });

  it("never drags a locked local invoice backwards", () => {
    for (const olune of ["paid", "refunded", "void"] as const) {
      for (const xero of ["DRAFT", "AUTHORISED", "PAID", "VOIDED"] as const) {
        const plan = planInvoiceReconcile(olune, xero);
        expect(plan.nextStatus).toBeNull();
        expect(plan.cancelStripe).toBe(false);
        expect(plan.syncAmount).toBe(false);
        expect(plan.syncDueDate).toBe(false);
      }
    }
  });

  it("ignores a submitted/draft echo once the invoice has been sent", () => {
    expect(planInvoiceReconcile("sent", "SUBMITTED").nextStatus).toBeNull();
    expect(planInvoiceReconcile("overdue", "DRAFT").syncAmount).toBe(false);
  });
});

describe("isoDate", () => {
  // xero-node's Invoice type declares date/dueDate/fullyPaidOnDate as
  // `string`, but its own deserializer actually hands us a real `Date`
  // instance for these fields at runtime (see models.js deserializeDateFormats).
  // Trusting the declared type here is exactly what broke reconcile in
  // production: `Date.prototype.slice` doesn't exist, so every invoice threw
  // before any Supabase write ran.
  it("formats a Date instance (the real runtime shape from xero-node)", () => {
    expect(isoDate(new Date("2026-07-12T00:00:00.000Z"))).toBe("2026-07-12");
  });

  it("returns null for an invalid Date instance instead of throwing", () => {
    expect(isoDate(new Date("not-a-real-date"))).toBeNull();
  });

  it("still handles a plain ISO date string", () => {
    expect(isoDate("2026-07-12T00:00:00")).toBe("2026-07-12");
  });

  it("still handles the raw /Date(ms)/ wire format as a string fallback", () => {
    expect(isoDate("/Date(1783814400000+0000)/")).toBe("2026-07-12");
  });

  it("returns null for null/undefined/empty input", () => {
    expect(isoDate(null)).toBeNull();
    expect(isoDate(undefined)).toBeNull();
    expect(isoDate("")).toBeNull();
  });
});

describe("verifyXeroSignature", () => {
  const key = "test-signing-key";
  const body = '{"events":[],"lastEventSequence":0}';
  const validSig = createHmac("sha256", key).update(body, "utf8").digest("base64");

  it("accepts a correctly signed body", () => {
    expect(verifyXeroSignature(body, validSig, key)).toBe(true);
  });

  it("rejects a tampered body", () => {
    expect(verifyXeroSignature(body + " ", validSig, key)).toBe(false);
  });

  it("rejects a wrong or missing signature without throwing", () => {
    expect(verifyXeroSignature(body, "not-a-real-signature", key)).toBe(false);
    expect(verifyXeroSignature(body, null, key)).toBe(false);
    expect(verifyXeroSignature(body, "", key)).toBe(false);
  });
});
