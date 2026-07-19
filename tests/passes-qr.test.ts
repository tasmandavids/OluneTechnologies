import { describe, expect, it } from "vitest";
import { buildClassPassQrPayload, parseClassPassQrPayload } from "@/lib/passes/qr";

describe("class-pass QR payloads", () => {
  it("builds a scanner-compatible purchase payload", () => {
    const raw = buildClassPassQrPayload({
      passId: "pass_123",
      qrToken: "token_123",
      studentId: "student_123",
      issuedAt: "2026-07-19T10:00:00.000Z",
    });

    expect(JSON.parse(raw)).toEqual({
      kind: "class_pass",
      pass_id: "pass_123",
      qr_token: "token_123",
      student_id: "student_123",
      issued_at: "2026-07-19T10:00:00.000Z",
    });
    expect(parseClassPassQrPayload(raw)).toEqual({
      passId: "pass_123",
      qrToken: "token_123",
    });
  });

  it("parses the minimal class-pass QR payload scanned at the front desk", () => {
    expect(
      parseClassPassQrPayload(
        JSON.stringify({ kind: "class_pass", pass_id: "pass_123", qr_token: "token_123" }),
      ),
    ).toEqual({ passId: "pass_123", qrToken: "token_123" });
  });

  it("rejects malformed, incomplete, or wrong-kind payloads", () => {
    expect(parseClassPassQrPayload("not-json")).toBeNull();
    expect(
      parseClassPassQrPayload(
        JSON.stringify({ kind: "event_ticket", pass_id: "pass_123", qr_token: "t" }),
      ),
    ).toBeNull();
    expect(parseClassPassQrPayload(JSON.stringify({ kind: "class_pass", qr_token: "t" }))).toBeNull();
    expect(
      parseClassPassQrPayload(JSON.stringify({ kind: "class_pass", pass_id: "pass_123" })),
    ).toBeNull();
  });
});
