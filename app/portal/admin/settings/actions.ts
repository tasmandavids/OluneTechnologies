"use server";

// ============================================================================
//  Admin settings server actions
// ============================================================================

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const StudioNameSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(80, "Name must be under 80 characters").trim(),
});

export type SettingsResult = { ok: true } | { ok: false; error: string };

export async function updateStudioName(input: unknown): Promise<SettingsResult> {
  const parsed = StudioNameSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("studio_id, role")
    .eq("id", user.id)
    .single();

  if (!profile?.studio_id) return { ok: false, error: "No studio found." };
  if (profile.role !== "admin") return { ok: false, error: "Only admins can change studio settings." };

  const { error } = await supabase
    .from("studios")
    .update({ name: parsed.data.name })
    .eq("id", profile.studio_id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/", "layout");
  return { ok: true };
}

// ─── Sibling / family discount (Phase 3.3) ────────────────────────────────────

const SiblingDiscountSchema = z.object({
  pct: z.coerce.number().int().min(0, "Must be 0 or more").max(100, "Must be 100 or less"),
});

export async function updateSiblingDiscount(input: unknown): Promise<SettingsResult> {
  const parsed = SiblingDiscountSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("studio_id, role")
    .eq("id", user.id)
    .single();

  if (!profile?.studio_id) return { ok: false, error: "No studio found." };
  if (profile.role !== "admin") return { ok: false, error: "Only admins can change studio settings." };

  const { error } = await supabase
    .from("studios")
    .update({ sibling_discount_pct: parsed.data.pct })
    .eq("id", profile.studio_id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/portal/admin/settings");
  return { ok: true };
}

// ─── Family discount on retail (Session 9 · Priority 1) ───────────────────────
// Opt-in flag: when enabled, the studio's sibling_discount_pct also applies to
// shop orders and event-ticket purchases for families with an active enrollment.

const FamilyRetailSchema = z.object({ enabled: z.coerce.boolean() });

export async function updateFamilyRetailDiscount(input: unknown): Promise<SettingsResult> {
  const parsed = FamilyRetailSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("studio_id, role")
    .eq("id", user.id)
    .single();

  if (!profile?.studio_id) return { ok: false, error: "No studio found." };
  if (profile.role !== "admin") return { ok: false, error: "Only admins can change studio settings." };

  const { error } = await supabase
    .from("studios")
    .update({ family_discount_on_retail: parsed.data.enabled })
    .eq("id", profile.studio_id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/portal/admin/settings");
  return { ok: true };
}

// ─── Timezone (Session 8 · Priority 1) ────────────────────────────────────────
// IANA timezone name used by the notifications cron to compute the studio's
// local "today"/"tomorrow" for reminders, birthdays and overdue sweeps.

const TimezoneSchema = z.object({
  timezone: z
    .string()
    .min(1, "Timezone is required")
    .refine((tz) => {
      try {
        new Intl.DateTimeFormat("en-CA", { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    }, "Not a valid IANA timezone"),
});

export async function updateStudioTimezone(input: unknown): Promise<SettingsResult> {
  const parsed = TimezoneSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("studio_id, role")
    .eq("id", user.id)
    .single();

  if (!profile?.studio_id) return { ok: false, error: "No studio found." };
  if (profile.role !== "admin") return { ok: false, error: "Only admins can change studio settings." };

  const { error } = await supabase
    .from("studios")
    .update({ timezone: parsed.data.timezone })
    .eq("id", profile.studio_id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/portal/admin/settings");
  return { ok: true };
}

// ─── Billing period (monthly vs. termly) ──────────────────────────────────────
// GST posture is a studio fact, not a per-product one. Xero's lineAmountTypes
// is a property of the invoice rather than the line, so a mixed
// inclusive/exclusive invoice can't be expressed at all — the studio picks one
// convention and every catalogue price is read under it. Per-product treatment
// (standard / zero-rated / exempt) lives in Money → Products.

const TaxSettingsSchema = z.object({
  pricesIncludeTax: z.boolean(),
  gstRegistered: z.boolean(),
  gstNumber: z.string().trim().max(20).optional(),
});

export async function updateTaxSettings(input: unknown): Promise<SettingsResult> {
  const parsed = TaxSettingsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("studio_id, role")
    .eq("id", user.id)
    .single();

  if (!profile?.studio_id) return { ok: false, error: "No studio found." };
  if (profile.role !== "admin") return { ok: false, error: "Only admins can change studio settings." };

  const { error } = await supabase
    .from("studios")
    .update({
      prices_include_tax: parsed.data.pricesIncludeTax,
      gst_registered: parsed.data.gstRegistered,
      gst_number: parsed.data.gstNumber || null,
    })
    .eq("id", profile.studio_id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/portal/admin/settings");
  revalidatePath("/portal/admin/money");
  return { ok: true };
}

// Studios that invoice per-term (e.g. 4 terms/year) instead of monthly need
// their own term calendar — the subscription-invoices cron reads this instead
// of assuming every studio bills on the 1st of the month.

const BillingPeriodSchema = z.object({
  billingPeriod: z.enum(["monthly", "termly"]),
});

export async function updateBillingPeriod(input: unknown): Promise<SettingsResult> {
  const parsed = BillingPeriodSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("studio_id, role")
    .eq("id", user.id)
    .single();

  if (!profile?.studio_id) return { ok: false, error: "No studio found." };
  if (profile.role !== "admin") return { ok: false, error: "Only admins can change studio settings." };

  const { error } = await supabase
    .from("studios")
    .update({ billing_period: parsed.data.billingPeriod })
    .eq("id", profile.studio_id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/portal/admin/settings");
  return { ok: true };
}

const StudioTermSchema = z.object({
  name: z.string().min(1, "Term name is required").max(60, "Term name is too long").trim(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid start date"),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid end date"),
  invoiceLeadDays: z.coerce.number().int().min(0, "Must be 0 or more").max(120, "Must be 120 or less"),
});

async function requireStudioAdmin(): Promise<
  { ok: true; supabase: Awaited<ReturnType<typeof createClient>>; studioId: string } | { ok: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("studio_id, role")
    .eq("id", user.id)
    .single();

  if (!profile?.studio_id) return { ok: false, error: "No studio found." };
  if (profile.role !== "admin") return { ok: false, error: "Only admins can change studio settings." };

  return { ok: true, supabase, studioId: profile.studio_id as string };
}

export type StudioTermResult = { ok: true; id: string } | { ok: false; error: string };

export async function createStudioTerm(input: unknown): Promise<StudioTermResult> {
  const parsed = StudioTermSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  if (parsed.data.endDate <= parsed.data.startDate) {
    return { ok: false, error: "End date must be after the start date." };
  }

  const ctx = await requireStudioAdmin();
  if (!ctx.ok) return ctx;

  const { data, error } = await ctx.supabase
    .from("studio_terms")
    .insert({
      studio_id: ctx.studioId,
      name: parsed.data.name,
      start_date: parsed.data.startDate,
      end_date: parsed.data.endDate,
      invoice_lead_days: parsed.data.invoiceLeadDays,
    })
    .select("id")
    .single();

  if (error || !data) return { ok: false, error: error?.message ?? "Could not create term." };

  revalidatePath("/portal/admin/settings");
  return { ok: true, id: data.id as string };
}

const UpdateStudioTermSchema = StudioTermSchema.extend({ id: z.string().uuid() });

export async function updateStudioTerm(input: unknown): Promise<SettingsResult> {
  const parsed = UpdateStudioTermSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  if (parsed.data.endDate <= parsed.data.startDate) {
    return { ok: false, error: "End date must be after the start date." };
  }

  const ctx = await requireStudioAdmin();
  if (!ctx.ok) return ctx;

  const { error } = await ctx.supabase
    .from("studio_terms")
    .update({
      name: parsed.data.name,
      start_date: parsed.data.startDate,
      end_date: parsed.data.endDate,
      invoice_lead_days: parsed.data.invoiceLeadDays,
    })
    .eq("id", parsed.data.id)
    .eq("studio_id", ctx.studioId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/portal/admin/settings");
  return { ok: true };
}

export async function deleteStudioTerm(input: unknown): Promise<SettingsResult> {
  const parsed = z.object({ id: z.string().uuid() }).safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const ctx = await requireStudioAdmin();
  if (!ctx.ok) return ctx;

  const { error } = await ctx.supabase
    .from("studio_terms")
    .delete()
    .eq("id", parsed.data.id)
    .eq("studio_id", ctx.studioId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/portal/admin/settings");
  return { ok: true };
}

const RegistrationSchema = z.object({
  enabled: z.coerce.boolean(),
  roles: z.array(z.enum(["parent", "student"])).min(1, "Select at least one role"),
});

export async function updateStudioRegistration(input: unknown): Promise<SettingsResult> {
  const parsed = RegistrationSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("studio_id, role")
    .eq("id", user.id)
    .single();

  if (!profile?.studio_id) return { ok: false, error: "No studio found." };
  if (profile.role !== "admin") return { ok: false, error: "Only admins can change studio settings." };

  const { error } = await supabase
    .from("studios")
    .update({
      registration_enabled: parsed.data.enabled,
      registration_roles: parsed.data.roles,
    })
    .eq("id", profile.studio_id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/portal/admin/settings");
  revalidatePath("/join");
  return { ok: true };
}
