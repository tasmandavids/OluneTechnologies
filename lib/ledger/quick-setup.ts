// ============================================================================
//  Olune Books in one tap: the full setup wizard's answers, defaulted from
//  the country.
//
//  Onboarding asks two things — the country, and whether the studio is
//  registered for the local sales tax — and everything else comes from the
//  jurisdiction pack: currency, the first accounting basis the pack lists,
//  the default filing frequency and cycle, the local financial year, and a
//  conversion date at the start of the current tax period (so the first
//  return Books prepares is a whole one). Books → Settings changes any of it
//  later; nothing here is locked in until a return is filed.
// ============================================================================

import { JURISDICTIONS, getJurisdiction } from "./jurisdictions";
import type { Jurisdiction } from "./jurisdictions/types";
import { taxPeriodContaining } from "./periods";
import type { SetupInput } from "./server/setup";

export type QuickSetupChoice = {
  /** ISO 3166 alpha-2 code of a jurisdiction pack. */
  country: string;
  /** Only for packs with regions (CA provinces, US states…). */
  region: string | null;
  taxRegistered: boolean;
  taxNumber: string | null;
};

/** The countries Books can set itself up for, in setup-screen order. */
export function quickSetupCountries(): Pick<Jurisdiction, "code" | "name" | "flag" | "currency" | "taxName" | "defaultRegistered" | "regionLabel" | "regions">[] {
  return JURISDICTIONS.map((j) => ({
    code: j.code,
    name: j.name,
    flag: j.flag,
    currency: j.currency,
    taxName: j.taxName,
    defaultRegistered: j.defaultRegistered,
    regionLabel: j.regionLabel,
    regions: j.regions,
  }));
}

/**
 * The country a studio typed on its profile ("New Zealand", "nz", "UK"…),
 * as a pack code, or null when there's no pack for it.
 */
export function countryCodeFromName(name: string | null | undefined): string | null {
  const v = (name ?? "").trim().toLowerCase();
  if (!v) return null;
  const aliases: Record<string, string> = {
    uk: "GB",
    "united kingdom": "GB",
    britain: "GB",
    "great britain": "GB",
    england: "GB",
    scotland: "GB",
    wales: "GB",
    "northern ireland": "GB",
    usa: "US",
    "united states of america": "US",
    america: "US",
    aotearoa: "NZ",
    "aotearoa new zealand": "NZ",
    "south korea": "KR",
    korea: "KR",
    holland: "NL",
    "the netherlands": "NL",
  };
  if (aliases[v]) return aliases[v];
  const byCode = JURISDICTIONS.find((j) => j.code.toLowerCase() === v);
  if (byCode) return byCode.code;
  return JURISDICTIONS.find((j) => j.name.toLowerCase() === v)?.code ?? null;
}

/** Turn the two onboarding answers into a full setup. Null for an unknown country. */
export function quickSetupInput(choice: QuickSetupChoice, today: string, existing: { pricesIncludeTax?: boolean } = {}): SetupInput | null {
  const j = getJurisdiction(choice.country);
  if (!j) return null;
  const region = j.regions?.length ? (j.regions.find((r) => r.code === choice.region)?.code ?? null) : null;
  if (j.regions?.length && !region) return null;
  const anchor = j.filing.defaultAnchorMonth ?? 1;
  const conversionDate = choice.taxRegistered ? taxPeriodContaining(today, j.filing.default, anchor).start : `${today.slice(0, 7)}-01`;
  return {
    jurisdiction: j.code,
    region,
    custom: null,
    taxRegistered: choice.taxRegistered,
    taxNumber: choice.taxRegistered ? choice.taxNumber?.trim() || null : null,
    basisId: j.bases[0].id,
    filingFrequency: j.filing.default,
    taxPeriodAnchorMonth: anchor,
    fiscalYearStartMonth: j.fiscalYearStart.month,
    fiscalYearStartDay: j.fiscalYearStart.day,
    conversionDate,
    pricesIncludeTax: existing.pricesIncludeTax ?? j.pricesIncludeTax,
    updateProductRates: true,
  };
}
