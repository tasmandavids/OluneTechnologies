// ============================================================================
//  Jurisdiction registry. Order is the order on the setup screen: the
//  countries Olune sells into first, then alphabetical by English name.
// ============================================================================

import { AU } from "./au";
import { CA } from "./ca";
import { customJurisdiction, type CustomJurisdictionInput } from "./custom";
import { DE } from "./de";
import { ES } from "./es";
import { FR } from "./fr";
import { GB } from "./gb";
import { IE } from "./ie";
import { IT } from "./it";
import { JP } from "./jp";
import { KR } from "./kr";
import { NL } from "./nl";
import { NZ } from "./nz";
import { SG } from "./sg";
import type { Jurisdiction, RegionPack } from "./types";
import { US } from "./us";
import { ZA } from "./za";

export const JURISDICTIONS: Jurisdiction[] = [NZ, AU, GB, IE, US, CA, SG, ZA, DE, FR, IT, ES, NL, JP, KR];

export const JURISDICTION_CODES = JURISDICTIONS.map((j) => j.code);

export function getJurisdiction(code: string): Jurisdiction | null {
  return JURISDICTIONS.find((j) => j.code === code) ?? null;
}

export function getRegion(j: Jurisdiction, regionCode: string | null | undefined): RegionPack | null {
  if (!regionCode || !j.regions) return null;
  return j.regions.find((r) => r.code === regionCode) ?? null;
}

/**
 * The pack for a studio's saved settings. A custom ('XX') studio's pack is
 * rebuilt from what it stored, since there's nothing to look up.
 */
export function resolveJurisdiction(
  code: string,
  custom?: CustomJurisdictionInput | null,
): Jurisdiction {
  if (code === "XX") {
    return customJurisdiction(
      custom ?? { countryName: "Other country", currency: "USD", taxName: "Tax", standardRateBp: 0 },
    );
  }
  const j = getJurisdiction(code);
  if (!j) throw new Error(`Unknown jurisdiction ${code}`);
  return j;
}

/** Tax rates the studio gets: the region's list replaces the national one. */
export function ratesFor(j: Jurisdiction, region: RegionPack | null) {
  return region?.taxRates ?? j.taxRates;
}

export { customJurisdiction };
export type { CustomJurisdictionInput };
