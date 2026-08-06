"use server";

// ============================================================================
//  Server actions for Settings → Connections.
//
//  One disconnect entry point that dispatches to whichever table actually
//  holds the connection, plus API-key save/clear for the generic table. The UI
//  never needs to know where a provider is stored.
// ============================================================================

import { revalidatePath } from "next/cache";
import { getAdminStudio } from "@/lib/portal/access";
import { getIntegration, isAccountingProviderId } from "@/lib/integrations/catalog";
import { encryptIntegrationSecrets, secretTail } from "@/lib/integrations/crypto";
import { CONNECTIONS_PATH } from "@/lib/integrations/routes";
import { disconnectXero } from "@/app/portal/admin/accounting/actions";

type ActionResult = { ok: true } | { ok: false; error: string };

function revalidateConnections() {
  revalidatePath(CONNECTIONS_PATH);
  revalidatePath("/portal/admin/settings");
}

/**
 * Save (or update) an API-key style connection.
 *
 * Secret fields left blank on an update keep their stored value — the browser
 * never receives the existing secret, so "unchanged" has to mean "empty".
 */
export async function saveApiKeyConnection(input: {
  provider: string;
  values: Record<string, string>;
}): Promise<ActionResult> {
  const provider = getIntegration(input.provider);
  if (!provider) return { ok: false, error: "Unknown integration" };
  if (provider.auth.kind !== "api_key") {
    return { ok: false, error: `${provider.name} isn't connected with API keys` };
  }

  const { error, supabase, studioId, userId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? "Admin access required" };

  const { data: existingRow } = await supabase
    .from("studio_integrations")
    .select("credentials_encrypted, metadata")
    .eq("studio_id", studioId)
    .eq("provider", provider.id)
    .maybeSingle();

  // Non-secret values are readable in the UI, so they live in metadata;
  // secrets go into the encrypted blob and only a 4-char tail is kept for
  // display.
  const secrets: Record<string, string> = {};
  const metadata: Record<string, string> = {};
  const tails: Record<string, string> = {};

  for (const field of provider.auth.fields) {
    const raw = (input.values[field.key] ?? "").trim();

    if (field.type === "secret") {
      if (!raw) {
        const previous = (existingRow?.metadata as Record<string, unknown> | null)?.[
          `${field.key}Tail`
        ];
        if (!previous && !field.optional) {
          return { ok: false, error: `${field.label} is required` };
        }
        // Blank + already stored = leave the existing secret alone.
        continue;
      }
      secrets[field.key] = raw;
      tails[`${field.key}Tail`] = secretTail(raw);
      continue;
    }

    if (!raw) {
      if (!field.optional) return { ok: false, error: `${field.label} is required` };
      continue;
    }
    if (field.type === "url" && !/^https:\/\//i.test(raw)) {
      return { ok: false, error: `${field.label} must be an https:// URL` };
    }
    metadata[field.key] = raw;
  }

  const hasNewSecrets = Object.keys(secrets).length > 0;
  if (!hasNewSecrets && !existingRow) {
    const needsSecret = provider.auth.fields.some((f) => f.type === "secret" && !f.optional);
    if (needsSecret) return { ok: false, error: "Enter the API key to connect" };
  }

  const label =
    metadata.fromNumber ??
    metadata.measurementId ??
    metadata.audienceId ??
    metadata.endpointUrl ??
    metadata.accountSid ??
    Object.values(tails)[0] ??
    ((existingRow?.metadata as Record<string, unknown> | null)?.apiKeyTail as string | undefined) ??
    provider.name;

  const { error: writeError } = await supabase.from("studio_integrations").upsert(
    {
      studio_id: studioId,
      provider: provider.id,
      status: "connected",
      display_name: label,
      credentials_encrypted: hasNewSecrets
        ? encryptIntegrationSecrets(secrets)
        : (existingRow?.credentials_encrypted ?? null),
      metadata: { ...metadata, ...tails },
      last_verified_at: new Date().toISOString(),
      last_error: null,
      connected_by: userId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "studio_id,provider" },
  );

  if (writeError) return { ok: false, error: writeError.message };

  revalidateConnections();
  return { ok: true };
}

/**
 * Disconnect a provider, whichever table it lives in. Stripe is deliberately
 * excluded: deleting the Connect account row would orphan live subscriptions
 * and in-flight payouts, so that one is managed from Stripe itself.
 */
export async function disconnectIntegration(providerId: string): Promise<ActionResult> {
  const provider = getIntegration(providerId);
  if (!provider) return { ok: false, error: "Unknown integration" };

  if (provider.store === "stripe_connect_accounts") {
    return {
      ok: false,
      error:
        "Stripe can't be disconnected here — live subscriptions and payouts depend on it. Manage it from the Stripe dashboard.",
    };
  }

  if (provider.store === "xero_connections") {
    const res = await disconnectXero();
    if (res.ok) revalidateConnections();
    return res;
  }

  const { error, supabase, studioId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? "Admin access required" };

  if (provider.store === "email_accounts") {
    // Provider-level: removes every mailbox on that provider. The inbox's
    // per-account control is the way to drop just one of several.
    const { error: dbErr } = await supabase
      .from("email_accounts")
      .delete()
      .eq("studio_id", studioId)
      .eq("provider", provider.id);
    if (dbErr) return { ok: false, error: dbErr.message };
    revalidatePath("/portal/admin/messages");
  } else if (provider.store === "social_connections") {
    const { error: dbErr } = await supabase
      .from("social_connections")
      .delete()
      .eq("studio_id", studioId)
      .eq("platform", provider.id);
    if (dbErr) return { ok: false, error: dbErr.message };
    revalidatePath("/portal/admin/advertising");
  } else {
    const { error: dbErr } = await supabase
      .from("studio_integrations")
      .delete()
      .eq("studio_id", studioId)
      .eq("provider", provider.id);
    if (dbErr) return { ok: false, error: dbErr.message };
  }

  revalidateConnections();
  return { ok: true };
}

/**
 * Pin which connected ledger is authoritative. Only meaningful once a studio
 * has more than one accounting system connected.
 */
export async function setAccountingProvider(providerId: string): Promise<ActionResult> {
  if (!isAccountingProviderId(providerId)) {
    return { ok: false, error: "Not an accounting provider" };
  }

  const { error, supabase, studioId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? "Admin access required" };

  const { error: dbErr } = await supabase
    .from("studios")
    .update({ accounting_provider: providerId })
    .eq("id", studioId);

  if (dbErr) return { ok: false, error: dbErr.message };

  revalidateConnections();
  revalidatePath("/portal/admin/money");
  return { ok: true };
}
