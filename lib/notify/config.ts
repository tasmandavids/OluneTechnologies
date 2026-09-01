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
  /**
   * Where replies land. Optional, and absent means replies go to `from` —
   * which for a noreply@ sender means they are lost, silently, from the
   * recipient's point of view. A parent replying to an invoice is a normal
   * thing to do, so set this to a monitored address wherever one exists.
   */
  replyTo?: string;
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
  const replyTo = process.env.RESEND_REPLY_TO?.trim();
  return { apiKey, from, ...(replyTo ? { replyTo } : {}) };
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

// ============================================================================
//  DELIVERY VISIBILITY
// ============================================================================
//  The "no keys → skip, don't throw" contract above is right for correctness —
//  a missing Resend key must not take down an enrolment — but it is exactly
//  what let production run for months with RESEND_API_KEY unset in Vercel:
//  `sendEmail` returned `{skipped: true}` and the delivery cron marked those
//  notifications delivered, so invoices and overdue chasers were discarded with
//  no error anywhere.
//
//  These secrets can't go in PRODUCTION_REQUIRED_SECRETS — that registry is
//  bound to `requireSecret`, which throws, and throwing is the behaviour we
//  deliberately don't want. So the gap is closed by reporting instead: this is
//  what /api/health/secrets reads to answer "can this deployment actually send
//  anything?" without changing what happens when it can't.
// ============================================================================

export type DeliveryChannelStatus = {
  channel: "email" | "sms" | "push";
  configured: boolean;
  /** The env vars that would make it configured. Names only — never values. */
  requires: readonly string[];
  /** What is silently dropped while it stays unconfigured. */
  drops: string;
};

export function deliveryStatus(): DeliveryChannelStatus[] {
  return [
    {
      channel: "email",
      configured: isEmailConfigured(),
      requires: ["RESEND_API_KEY", "RESEND_FROM"],
      drops: "Invoices, overdue chasers, parent invites and mass email",
    },
    {
      channel: "sms",
      configured: isSmsConfigured(),
      requires: ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM"],
      drops: "Class reminders, waitlist offers and cover requests to teachers",
    },
    {
      channel: "push",
      configured: isPushConfigured(),
      requires: ["EXPO_ACCESS_TOKEN"],
      drops: "Every native-app notification to parents",
    },
  ];
}

/** Channels that would silently drop messages in this environment. */
export function unconfiguredDeliveryChannels(): DeliveryChannelStatus[] {
  return deliveryStatus().filter((c) => !c.configured);
}
