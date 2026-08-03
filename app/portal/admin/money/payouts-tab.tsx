// ============================================================================
//  Payouts tab — balance + recent Stripe payouts for the studio's own
//  connected account. Nothing here is fabricated: if Stripe isn't connected
//  yet, we show the connect prompt, not placeholder numbers.
// ============================================================================

import { requirePortalSession } from "@/lib/portal/session";
import {
  isChargeable,
  listStripePayouts,
  loadStripeBalance,
  loadStudioStripeAccount,
} from "@/lib/stripe/connect";
import { PayoutsDashboard } from "@/components/admin/money/PayoutsDashboard";

export async function PayoutsTab({
  bannerError,
  bannerConnected,
  bannerIncomplete,
}: {
  bannerError: string | null;
  bannerConnected: boolean;
  bannerIncomplete: boolean;
}) {
  const { supabase, studioId } = await requirePortalSession();
  const account = await loadStudioStripeAccount(supabase, studioId);

  const banners = { bannerError, bannerConnected, bannerIncomplete };

  if (!isChargeable(account)) {
    return <PayoutsDashboard account={account} balance={null} payouts={[]} fetchError={null} {...banners} />;
  }

  try {
    const [balance, payouts] = await Promise.all([
      loadStripeBalance(account!.stripe_account_id),
      listStripePayouts(account!.stripe_account_id, 20),
    ]);
    return (
      <PayoutsDashboard account={account} balance={balance} payouts={payouts} fetchError={null} {...banners} />
    );
  } catch (err) {
    return (
      <PayoutsDashboard
        account={account}
        balance={null}
        payouts={[]}
        fetchError={err instanceof Error ? err.message : "Could not load payout data from Stripe."}
        {...banners}
      />
    );
  }
}
