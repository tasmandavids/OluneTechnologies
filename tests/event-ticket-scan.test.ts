import { describe, it, expect } from "vitest";
import { parseTicketPayload } from "@/lib/events/ticket-scan";

// ============================================================================
//  The parser is the boundary between "a picture the holder is carrying" and
//  our API. It must extract identifiers and nothing else — in particular it
//  must never surface a quantity, because the holder controls the payload and
//  the server reads party size from the ticket row.
// ============================================================================

describe("parseTicketPayload", () => {
  it("reads a current ticket", () => {
    const raw = JSON.stringify({
      kind: "event_ticket",
      event_id: "11111111-1111-1111-1111-111111111111",
      qr_token: "22222222-2222-2222-2222-222222222222",
      quantity: 2,
    });
    expect(parseTicketPayload(raw)).toEqual({
      eventId: "11111111-1111-1111-1111-111111111111",
      qrToken: "22222222-2222-2222-2222-222222222222",
    });
  });

  it("does not carry a self-reported quantity through to the API", () => {
    const raw = JSON.stringify({
      kind: "event_ticket",
      event_id: "11111111-1111-1111-1111-111111111111",
      qr_token: "22222222-2222-2222-2222-222222222222",
      quantity: 999,
    });
    expect(parseTicketPayload(raw)).not.toHaveProperty("quantity");
  });

  it("falls back to the legacy user_id shape when no token was minted", () => {
    const raw = JSON.stringify({
      event_id: "11111111-1111-1111-1111-111111111111",
      user_id: "33333333-3333-3333-3333-333333333333",
      quantity: 4,
    });
    expect(parseTicketPayload(raw)).toEqual({
      eventId: "11111111-1111-1111-1111-111111111111",
      userId: "33333333-3333-3333-3333-333333333333",
    });
  });

  it("prefers the token when a payload somehow carries both", () => {
    const raw = JSON.stringify({
      event_id: "11111111-1111-1111-1111-111111111111",
      qr_token: "22222222-2222-2222-2222-222222222222",
      user_id: "33333333-3333-3333-3333-333333333333",
    });
    expect(parseTicketPayload(raw)).toEqual({
      eventId: "11111111-1111-1111-1111-111111111111",
      qrToken: "22222222-2222-2222-2222-222222222222",
    });
  });

  it("rejects a payload with no usable identifier", () => {
    expect(parseTicketPayload(JSON.stringify({ event_id: "x" }))).toBeNull();
    expect(parseTicketPayload(JSON.stringify({ qr_token: "x" }))).toBeNull();
  });

  it("rejects non-ticket QR codes without throwing", () => {
    expect(parseTicketPayload("https://example.com")).toBeNull();
    expect(parseTicketPayload("")).toBeNull();
    expect(parseTicketPayload("{ not json")).toBeNull();
    // A class pass is a different payload on the same camera — must not match.
    expect(
      parseTicketPayload(JSON.stringify({ kind: "class_pass", pass_id: "a", qr_token: "b" })),
    ).toBeNull();
  });
});
