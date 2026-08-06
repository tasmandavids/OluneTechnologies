"use server";

// ============================================================================
//  Shop / Merchandise server actions (admin)
// ============================================================================

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAdminStudio as getAdminStudioAccess } from "@/lib/portal/access";

export type ActionResult = { ok: true } | { ok: false; error: string };

async function getAdminStudio() {
  const ctx = await getAdminStudioAccess();
  return {
    error: ctx.error,
    supabase: ctx.supabase,
    studioId: ctx.studioId,
  };
}

const ProductSchema = z.object({
  name:        z.string().min(1).max(200),
  description: z.string().max(1000).optional().or(z.literal("")),
  priceCents:  z.coerce.number().int().min(0),
  stockQty:    z.coerce.number().int().min(0),
  sku:         z.string().max(100).optional().or(z.literal("")),
  barcode:     z.string().max(100).optional().or(z.literal("")),
  imageUrl:    z.string().url().optional().or(z.literal("")),
  category:    z.string().max(100).optional().or(z.literal("")),
  active:      z.coerce.boolean().default(true),
});

export type ProductFormData = z.infer<typeof ProductSchema>;

export const FULFILMENT_STATUSES = ["unfulfilled", "ready", "fulfilled"] as const;
export type FulfilmentStatus = (typeof FULFILMENT_STATUSES)[number];

/**
 * Move an order along the goods axis — picked, then handed over.
 *
 * Separate from `status`, which is the payment lifecycle. Only a paid order
 * can be fulfilled: marking an unpaid one "handed over" is how stock walks out
 * of a studio unrecorded, and refusing it here is cheaper than reconciling it
 * later.
 */
export async function setOrderFulfilment(
  orderId: string,
  next: FulfilmentStatus,
): Promise<ActionResult> {
  const { error, supabase, studioId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? "Admin only." };
  if (!z.string().uuid().safeParse(orderId).success) return { ok: false, error: "Unknown order." };
  if (!FULFILMENT_STATUSES.includes(next)) return { ok: false, error: "Unknown fulfilment status." };

  const { data: order } = await supabase
    .from("orders")
    .select("status")
    .eq("id", orderId)
    .eq("studio_id", studioId)
    .maybeSingle();

  if (!order) return { ok: false, error: "Order not found." };
  if (order.status !== "paid" && next !== "unfulfilled") {
    return { ok: false, error: "This order hasn't been paid for yet." };
  }

  const done = next === "fulfilled";
  const { error: dbErr } = await supabase
    .from("orders")
    .update({
      fulfilment_status: next,
      // Only the terminal state carries a timestamp; stepping back clears it
      // so "fulfilled_at" never describes an order that isn't.
      fulfilled_at: done ? new Date().toISOString() : null,
      fulfilled_by: done ? (await supabase.auth.getUser()).data.user?.id ?? null : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", orderId)
    .eq("studio_id", studioId);

  if (dbErr) {
    return {
      ok: false,
      error: /fulfilment_status/.test(dbErr.message)
        ? "Order fulfilment isn't provisioned yet — run migration 0115_order_fulfilment.sql (npm run db:push)."
        : dbErr.message,
    };
  }

  revalidatePath("/portal/admin/shop");
  return { ok: true };
}

export async function createProduct(input: unknown): Promise<ActionResult> {
  const parsed = ProductSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const { error, supabase, studioId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? "Unknown" };

  const d = parsed.data;
  const { error: dbErr } = await supabase.from("products").insert({
    studio_id:   studioId,
    name:        d.name,
    description: d.description || null,
    price_cents: d.priceCents,
    stock_qty:   d.stockQty,
    sku:         d.sku || null,
    barcode:     d.barcode || null,
    image_url:   d.imageUrl || null,
    category:    d.category || null,
    active:      d.active,
  });

  if (dbErr) return { ok: false, error: dbErr.message };
  revalidatePath("/portal/admin/shop");
  return { ok: true };
}

export async function updateProduct(productId: string, input: unknown): Promise<ActionResult> {
  const parsed = ProductSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const { error, supabase, studioId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? "Unknown" };

  const d = parsed.data;
  const { error: dbErr } = await supabase
    .from("products")
    .update({
      name:        d.name,
      description: d.description || null,
      price_cents: d.priceCents,
      stock_qty:   d.stockQty,
      sku:         d.sku || null,
      barcode:     d.barcode || null,
      image_url:   d.imageUrl || null,
      category:    d.category || null,
      active:      d.active,
    })
    .eq("id", productId)
    .eq("studio_id", studioId);

  if (dbErr) return { ok: false, error: dbErr.message };
  revalidatePath("/portal/admin/shop");
  return { ok: true };
}

export async function adjustStock(productId: string, delta: number): Promise<ActionResult> {
  const { error, supabase, studioId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? "Unknown" };

  const { data: product } = await supabase
    .from("products")
    .select("stock_qty")
    .eq("id", productId)
    .eq("studio_id", studioId)
    .single();

  if (!product) return { ok: false, error: "Product not found" };

  const newQty = Math.max(0, product.stock_qty + delta);
  const { error: dbErr } = await supabase
    .from("products")
    .update({ stock_qty: newQty })
    .eq("id", productId)
    .eq("studio_id", studioId);

  if (dbErr) return { ok: false, error: dbErr.message };
  revalidatePath("/portal/admin/shop");
  return { ok: true };
}

export async function toggleProductActive(productId: string, active: boolean): Promise<ActionResult> {
  const { error, supabase, studioId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? "Unknown" };

  const { error: dbErr } = await supabase
    .from("products")
    .update({ active })
    .eq("id", productId)
    .eq("studio_id", studioId);

  if (dbErr) return { ok: false, error: dbErr.message };
  revalidatePath("/portal/admin/shop");
  return { ok: true };
}

export async function deleteProduct(productId: string): Promise<ActionResult> {
  const { error, supabase, studioId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? "Unknown" };

  const { error: dbErr } = await supabase
    .from("products")
    .delete()
    .eq("id", productId)
    .eq("studio_id", studioId);

  if (dbErr) return { ok: false, error: dbErr.message };
  revalidatePath("/portal/admin/shop");
  return { ok: true };
}
