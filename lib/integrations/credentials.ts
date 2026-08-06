import "server-only";

// ============================================================================
//  Reading back what Settings → Connections stored.
//
//  The connections hub writes credentials (actions.ts) but until now nothing
//  read them, which is why half the catalog said "still being built". This is
//  the single read path: it resolves one studio's connection into the plain
//  values a provider client needs — non-secret fields from `metadata`, secrets
//  decrypted out of `credentials_encrypted`.
//
//  Two entry points, because the callers live on opposite sides of RLS:
//
//    getStudioConnection      — a request with a signed-in admin. Uses whatever
//                               client the caller already has; the admin-only
//                               policy on studio_integrations does the guarding.
//    getStudioConnectionAdmin — cron jobs and webhook handlers, which have no
//                               session at all. Service-role, so it is only
//                               ever called with a studio id the caller already
//                               derived from a trusted row.
//
//  Both fail soft. A missing row, a missing table, an undecryptable blob (key
//  rotated, secret never set) all return null rather than throwing: a broken
//  Mailchimp key must not take down the notification cron.
// ============================================================================

import { createAdminClient } from "@/lib/supabase/admin";
import { decryptIntegrationSecrets } from "./crypto";

/**
 * One studio's connection to one provider, flattened.
 *
 * `values` merges metadata and decrypted secrets under the same field keys the
 * catalog form declared, so a caller reads `values.accountSid` without caring
 * which side of the encryption boundary it was stored on. The `*Tail` display
 * crumbs written by the save action are stripped — they are UI garnish, never
 * credentials.
 */
export type StudioConnection = {
  provider: string;
  status: "connected" | "pending" | "error";
  displayName: string | null;
  externalAccountId: string | null;
  values: Record<string, string>;
  lastVerifiedAt: string | null;
  lastError: string | null;
};

type ConnectionRow = {
  provider: string;
  status: string | null;
  display_name: string | null;
  external_account_id: string | null;
  credentials_encrypted: string | null;
  metadata: Record<string, unknown> | null;
  last_verified_at: string | null;
  last_error: string | null;
};

/** Structural client type — see the note in ./state.ts on why this isn't SupabaseClient. */
type ConnectionQueryClient = { from: (table: string) => unknown };

type SelectBuilder = {
  select: (cols: string) => {
    eq: (col: string, val: string) => {
      eq: (col: string, val: string) => {
        maybeSingle: () => PromiseLike<{ data: unknown; error: unknown }>;
      };
    };
  };
};

const COLUMNS =
  "provider, status, display_name, external_account_id, credentials_encrypted, metadata, last_verified_at, last_error";

function toConnection(row: ConnectionRow): StudioConnection {
  const values: Record<string, string> = {};

  // Non-secret fields. `*Tail` keys are the masked display crumbs the save
  // action keeps for the UI ("•••• a21f") — never pass them to a provider.
  for (const [key, value] of Object.entries(row.metadata ?? {})) {
    if (key.endsWith("Tail")) continue;
    if (typeof value === "string") values[key] = value;
  }

  if (row.credentials_encrypted) {
    try {
      Object.assign(values, decryptIntegrationSecrets(row.credentials_encrypted));
    } catch {
      // Key rotated, or the blob predates a format change. The non-secret
      // fields are still usable; callers that need a secret will find it
      // missing and skip, which is the same as "not connected".
    }
  }

  const status = row.status === "pending" || row.status === "error" ? row.status : "connected";

  return {
    provider: row.provider,
    status,
    displayName: row.display_name,
    externalAccountId: row.external_account_id,
    values,
    lastVerifiedAt: row.last_verified_at,
    lastError: row.last_error,
  };
}

async function readConnection(
  supabase: ConnectionQueryClient,
  studioId: string,
  provider: string,
): Promise<StudioConnection | null> {
  try {
    const { data, error } = await (supabase.from("studio_integrations") as SelectBuilder)
      .select(COLUMNS)
      .eq("studio_id", studioId)
      .eq("provider", provider)
      .maybeSingle();

    if (error || !data) return null;
    return toConnection(data as ConnectionRow);
  } catch {
    return null;
  }
}

/**
 * Read a connection using the caller's own (RLS-bound) client. Returns null
 * unless the caller is an admin of that studio — the policy, not this function,
 * is what enforces it.
 */
export async function getStudioConnection(
  supabase: ConnectionQueryClient,
  studioId: string,
  provider: string,
): Promise<StudioConnection | null> {
  return readConnection(supabase, studioId, provider);
}

/**
 * Read a connection from a context with no signed-in user (cron, webhooks).
 *
 * Service-role, so it bypasses RLS entirely: only ever call this with a
 * `studioId` taken from a row the job already legitimately holds, never from
 * request input.
 */
export async function getStudioConnectionAdmin(
  studioId: string,
  provider: string,
): Promise<StudioConnection | null> {
  let admin: ConnectionQueryClient;
  try {
    admin = createAdminClient() as unknown as ConnectionQueryClient;
  } catch {
    // SUPABASE_SERVICE_ROLE_KEY unset (local dev, preview without secrets).
    return null;
  }
  return readConnection(admin, studioId, provider);
}

/**
 * True when the connection exists and carries every field named. Saves each
 * provider client repeating the same "did they actually fill this in" dance.
 */
export function hasValues(
  connection: StudioConnection | null,
  ...keys: string[]
): connection is StudioConnection {
  if (!connection) return false;
  return keys.every((key) => Boolean(connection.values[key]?.trim()));
}

/**
 * Record the outcome of actually using a connection, so the hub's card can stop
 * claiming "connected" when the key has been revoked. Best-effort and silent:
 * a failed status write must never mask the real error from the caller.
 */
export async function markConnectionResult(
  studioId: string,
  provider: string,
  result: { ok: true } | { ok: false; error: string },
): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin
      .from("studio_integrations")
      .update(
        result.ok
          ? { status: "connected", last_verified_at: new Date().toISOString(), last_error: null }
          : { status: "error", last_error: result.error.slice(0, 500) },
      )
      .eq("studio_id", studioId)
      .eq("provider", provider);
  } catch {
    // Non-fatal by design.
  }
}
