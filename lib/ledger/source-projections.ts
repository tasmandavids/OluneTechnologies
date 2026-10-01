/**
 * Source-document projections used by the ledger catch-up sync.
 *
 * Keep these in a server-neutral module so schema contracts can be covered by
 * unit tests without importing the server-only sync implementation.
 */
export const EVENT_TICKET_LEDGER_SELECT =
  "id, status, total_cents, quantity, purchased_at, stripe_payment_intent_id, user:profiles!user_id ( full_name ), events!inner ( studio_id, name )";
