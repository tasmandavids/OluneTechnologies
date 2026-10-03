// ============================================================================
//  POST /api/shop/checkout — create an order and line items.
//  Free orders: status=paid immediately. Paid: returns Stripe clientSecret.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";
import { CURRENCY } from "@/lib/currency";
import { familyDiscountInfo } from "@/lib/discounts";
import { getOrCreateStripeCustomer } from "@/lib/stripe/customer";
import { resolveDestinationCharge } from "@/lib/stripe/connect";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";

// qty must be a positive integer: a negative line used to lower the total of
// the rest of the cart, and the paid-order trigger then RESTOCKED that line.
const CheckoutSchema = z.object({
  items: z
    .array(z.object({ productId: z.string().uuid(), qty: z.number().int().min(1).max(99) }))
    .min(1)
    .max(50),
});

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!(await checkRateLimit(rateLimitKey("shop-checkout", user.id), { limit: 20, windowMs: 60_000 }))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const parsed = CheckoutSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid cart" }, { status: 400 });
  }
  // Merge repeated products so the stock check sees the real quantity.
  const qtyByProduct = new Map<string, number>();
  for (const i of parsed.data.items) {
    qtyByProduct.set(i.productId, (qtyByProduct.get(i.productId) ?? 0) + i.qty);
  }
  const items = [...qtyByProduct].map(([productId, qty]) => ({ productId, qty }));

  // Resolve the buyer's current workspace — the scope the old orders RLS
  // check enforced before writes moved to the service role.
  const { data: buyer } = await supabase
    .from("profiles")
    .select("studio_id, active_studio_id")
    .eq("id", user.id)
    .single();

  const studioId = (buyer?.active_studio_id ?? buyer?.studio_id) as string | null;
  if (!studioId) return NextResponse.json({ error: "Profile not found" }, { status: 400 });
  const profile = { studio_id: studioId };

  // Fetch products and validate stock
  const productIds = items.map((i) => i.productId);
  const { data: products, error: pErr } = await supabase
    .from("products")
    .select("id, name, price_cents, stock_qty, active")
    .eq("studio_id", profile.studio_id)
    .in("id", productIds);

  if (pErr || !products) return NextResponse.json({ error: "Could not load products" }, { status: 500 });

  const productMap = Object.fromEntries(products.map((p) => [p.id, p]));

  let totalCents = 0;
  const lineItems: { product_id: string; qty: number; unit_price: number }[] = [];

  for (const item of items) {
    const p = productMap[item.productId];
    if (!p || !p.active) return NextResponse.json({ error: `Product not available: ${item.productId}` }, { status: 400 });
    if (p.stock_qty < item.qty) return NextResponse.json({ error: `Insufficient stock for ${p.name}` }, { status: 400 });
    totalCents += p.price_cents * item.qty;
    lineItems.push({ product_id: p.id, qty: item.qty, unit_price: p.price_cents });
  }

  // Family discount (opt-in per studio) — applied to merch when the buyer
  // already has an actively-enrolled student. No-op unless the studio enabled it.
  const discount = await familyDiscountInfo(supabase, profile.studio_id, user.id, totalCents);
  totalCents = discount.discountedCents;

  const orderStatus = totalCents === 0 ? "paid" : "pending";

  // Orders and line items are written with the service role: buyers can only
  // read them (migration 20261003120000), so nothing the client sends reaches
  // these rows except through the server-side pricing above.
  const admin = createAdminClient();

  // Create order
  const { data: order, error: oErr } = await admin
    .from("orders")
    .insert({
      studio_id:   profile.studio_id,
      user_id:     user.id,
      total_cents: totalCents,
      status:      orderStatus,
    })
    .select()
    .single();

  if (oErr || !order) return NextResponse.json({ error: oErr?.message ?? "Order creation failed" }, { status: 500 });

  // Insert line items
  const { error: liErr } = await admin.from("order_items").insert(
    lineItems.map((li) => ({ ...li, order_id: order.id }))
  );

  if (liErr) {
    await admin.from("orders").delete().eq("id", order.id);
    return NextResponse.json({ error: liErr.message }, { status: 500 });
  }

  if (totalCents === 0) {
    return NextResponse.json({ orderId: order.id, free: true }, { status: 201 });
  }

  // Paid order — create Stripe intent
  const stripe = (await import("@/lib/stripe")).stripe;

  const customerId = await getOrCreateStripeCustomer(supabase, user.id, profile.studio_id as string);

  const intent = await stripe.paymentIntents.create({
    amount:   totalCents,
    currency: CURRENCY,
    customer: customerId,
    // studio_id lets the webhook dispatch payment.succeeded without re-reading
    // the order to find out whose studio it was.
    metadata: { order_id: order.id, user_id: user.id, studio_id: profile.studio_id as string },
    ...(await resolveDestinationCharge(supabase, profile.studio_id as string)),
  });

  // Store payment intent reference on order — the webhook matches on it.
  const { error: piErr } = await admin
    .from("orders")
    .update({ stripe_payment_intent_id: intent.id })
    .eq("id", order.id);
  if (piErr) {
    await stripe.paymentIntents.cancel(intent.id).catch(() => undefined);
    return NextResponse.json({ error: "Could not start payment. Please try again." }, { status: 500 });
  }

  return NextResponse.json({
    orderId:      order.id,
    clientSecret: intent.client_secret,
    totalCents,
    free:         false,
  }, { status: 201 });
}
