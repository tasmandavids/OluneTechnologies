import "server-only";

// ============================================================================
//  Writing to the tenant audit trail (SOC2-02).
//
//  One entry point, `logAuditEvent`, called from server actions that have
//  already resolved who the actor is. It uses the service-role client because
//  audit_events grants insert to service_role alone (0126) — a client that
//  could write its own audit trail could forge an actor, which would make the
//  table worthless as evidence.
//
//  ── Why this never throws
//  An audit write failing must not fail the action it is recording. If
//  deleting a student succeeds and the log write fails, throwing here would
//  surface as "delete failed" to an admin who would then delete again — worse
//  for the data and no better for the log. So failures are swallowed and
//  reported through `onWriteFailure` instead.
//
//  That trade has a cost worth naming: a silent failure means an action that
//  happened without a record, which is exactly the gap an auditor probes. It is
//  the right default only while the failure is *visible somewhere else* — which
//  today it is not, because Olune has no error monitoring at all (SOC2-05).
//  When monitoring lands, point `onWriteFailure` at it; that is the whole
//  reason the seam exists rather than a bare catch.
// ============================================================================

import { createAdminClient } from "@/lib/supabase/admin";
import type { AuditAction } from "./events";

export type AuditEntry = {
  /** Null only for events with no tenant yet (an auth event before a studio is resolved). */
  studioId: string | null;
  actorId: string | null;
  actorEmail?: string | null;
  actorRole?: string | null;
  action: AuditAction;
  targetType?: string | null;
  targetId?: string | null;
  /**
   * Ids, counts, and the before/after of the field that changed — never the
   * record itself. The audit trail must not become a second, unpoliced copy of
   * the personal data it exists to protect.
   */
  metadata?: Record<string, unknown>;
};

/**
 * Where a failed audit write goes.
 *
 * Replaceable so tests can assert the failure path, and so this has somewhere
 * to point once error monitoring exists. Until then it is a console.error,
 * which in production means it reaches Vercel's function logs and nothing else.
 */
let onWriteFailure: (entry: AuditEntry, error: unknown) => void = (entry, error) => {
  console.error(`[audit] failed to record ${entry.action}`, error);
};

/** Redirect audit-write failures (monitoring, or assertion in tests). */
export function setAuditFailureHandler(
  handler: (entry: AuditEntry, error: unknown) => void,
): void {
  onWriteFailure = handler;
}

/** The row shape 0126 expects. Exported for tests; not a public API. */
export function toAuditRow(entry: AuditEntry) {
  return {
    studio_id: entry.studioId,
    actor_id: entry.actorId,
    actor_email: entry.actorEmail ?? null,
    actor_role: entry.actorRole ?? null,
    action: entry.action,
    target_type: entry.targetType ?? null,
    target_id: entry.targetId ?? null,
    metadata: entry.metadata ?? {},
  };
}

/**
 * Record one auditable action. Never throws, never rejects.
 *
 * Callers should `await` it — the write is cheap and awaiting keeps the entry
 * ordered against the action it describes — but nothing depends on its result.
 */
export async function logAuditEvent(entry: AuditEntry): Promise<void> {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("audit_events").insert(toAuditRow(entry));
    if (error) onWriteFailure(entry, error);
  } catch (error) {
    // Includes SUPABASE_SERVICE_ROLE_KEY being unset, which is the normal case
    // in local dev and preview builds without secrets.
    onWriteFailure(entry, error);
  }
}
