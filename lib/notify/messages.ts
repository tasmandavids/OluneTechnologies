// ============================================================================
//  lib/notify/messages.ts
//
//  PURE notification-rendering logic — no IO, fully unit-testable.
//
//  Maps a stored `notifications` row to the channels it should be delivered on
//  (in addition to the always-present in-app entry) and renders the email / SMS
//  body for it. The providers + cron route consume these; keeping them pure
//  means the routing rules and copy are tested without a network or DB.
// ============================================================================

import { canonicalAppUrl } from "@/lib/app-url";

/** Mirrors the `notifications.type` values produced by the DB triggers + cron. */
export type NotificationType =
  | "enrollment_confirmed"
  | "class_reminder"
  | "payment_failed"
  | "invoice_overdue"
  | "invoice_sent"
  | "payment_reminder"
  | "subscription_sent"
  | "birthday_greeting"
  | "message_received"
  | "waitlist_promoted"
  | "schedule_updated";

export type DeliveryChannel = "email" | "sms";

/** The subset of a notifications row the delivery layer needs. */
export type DeliverableNotification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
};

/** Absolute base URL for links in outbound messages (falls back to relative). */
function absoluteLink(link: string | null): string | null {
  if (!link) return null;
  if (/^https?:\/\//i.test(link)) return link;
  const base = canonicalAppUrl();
  return `${base}${link.startsWith("/") ? "" : "/"}${link}`;
}

/**
 * Which external channels a notification type should go out on. In-app is
 * always present (the row itself), so this is purely the OUTBOUND set.
 *
 * Rationale:
 *  • Time-sensitive / money events → email (durable record).
 *  • Imminent, action-now events (class tomorrow, waitlist spot) → email + SMS.
 *  • message_received is in-app only — the user is already in the portal and
 *    emailing every chat line would be noise.
 */
export function channelsForType(type: string): DeliveryChannel[] {
  switch (type as NotificationType) {
    case "class_reminder":
    case "waitlist_promoted":
      return ["email", "sms"];
    case "enrollment_confirmed":
    case "payment_failed":
    case "invoice_overdue":
    case "invoice_sent":
    case "payment_reminder":
    case "subscription_sent":
    case "birthday_greeting":
    case "schedule_updated":
      return ["email"];
    case "message_received":
    default:
      return [];
  }
}

export type RenderedEmail = { subject: string; html: string; text: string };

export function renderNotificationEmail(n: DeliverableNotification): RenderedEmail {
  const link = absoluteLink(n.link);
  const bodyText = n.body ?? "";
  const subject = n.title;

  const cta = link
    ? `<p style="margin:24px 0 0"><a href="${link}" style="background:#6B66C9;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-family:sans-serif">Open Olune</a></p>`
    : "";

  const html = `<div style="font-family:Hanken Grotesk,Arial,sans-serif;color:#1F1D30;max-width:520px;margin:0 auto">
  <h1 style="font-size:20px;margin:0 0 12px">${escapeHtml(n.title)}</h1>
  <p style="font-size:15px;line-height:1.55;margin:0">${escapeHtml(bodyText)}</p>
  ${cta}
</div>`;

  const text = link ? `${n.title}\n\n${bodyText}\n\n${link}` : `${n.title}\n\n${bodyText}`;
  return { subject, html, text };
}

export function renderNotificationSms(n: DeliverableNotification): string {
  const link = absoluteLink(n.link);
  const parts = [n.title];
  if (n.body) parts.push(n.body);
  if (link) parts.push(link);
  const msg = parts.join(" — ");
  // Keep SMS to a single segment where possible.
  return msg.length > 320 ? `${msg.slice(0, 317)}...` : msg;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
