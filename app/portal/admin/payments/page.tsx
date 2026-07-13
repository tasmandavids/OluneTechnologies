// ============================================================================
//  /portal/admin/payments — Stripe Connect status for this studio.
//
//  Each studio connects its own Stripe Express account so payments settle
//  directly to their own bank instead of pooling in Olune's platform
//  account. Mirrors /portal/admin/accounting's connect/status/disconnect
//  shape for the Xero integration.
// ============================================================================

export const dynamic = "force-dynamic";

import { requirePortalSession } from "@/lib/portal/session";
import { loadStudioStripeAccount } from "@/lib/stripe/connect";
import { PaymentsSettings } from "@/components/admin/payments/PaymentsSettings";

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; connected?: string }>;
}) {
  const { supabase, studioId } = await requirePortalSession();
  const account = await loadStudioStripeAccount(supabase, studioId);
  const params = await searchParams;

  return (
    <PaymentsSettings
      account={account}
      bannerError={params.error ?? null}
      bannerConnected={params.connected === "1"}
      bannerIncomplete={params.connected === "0"}
    />
  );
}
