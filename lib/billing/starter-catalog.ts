// ============================================================================
//  The one-click starter catalogue.
//
//  A studio that has just connected shouldn't have to invent a pricing model
//  from a blank page, so Money → Products offers to seed this set. Ten entries
//  covering the ways a studio actually charges — the prices are deliberately
//  round placeholders, not recommendations, and every one is meant to be
//  edited.
//
//  Defined here rather than in a migration on purpose: SQL and TypeScript
//  copies of the same list drift apart on the first edit, and nobody wants ten
//  products they never asked for appearing in their tenant.
// ============================================================================

import type { PricingModel, ProductCategory, RecurringInterval } from "./types";

export type StarterProduct = {
  code: string;
  name: string;
  description: string;
  category: ProductCategory;
  pricingModel: PricingModel;
  unitAmountCents: number;
  unitLabel?: string;
  minUnits?: number;
  incrementUnits?: number;
  creditCount?: number;
  creditExpiryDays?: number;
  recurringInterval?: RecurringInterval;
  /** Codes of other starter products this package includes, with quantities. */
  components?: { code: string; quantity: number }[];
  tiers?: { minQuantity: number; discountBp: number }[];
};

export const STARTER_CATALOG: StarterProduct[] = [
  {
    code: "TUITION-TERM",
    name: "Term tuition",
    description: "One class, one term.",
    category: "tuition",
    pricingModel: "term",
    unitAmountCents: 22000,
    unitLabel: "term",
    // The volume break families ask about: the more classes, the cheaper each.
    tiers: [
      { minQuantity: 2, discountBp: 1000 },
      { minQuantity: 4, discountBp: 2000 },
    ],
  },
  {
    code: "TUITION-WEEK",
    name: "Weekly class fee",
    description: "Billed every week while enrolled.",
    category: "tuition",
    pricingModel: "recurring",
    unitAmountCents: 1800,
    unitLabel: "week",
    recurringInterval: "week",
  },
  {
    code: "CLASS-DROPIN",
    name: "Casual class",
    description: "Single class, paid on the day.",
    category: "tuition",
    pricingModel: "per_session",
    unitAmountCents: 2500,
    unitLabel: "session",
  },
  {
    code: "PASS-10",
    name: "10-class pass",
    description: "Ten classes, valid for 90 days.",
    category: "pass",
    pricingModel: "pass",
    unitAmountCents: 20000,
    unitLabel: "pass",
    creditCount: 10,
    creditExpiryDays: 90,
  },
  {
    code: "PRIVATE-HR",
    name: "Private lesson",
    description: "Billed per hour, rounded up to the nearest 15 minutes.",
    category: "tuition",
    pricingModel: "hourly",
    unitAmountCents: 6000,
    unitLabel: "hour",
    minUnits: 1,
    incrementUnits: 0.25,
  },
  {
    code: "HIRE-STUDIO",
    name: "Studio hire",
    description: "Room hire for external users, billed per hour.",
    category: "hire",
    pricingModel: "hourly",
    unitAmountCents: 4500,
    unitLabel: "hour",
    minUnits: 1,
    incrementUnits: 0.5,
  },
  {
    code: "REG-ANNUAL",
    name: "Annual registration",
    description: "Once a year, per student.",
    category: "fee",
    pricingModel: "one_off",
    unitAmountCents: 5000,
  },
  {
    code: "COSTUME",
    name: "Costume fee",
    description: "Per costume, per performance.",
    category: "fee",
    pricingModel: "one_off",
    unitAmountCents: 9000,
  },
  {
    code: "EXAM",
    name: "Exam fee",
    description: "Entry fee passed through to the examining body.",
    category: "fee",
    pricingModel: "one_off",
    unitAmountCents: 12000,
  },
  {
    code: "PKG-UNLIMITED",
    name: "Unlimited term package",
    description: "Every class for one term, at one price.",
    category: "tuition",
    pricingModel: "package",
    unitAmountCents: 55000,
    unitLabel: "term",
    components: [{ code: "TUITION-TERM", quantity: 3 }],
  },
];
