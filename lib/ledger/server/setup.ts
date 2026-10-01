import "server-only";

// ============================================================================
//  Switching Olune Books on.
//
//  Turns the wizard's answers + the jurisdiction pack into one atomic
//  ledger_provision call (settings, tax rates, chart), then brings the
//  studio's existing tax posture (studios.gst_registered / prices_include_tax /
//  gst_number) into line so invoices raised from now on are taxed the way the
//  books expect.
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import { buildChart } from "../chart";
import { customJurisdiction, getJurisdiction, getRegion, ratesFor } from "../jurisdictions";
import type { Jurisdiction } from "../jurisdictions/types";
import type { FilingFrequency } from "../types";

export type SetupInput = {
  jurisdiction: string;
  region: string | null;
  custom: { countryName: string; currency: string; taxName: string; standardRateBp: number; reducedRateBp: number | null } | null;
  taxRegistered: boolean;
  taxNumber: string | null;
  basisId: string;
  filingFrequency: FilingFrequency;
  taxPeriodAnchorMonth: number;
  fiscalYearStartMonth: number;
  fiscalYearStartDay: number;
  conversionDate: string;
  pricesIncludeTax: boolean;
  /** Re-rate catalogue products still on the NZ 15% default to the local standard rate. */
  updateProductRates: boolean;
};

export type SetupResult = { ok: true } | { ok: false; error: string };

export function jurisdictionForSetup(input: Pick<SetupInput, "jurisdiction" | "custom">): Jurisdiction | null {
  if (input.jurisdiction === "XX") return input.custom ? customJurisdiction(input.custom) : null;
  return getJurisdiction(input.jurisdiction);
}

/** Validate the wizard's answers against the pack. Returns an error key or null. */
export function validateSetup(input: SetupInput): string | null {
  const j = jurisdictionForSetup(input);
  if (!j) return "jurisdiction";
  if (j.regions?.length && !getRegion(j, input.region)) return "region";
  if (!j.bases.some((b) => b.id === input.basisId)) return "basis";
  if (input.taxRegistered && !j.filing.frequencies.includes(input.filingFrequency)) return "frequency";
  if (input.taxRegistered && input.taxNumber && !j.taxNumber.validate(input.taxNumber)) return "taxNumberInvalid";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.conversionDate)) return "conversionDate";
  if (input.jurisdiction === "XX") {
    const c = input.custom!;
    if (!/^[A-Z]{3}$/.test(c.currency.toUpperCase())) return "currency";
    if (c.standardRateBp < 0 || c.standardRateBp > 10_000) return "rate";
  }
  return null;
}

export async function provisionBooks(supabase: SupabaseClient, studioId: string, input: SetupInput): Promise<SetupResult> {
  const invalid = validateSetup(input);
  if (invalid) return { ok: false, error: invalid };

  const j = jurisdictionForSetup(input)!;
  const region = getRegion(j, input.region);
  const basis = j.bases.find((b) => b.id === input.basisId)!;
  const rates = ratesFor(j, region);
  const chart = buildChart(j, region);

  const normalisedTaxNumber = input.taxNumber?.trim() ? (j.taxNumber.normalise?.(input.taxNumber) ?? input.taxNumber.trim()) : null;

  const { error } = await supabase.rpc("ledger_provision", {
    p_studio_id: studioId,
    p_settings: {
      jurisdiction: j.code,
      region: region?.code ?? "",
      base_currency: j.currency,
      custom_country_name: input.jurisdiction === "XX" ? input.custom?.countryName ?? "" : "",
      custom_tax_name: input.jurisdiction === "XX" ? input.custom?.taxName ?? "" : "",
      tax_registered: input.taxRegistered,
      tax_number: normalisedTaxNumber ?? "",
      tax_scheme: basis.id,
      sales_tax_basis: basis.sales,
      purchases_tax_basis: basis.purchases,
      filing_frequency: input.filingFrequency,
      tax_period_anchor_month: input.taxPeriodAnchorMonth,
      fiscal_year_start_month: input.fiscalYearStartMonth,
      fiscal_year_start_day: input.fiscalYearStartDay,
      conversion_date: input.conversionDate,
      prices_include_tax: input.pricesIncludeTax,
      auto_post: true,
      pack_version: 1,
    },
    p_tax_rates: rates.map((r, i) => ({
      code: r.code,
      name: r.name,
      rate_bp: r.rateBp,
      applies_to: r.appliesTo,
      report_category: r.reportCategory,
      components: r.components ?? [],
      sort_order: i,
    })),
    p_accounts: chart.map((a) => ({
      code: a.code,
      name: a.name,
      type: a.type,
      subtype: a.subtype,
      system_key: a.systemKey ?? "",
      description: "",
      default_tax_code: a.defaultTaxCode ?? "",
      bank_kind: a.bankKind ?? "",
    })),
  });
  if (error) return { ok: false, error: error.message };

  // Keep the invoicing side consistent with the books. These columns predate
  // Books and still drive how Olune prices and taxes new invoices.
  await supabase
    .from("studios")
    .update({
      accounting_provider: "olune",
      gst_registered: input.taxRegistered,
      prices_include_tax: input.pricesIncludeTax,
      gst_number: normalisedTaxNumber,
    })
    .eq("id", studioId);

  if (input.updateProductRates && input.taxRegistered) {
    const std = rates.find((r) => r.code === (region?.defaultSalesCode ?? j.defaultSalesCode));
    if (std && std.rateBp !== 1500 && Number.isInteger(std.rateBp)) {
      await supabase
        .from("billing_products")
        .update({ tax_rate_bp: std.rateBp })
        .eq("studio_id", studioId)
        .eq("tax_treatment", "standard")
        .eq("tax_rate_bp", 1500);
    }
  }

  return { ok: true };
}
