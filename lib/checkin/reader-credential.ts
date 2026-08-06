// ============================================================================
//  lib/checkin/reader-credential.ts
//
//  Manages the studio's single shared NFC-reader credential, stored as a
//  public.studio_integrations row (provider = 'nfc_reader') rather than a new
//  table — see the 0103 migration header for why. One credential per studio
//  for v1: every kiosk/reader device at that studio's entrance shares it.
// ============================================================================

import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptIntegrationSecrets, encryptIntegrationSecrets, secretTail } from "@/lib/integrations/crypto";

export const NFC_READER_PROVIDER = "nfc_reader";

export type ReaderCredential = {
  readerKey: string;
  /** Shown once at issuance/rotation time — never retrievable again after this. */
  readerSecret: string;
};

function generateReaderKey(): string {
  return `rdr_${randomBytes(10).toString("hex")}`;
}

function generateReaderSecret(): string {
  return randomBytes(32).toString("hex");
}

/** Creates (or rotates) the studio's NFC reader credential. */
export async function issueReaderCredential(
  supabase: SupabaseClient,
  studioId: string,
  connectedBy: string,
): Promise<ReaderCredential> {
  const readerKey = generateReaderKey();
  const readerSecret = generateReaderSecret();

  const { error } = await supabase.from("studio_integrations").upsert(
    {
      studio_id: studioId,
      provider: NFC_READER_PROVIDER,
      status: "connected",
      display_name: "NFC door reader",
      external_account_id: readerKey,
      credentials_encrypted: encryptIntegrationSecrets({ secret: readerSecret }),
      last_verified_at: new Date().toISOString(),
      last_error: null,
      connected_by: connectedBy,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "studio_id,provider" },
  );

  if (error) throw new Error(error.message);

  return { readerKey, readerSecret };
}

export type ReaderCredentialStatus = {
  connected: boolean;
  readerKey: string | null;
  secretTail: string | null;
  lastVerifiedAt: string | null;
};

/** Read-only status for the admin UI — the secret itself is never returned. */
export async function getReaderCredentialStatus(
  supabase: SupabaseClient,
  studioId: string,
): Promise<ReaderCredentialStatus> {
  const { data } = await supabase
    .from("studio_integrations")
    .select("external_account_id, credentials_encrypted, last_verified_at")
    .eq("studio_id", studioId)
    .eq("provider", NFC_READER_PROVIDER)
    .maybeSingle();

  if (!data) return { connected: false, readerKey: null, secretTail: null, lastVerifiedAt: null };

  let tail: string | null = null;
  if (data.credentials_encrypted) {
    try {
      const secrets = decryptIntegrationSecrets(data.credentials_encrypted);
      tail = secrets.secret ? secretTail(secrets.secret) : null;
    } catch {
      tail = null;
    }
  }

  return {
    connected: true,
    readerKey: data.external_account_id,
    secretTail: tail,
    lastVerifiedAt: data.last_verified_at,
  };
}
