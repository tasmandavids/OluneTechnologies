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
