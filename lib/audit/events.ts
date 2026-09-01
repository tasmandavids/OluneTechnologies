// ============================================================================
//  The catalogue of auditable actions.
//
//  Kept as a typed union rather than free-form strings so that a call site
//  cannot invent 'student.delete' alongside 'student.deleted' and quietly split
//  one action into two histories. The database has no check constraint on
//  `action` on purpose (see 0126) — this file is the constraint, enforced at
//  compile time where adding one is cheap.
//
//  Naming: <subject>.<past tense verb>. Past tense because a row is a record of
//  something that already happened; 'student.deleted' reads correctly in a log
//  viewer, 'delete_student' reads like a button.
//
//  ── This catalogue is the target, not the coverage
//  Declaring an action here does not make anything emit it. As of the first
//  cut, six call sites are wired: student.created / .deleted / .bulk_deleted,
//  parent.deleted, member.invited, member.removed. The rest are named because
//  the set an auditor expects should be visible and reviewable in one place
//  rather than discovered call site by call site — but do not read this list as
//  a statement of what the log currently contains. docs/SOC2_READINESS.md
//  tracks which are live.
// ============================================================================

/**
 * What an entry means to whoever reads the log later.
 *
 * `severity` is not about how bad the action is — it is how hard the reader
 * should look. `notable` is the default: a normal privileged action. `high` is
 * for the ones an auditor or an incident responder scans for first: anything
 * that moves permissions, removes data, moves money, or reads personal data in
 * bulk.
 */
export type AuditSeverity = "notable" | "high";

export const AUDIT_ACTIONS = {
  // ─── People and permissions ──────────────────────────────────────────────
  //  Role changes are the classic privilege-escalation path and the first
  //  thing asked about after an incident.
  "member.role_changed": "high",
  "member.invited": "notable",
  "member.removed": "high",

  // ─── Records about children ──────────────────────────────────────────────
  "student.created": "notable",
  "student.updated": "notable",
  "student.deleted": "high",
  "student.bulk_deleted": "high",
  "student.enrolled": "notable",
  "student.unenrolled": "notable",

  "parent.created": "notable",
  "parent.updated": "notable",
  "parent.deleted": "high",

  // ─── Bulk reads of personal data ─────────────────────────────────────────
  //  A single record view is noise at this granularity; an export is the event
  //  that matters, because it is the point where data leaves the system.
  "data.exported": "high",

  // ─── Money ───────────────────────────────────────────────────────────────
  "invoice.voided": "high",
  "payment.refunded": "high",

  // ─── Configuration that changes who can reach what ───────────────────────
  "integration.connected": "high",
  "integration.disconnected": "notable",
  "studio.settings_updated": "notable",
} as const satisfies Record<string, AuditSeverity>;

export type AuditAction = keyof typeof AUDIT_ACTIONS;

export const AUDIT_ACTION_KEYS = Object.keys(AUDIT_ACTIONS) as AuditAction[];

/** How hard a reader should look at this entry. */
export function auditSeverity(action: AuditAction): AuditSeverity {
  return AUDIT_ACTIONS[action];
}

/** The actions an auditor or incident responder scans first. */
export function highSeverityActions(): AuditAction[] {
  return AUDIT_ACTION_KEYS.filter((a) => AUDIT_ACTIONS[a] === "high");
}
