import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { signWebhookPayload } from "@/lib/integrations/events";

// The signature is a published contract: a studio reimplements it on its own
// endpoint to verify that a request came from us. These tests pin the exact
// format, because changing it silently breaks every receiver in the field.
describe("signWebhookPayload", () => {
  const secret = "whsec_test_do_not_use";
  const timestamp = "1786000000";
  const body = JSON.stringify({ type: "enrolment.created", data: { classId: "abc" } });

  it("is a sha256-prefixed HMAC over `<timestamp>.<body>`", () => {
    const expected = createHmac("sha256", secret)
      .update(`${timestamp}.${body}`)
      .digest("hex");

    expect(signWebhookPayload(secret, timestamp, body)).toBe(`sha256=${expected}`);
  });

  it("changes when the body changes", () => {
    const other = JSON.stringify({ type: "enrolment.cancelled", data: { classId: "abc" } });
    expect(signWebhookPayload(secret, timestamp, other)).not.toBe(
      signWebhookPayload(secret, timestamp, body),
    );
  });

  it("changes when the timestamp changes — this is what blocks a replay", () => {
    // Same body, different timestamp. If the timestamp were outside the signed
    // string an attacker could resend a captured payload with a fresh header
    // and it would still verify.
    expect(signWebhookPayload(secret, "1786009999", body)).not.toBe(
      signWebhookPayload(secret, timestamp, body),
    );
  });

  it("changes when the secret changes", () => {
    expect(signWebhookPayload("whsec_other", timestamp, body)).not.toBe(
      signWebhookPayload(secret, timestamp, body),
    );
  });
});
