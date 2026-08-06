// ============================================================================
//  lib/analytics/track.ts — conversion events for the studio's own GA4.
//
//  StudioAnalytics wires GA4 correctly and then sends exactly one event type:
//  page_view. So a studio could connect Google Analytics, see traffic, and
//  still not know whether anyone enquired, enrolled, or bought a ticket — the
//  measurements that would let them decide anything.
//
//  Names below are GA4 RECOMMENDED events, not invented ones. That matters:
//  `generate_lead` and `purchase` populate GA4's built-in funnel, monetisation
//  and attribution reports out of the box, whereas a custom name like
//  `olune_enquiry` requires the studio to hand-build every report.
//
//  Client-only. Safe to call when GA4 isn't connected — it no-ops.
// ============================================================================

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

/** The conversions worth measuring. Deliberately small — one per real outcome. */
export type ConversionEvent =
  /** An enquiry or trial request was submitted. */
  | "generate_lead"
  /** Money changed hands: shop order, ticket, class pass. */
  | "purchase"
  /** A family created an account / joined the studio. */
  | "sign_up"
  /** A checkout was started but not necessarily finished. */
  | "begin_checkout";

export type ConversionParams = {
  /** GA4 monetisation reports key off `value` + `currency` together. */
  value?: number;
  currency?: string;
  /** Free-form label for what was bought or enquired about. */
  item_name?: string;
  transaction_id?: string;
  method?: string;
};

/**
 * Send one conversion to the studio's GA4, if they have one connected.
 *
 * Never throws and never awaits: analytics must not be able to break, delay or
 * fail the user action it is reporting on.
 */
export function trackConversion(event: ConversionEvent, params: ConversionParams = {}): void {
  try {
    if (typeof window === "undefined" || typeof window.gtag !== "function") return;

    // Drop undefined keys — GA4 records them as the literal string "undefined".
    const payload: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) payload[key] = value;
    }
    // GA4 expects `value` in major units (dollars), and every amount in this
    // codebase is stored in cents. Callers convert; this is the reminder.
    window.gtag("event", event, payload);
  } catch {
    // ignore — see above
  }
}

/** Cents → the major-unit number GA4 wants for `value`. */
export function toTrackedValue(cents: number): number {
  return Math.round(cents) / 100;
}
