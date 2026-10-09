import { describe, expect, it } from "vitest";
import { chooseAuthorisedTenant } from "@/lib/xero/client";

const jwt = (claims: object) =>
  `h.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.s`;

describe("chooseAuthorisedTenant (audit D-05)", () => {
  const a = { tenantId: "A", authEventId: "evt-1" };
  const b = { tenantId: "B", authEventId: "evt-2" };

  it("picks the org authorised in this flow, not the first", () => {
    expect(chooseAuthorisedTenant([a, b], jwt({ authentication_event_id: "evt-2" }))).toBe(b);
  });
  it("refuses when several orgs share the event", () => {
    const c = { tenantId: "C", authEventId: "evt-2" };
    expect(chooseAuthorisedTenant([b, c], jwt({ authentication_event_id: "evt-2" }))).toBeUndefined();
  });
  it("refuses an ambiguous choice without an event id", () => {
    expect(chooseAuthorisedTenant([a, b], "opaque")).toBeUndefined();
  });
  it("accepts a lone connection", () => {
    expect(chooseAuthorisedTenant([a], "opaque")).toBe(a);
  });
});
