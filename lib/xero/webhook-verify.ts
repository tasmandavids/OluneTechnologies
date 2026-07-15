import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Xero signs every webhook POST with HMAC-SHA256 over the *raw* request body,
 * keyed by the app's webhook signing key, and sends the base64 digest in the
 * `x-xero-signature` header. We must verify this on the untouched body bytes —
 * re-serialising the parsed JSON would change whitespace and break the match.
 *
 * Returning the wrong status here also breaks Xero's "intent to receive"
 * handshake: when you save a webhook, Xero fires test payloads and expects 200
 * for a valid signature and 401 for an invalid one, within 5 seconds.
 */
export function verifyXeroSignature(rawBody: string, signature: string | null, key: string): boolean {
  if (!signature) return false;

  const expected = createHmac("sha256", key).update(rawBody, "utf8").digest("base64");

  const provided = Buffer.from(signature, "utf8");
  const computed = Buffer.from(expected, "utf8");
  // timingSafeEqual throws on length mismatch — guard so a wrong-length header
  // fails closed rather than 500ing.
  if (provided.length !== computed.length) return false;
  return timingSafeEqual(provided, computed);
}
