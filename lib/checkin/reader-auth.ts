// ============================================================================
//  lib/checkin/reader-auth.ts
//
//  Verifies a tap request from a physical reader device — mirrors
//  lib/xero/webhook-verify.ts's shared-secret / timingSafeEqual pattern,
//  adapted from an HMAC-over-body check to a bearer-style key+secret check
//  (the reader has no per-request signing capability, just two fields typed
//  into its kiosk config once).
// ============================================================================

import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptIntegrationSecrets } from "@/lib/integrations/crypto";
import { NFC_READER_PROVIDER } from "@/lib/checkin/reader-credential";

export type VerifiedReader = { studioId: string; readerKey: string };

/**
 * Fails closed: a missing header, unknown reader key, disconnected/error
 * status, or secret mismatch all return null with no distinction — the tap
 * route should return a flat 401 either way.
 */
export async function verifyReaderCredential(
  readerKey: string | null,
  readerSecret: string | null,
): Promise<VerifiedReader | null> {
  if (!readerKey || !readerSecret) return null;

  const admin = createAdminClient();
  const { data } = await admin
    .from("studio_integrations")
    .select("studio_id, credentials_encrypted, status")
    .eq("provider", NFC_READER_PROVIDER)
    .eq("external_account_id", readerKey)
    .maybeSingle();

  if (!data || data.status !== "connected" || !data.credentials_encrypted) return null;

  let stored: string;
  try {
    stored = decryptIntegrationSecrets(data.credentials_encrypted).secret ?? "";
  } catch {
    return null;
  }
  if (!stored) return null;

  const provided = Buffer.from(readerSecret, "utf8");
  const expected = Buffer.from(stored, "utf8");
  // timingSafeEqual throws on length mismatch — guard so a wrong-length
  // secret fails closed rather than 500ing (same guard as verifyXeroSignature).
  if (provided.length !== expected.length) return null;
  if (!timingSafeEqual(provided, expected)) return null;

  return { studioId: data.studio_id, readerKey };
}
