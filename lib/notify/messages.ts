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
  | "schedule_updated"
  | "checkin_tap"
  | "substitute_needed"
  | "substitute_filled"
  | "contractor_invoice_received";

export type DeliveryChannel = "email" | "sms" | "push";

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
 *  • Push goes on anything a parent would want to know *now*, which is a wider
 *    set than email: it is free, it is silent when the app is closed and the
 *    OS lets the recipient mute it per-app. It is the native app's entire
 *    reason to exist over a bookmark.
 *
 * Two types are push-only, deliberately:
 *  • message_received — emailing every chat line is noise (that reasoning is
 *    unchanged), but a chat message with no push is a chat feature nobody
 *    notices. Push is exactly the right weight for it.
 *  • checkin_tap — "Ruby checked in to Jazz Elite" is worth a lock screen and
 *    nothing more. An email per tap would be intolerable at studio volume.
 *
 * Email and SMS routing is unchanged from before push existed; every edit here
 * added a channel rather than moving one.
 */
export function channelsForType(type: string): DeliveryChannel[] {
  switch (type as NotificationType) {
    case "class_reminder":
    case "waitlist_promoted":
    // A cover request is the most time-critical message in the product — a
    // class starts in hours and nobody is going to teach it. Email alone
    // assumes the teacher is at a desk; they are not.
    case "substitute_needed":
      return ["email", "sms", "push"];
    case "substitute_filled":
    case "enrollment_confirmed":
    case "payment_failed":
    case "invoice_overdue":
    case "payment_reminder":
    case "birthday_greeting":
    case "schedule_updated":
      return ["email", "push"];
    // The invoice IS the email. A push saying "you have an invoice" on top of
    // it is a second interruption carrying no extra information; the overdue
    // and payment-reminder rows above are the ones that chase it.
    case "invoice_sent":
    case "subscription_sent":
      return ["email"];
    case "message_received":
    case "checkin_tap":
      return ["push"];
    // The invoice email is sent inline by sendContractorInvoice, which has to
    // know whether delivery actually succeeded before flipping the status.
    // This row is the admin's in-app copy — routing it outbound too would
    // email the same invoice twice.
    case "contractor_invoice_received":
      return [];
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

export type RenderedPush = {
  title: string;
  body: string;
  /** Read by the app on tap to route the user straight to the right screen. */
  data: { notificationId: string; type: string; link: string | null };
};

/**
 * Push copy is not email copy shortened. A lock screen shows roughly 2 lines
 * of body on both platforms, and the title is already the notification's own
 * `title` — so the body is the raw `body` with no link appended. The link
 * travels in `data` instead, where the app can route to it natively; a visible
 * URL in a push is both untappable-as-text and wasted characters.
 *
 * `link` stays relative here. The app resolves it against its own router,
 * unlike email/SMS which need an absolute URL for a browser.
 */
export function renderNotificationPush(n: DeliverableNotification): RenderedPush {
  const body = n.body ?? "";
  return {
    title: n.title,
    // Android truncates around 240 chars in the expanded view; iOS is similar.
    body: body.length > 240 ? `${body.slice(0, 237)}...` : body,
    data: { notificationId: n.id, type: n.type, link: n.link },
  };
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
