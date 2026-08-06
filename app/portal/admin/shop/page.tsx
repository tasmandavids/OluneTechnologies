// ============================================================================
//  /portal/admin/shop — Merchandise management (server shell)
// ============================================================================

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ShopManager } from "@/components/admin/shop/ShopManager";

export const dynamic = "force-dynamic";

export default async function ShopPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("studio_id, role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "admin") redirect("/portal/admin");

  const [{ data: products }, { data: recentOrders }] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, description, price_cents, stock_qty, sku, category, image_url, active, created_at")
      .eq("studio_id", profile.studio_id)
      .order("created_at", { ascending: false }),
    // Line items come along because "what did they order" is the first thing
    // anyone picking a shelf needs, and the tab previously couldn't answer it.
    supabase
      .from("orders")
      .select(
        "id, total_cents, status, fulfilment_status, fulfilled_at, created_at, user_id, stripe_payment_intent_id, profiles!orders_user_id_fkey(first_name, last_name), order_items(qty, unit_price, products(name))",
      )
      .eq("studio_id", profile.studio_id)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  return <ShopManager products={products ?? []} recentOrders={recentOrders ?? []} />;
}
