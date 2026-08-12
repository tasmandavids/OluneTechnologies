// ============================================================================
//  Who the paywall applies to.
//
//  Its own module because three unrelated places need the same answer — the
//  portal layout, lib/portal/access.ts, and the plan pages — and "who gets
//  locked out" is exactly the sort of predicate that drifts when it is
//  re-typed at each call site.
// ============================================================================

import type { Role } from "@/lib/types";

/**
 * Roles that see the paywall and the trial banner.
 *
 * Admin and office only. Teachers, parents and students keep working through a
 * lapse, and so do /join, /enrol and the studio's published site: an unpaid
 * Olune bill is between Olune and the studio owner, and the studio's own
 * customers are not leverage.
 *
 * Note this is `role`, not `isStudioOwner` — a sole-trader instructor
 * workspace (kind = 'instructor', account_kind = 'instructor') has an admin
 * role and is just as much a paying customer as a studio.
 */
export function isBillingRole(role: Role | null | undefined): boolean {
  return role === "admin" || role === "office";
}
