// ============================================================================
//  lib/events/ticket-scan.ts
//
//  PURE parsing for the recital door scanner — no IO, fully unit-testable.
//
//  This is the boundary between "a picture the ticket holder is carrying" and
//  our API, so it is deliberately narrow: it extracts identifiers and nothing
//  else. Party size, status and event details are read from the ticket row by
//  the scan endpoint, because everything in a QR payload is under the holder's
//  control and none of it is evidence.
// ============================================================================

export type DecodedTicket = {
  eventId: string;
  /** The per-ticket secret minted at purchase (migration 0112). */
  qrToken?: string;
  /** Legacy identifier, for tickets issued before qr_token existed. */
  userId?: string;
};

/**
 * Read a ticket out of a scanned payload, or null if this isn't one of ours.
 *
 * Accepts two shapes:
 *   • current — { kind: "event_ticket", event_id, qr_token, … }
 *   • legacy  — { event_id, user_id, … }, issued before check-in existed
 *
 * A token always wins over a user id: it's the only field that proves the code
 * came from us, so a payload carrying both is treated as the stronger form.
 *
 * Never throws — the camera feeds it arbitrary strings (a URL on a poster, a
 * class-pass QR, a supermarket barcode) many times a second.
 */
export function parseTicketPayload(raw: string): DecodedTicket | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof data !== "object" || data === null) return null;
  const payload = data as Record<string, unknown>;

  const eventId = typeof payload.event_id === "string" ? payload.event_id : null;
  if (!eventId) return null;

  // A class pass is a different payload arriving on the same camera. It has no
  // event_id so it can't reach here, but be explicit rather than incidental.
  if (typeof payload.kind === "string" && payload.kind !== "event_ticket") return null;

  const qrToken = typeof payload.qr_token === "string" ? payload.qr_token : null;
  if (qrToken) return { eventId, qrToken };

  const userId = typeof payload.user_id === "string" ? payload.user_id : null;
  if (userId) return { eventId, userId };

  return null;
}
