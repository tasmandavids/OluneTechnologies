/**
 * Admin-created subscriptions are off until the studio has one billing model
 * (audit B-09). They are created `default_incomplete` with no screen where the
 * payer can confirm them, so they never collect; and were one ever confirmed,
 * the monthly invoice cron would bill the family a second time. Families'
 * own auto-pay subscriptions are unaffected.
 */
export const ADMIN_SUBSCRIPTIONS_ENABLED = false;
