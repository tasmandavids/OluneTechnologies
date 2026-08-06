// ============================================================================
//  /portal/admin/settings/connections — the studio's connection hub.
//
//  Every OAuth callback in the app now lands here (?connected= / ?error=),
//  and Money / Inbox / Advertising link here instead of carrying their own
//  connect UI.
// ============================================================================

import { redirect } from "next/navigation";
import { getPortalSession } from "@/lib/portal/session";
import { INTEGRATIONS } from "@/lib/integrations/catalog";
import { missingProviderEnv } from "@/lib/integrations/env";
import { loadIntegrationStates } from "@/lib/integrations/state";
import { ConnectionsHub } from "@/components/admin/settings/connections/ConnectionsHub";

export default async function ConnectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const session = await getPortalSession();
  if (!session) redirect("/login?next=/portal/admin/settings/connections");
  if (session.role !== "admin") redirect("/portal/admin");

  const params = await searchParams;
  const { supabase, studioId } = session;

  const states = await loadIntegrationStates(supabase, studioId);

  const missingEnv: Record<string, string[]> = {};
  for (const provider of INTEGRATIONS) {
    const missing = missingProviderEnv(provider);
    if (missing.length > 0) missingEnv[provider.id] = missing;
  }

  // Non-secret stored values for API-key providers, so the dialog can prefill
  // and show "•••• a21f" tails. credentials_encrypted is never selected here.
  const { data: genericRows } = await supabase
    .from("studio_integrations")
    .select("provider, metadata")
    .eq("studio_id", studioId);

  const metadata: Record<string, Record<string, string>> = {};
  for (const row of genericRows ?? []) {
    const raw = (row.metadata ?? {}) as Record<string, unknown>;
    const flat: Record<string, string> = {};
    for (const [key, value] of Object.entries(raw)) {
      if (typeof value === "string") flat[key] = value;
    }
    metadata[row.provider as string] = flat;
  }

  return (
    <ConnectionsHub
      states={states}
      missingEnv={missingEnv}
      metadata={metadata}
      bannerConnected={params.connected ?? null}
      bannerError={params.error ?? null}
    />
  );
}
