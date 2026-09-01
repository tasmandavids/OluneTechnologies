// ============================================================================
//  lib/notify/config.ts
//
//  Env-driven configuration for outbound notification delivery (email, SMS,
//  push).
//  Keep this the single place that reads delivery env vars so the providers and
//  the cron route agree on what "configured" means. When a provider's keys are
//  unset the delivery layer no-ops gracefully (the in-app notification row is
//  still created by the DB triggers / cron — only the external send is skipped).
// ============================================================================

export type EmailConfig = {
  apiKey: string;
  /** "Studio Name <noreply@domain>" or a bare address. */
  from: string;
};

export type SmsConfig = {
  accountSid: string;
  authToken: string;
  /** E.164 sender number, e.g. +6421234567. */
  from: string;
};

export type PushConfig = {
  /**
   * Expo access token. Expo's push API accepts unauthenticated sends, so this
   * is technically optional to *them* — but it is what enables Expo's push
   * security (rejecting sends that don't carry it), and gating on it keeps the
   * "no keys → skip, don't throw" contract the other two providers follow.
   * Without it set, push silently no-ops exactly like email does in dev.
   */
  accessToken: string;
};

export function getEmailConfig(): EmailConfig | null {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  if (!apiKey || !from) return null;
  return { apiKey, from };
}

export function getSmsConfig(): SmsConfig | null {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM;
  if (!accountSid || !authToken || !from) return null;
  return { accountSid, authToken, from };
}

export function getPushConfig(): PushConfig | null {
  const accessToken = process.env.EXPO_ACCESS_TOKEN;
  if (!accessToken) return null;
  return { accessToken };
}

export function isEmailConfigured(): boolean {
  return getEmailConfig() !== null;
}

export function isSmsConfigured(): boolean {
  return getSmsConfig() !== null;
}

export function isPushConfigured(): boolean {
  return getPushConfig() !== null;
}
