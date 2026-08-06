// ============================================================================
//  Combo matching — "Intermediate Monday AND Wednesday, $299".
//
//  A studio names a combination of classes and gives it one price. When a
//  family's basket satisfies it, the combo replaces the classes it covers
//  instead of the family paying for each one. This is the answer to the
//  complaint this whole feature started from: two Intermediate classes priced
//  at $299 each shouldn't come to $598 when the studio only ever meant $299.
//
//  Combos are ordinary `package` products with auto_apply set, so their
//  definition, editor, RLS and invoice rendering (expandPackage) already exist.
//  This file is only the part that was missing: deciding which ones fire.
//
//  Matching is on PRODUCTS, not class names — the same discipline
//  lib/enrollment-billing.ts applies to recurring groups. Two classes an admin
//  happened to name "Intermediate" are not a statement about price; a studio
//  saying "these two products, $299" is.
//
//  Pure by design: no Supabase, no server-only imports, so the parent's live
//  basket total and the invoice are computed by the same code.
// ============================================================================

/** An auto-applying package: what it costs, and what has to be present. */
export type ComboDefinition = {
  productId: string;
  /** Studio SKU. Unique per studio (0105), so it's the final tie-break. */
  code: string;
  name: string;
  priceCents: number;
  components: { productId: string; quantity: number }[];
};

/** One class in the basket, at its own à-la-carte price. */
export type BasketItem = {
  classId: string;
  productId: string | null;
  name: string;
  priceCents: number;
};

export type ComboFire = {
  combo: ComboDefinition;
  /** The basket items this firing covers. */
  consumed: BasketItem[];
  /** What the family saves versus paying for `consumed` separately. */
  savingsCents: number;
};

export type ComboResult = {
  fires: ComboFire[];
  /** Everything no combo covered, still at its own price. */
  leftovers: BasketItem[];
};

/**
 * A pathological catalogue shouldn't be able to hang an enrolment. No real
 * basket fires twenty combos; this is a backstop, not a limit.
 */
const MAX_FIRES = 20;

/**
 * Which items would satisfy this combo, or null if the basket can't.
 *
 * A combo fires only on a COMPLETE match: two of a three-class combo is not
 * two-thirds of a discount, it's two classes at their own prices. Partial
 * credit would mean a family sees a price that doesn't correspond to anything
 * the studio ever wrote down.
 *
 * When the basket holds more than a component needs, the dearest are consumed
 * first — it maximises the family's saving, and ties break on classId so the
 * same basket always resolves the same way.
 */
function selectFor(basket: BasketItem[], combo: ComboDefinition): BasketItem[] | null {
  if (!combo.components.length) return null;

  const taken: BasketItem[] = [];
  const used = new Set<string>();

  for (const component of combo.components) {
    const needed = Math.ceil(component.quantity);

    const available = basket
      // A class with no catalogue product can never satisfy a component — there
      // is nothing to match it on.
      .filter((item) => item.productId === component.productId && !used.has(item.classId))
      .sort((a, b) => b.priceCents - a.priceCents || a.classId.localeCompare(b.classId));

    if (available.length < needed) return null;

    for (const item of available.slice(0, needed)) {
      used.add(item.classId);
      taken.push(item);
    }
  }

  return taken;
}

function savingsOf(combo: ComboDefinition, consumed: BasketItem[]): number {
  return consumed.reduce((sum, item) => sum + item.priceCents, 0) - combo.priceCents;
}

/**
 * Resolve a dancer's basket against the studio's auto-applying combos.
 *
 * Greedy: each round takes the combo saving the family the most, removes what
 * it covers, and re-evaluates. A combo can therefore fire more than once — four
 * Intermediate classes against a two-class combo fire it twice.
 *
 * Candidate order is savings desc → component count desc → code asc. `code` is
 * unique per studio, so that's a total order and the same basket always
 * produces the same answer; it also means the final tie-break is something the
 * studio can see and change when they ask why one combo won.
 *
 * Greedy-by-savings isn't provably optimal — this is set-cover, and a contrived
 * overlapping catalogue can beat it. With the sizes involved (a handful of
 * combos, a basket of a few classes) a bounded exhaustive search would be cheap
 * and exact, and is the upgrade path if a studio ever hits it. Optimising for
 * an answer a studio owner can explain came first.
 */
export function matchCombos(basket: BasketItem[], combos: ComboDefinition[]): ComboResult {
  const fires: ComboFire[] = [];
  let remaining = [...basket];

  if (!combos.length) return { fires, leftovers: remaining };

  for (let round = 0; round < MAX_FIRES; round += 1) {
    const candidates: ComboFire[] = [];

    for (const combo of combos) {
      const consumed = selectFor(remaining, combo);
      if (!consumed) continue;

      const savingsCents = savingsOf(combo, consumed);
      // A combo that costs more than the classes it replaces is a typo, not a
      // price. Charging a family more than the total they can already see would
      // be the worst possible failure of this feature, so it simply never
      // fires — and the editor warns about it at save time.
      if (savingsCents <= 0) continue;

      candidates.push({ combo, consumed, savingsCents });
    }

    if (!candidates.length) break;

    candidates.sort(
      (a, b) =>
        b.savingsCents - a.savingsCents ||
        b.combo.components.length - a.combo.components.length ||
        a.combo.code.localeCompare(b.combo.code),
    );

    const winner = candidates[0];
    fires.push(winner);

    const consumedIds = new Set(winner.consumed.map((item) => item.classId));
    remaining = remaining.filter((item) => !consumedIds.has(item.classId));
  }

  return { fires, leftovers: remaining };
}

/**
 * What a combo would save against the current basket, for the admin editor's
 * live readout. Returns null when it wouldn't fire at all.
 */
export function comboSavingsCents(
  basket: BasketItem[],
  combo: ComboDefinition,
): number | null {
  const consumed = selectFor(basket, combo);
  return consumed ? savingsOf(combo, consumed) : null;
}
