// ============================================================================
//  GET /api/cron/deliver-notifications   (EMAIL / SMS / PUSH delivery)
//
//  Flushes un-delivered `notifications` rows to their external channels (email
//  via Resend, SMS via Twilio, push via Expo). In-app notifications already
//  exist as rows; this is purely the outbound fan-out. Channel routing per type
//  lives in lib/notify/messages.ts (channelsForType).
//
//  Per row:
//    • No outbound channels (e.g. contractor_invoice_received) → marked
//      delivered (in-app only), nothing sent.
//    • A channel with no recipient address, or a provider that isn't configured
//      (no API keys) → treated as terminal for that channel (won't retry).
//    • Push fans out to every live device the recipient has registered (0120).
//      A device Expo reports as `DeviceNotRegistered` is revoked at the end of
//      the run and dropped from the rest of it; that is terminal for the
//      device, never for the notification — the parent's other phone may well
//      have taken it.
//    • A real send error → left queued with a `next_attempt_at` set from the
//      backoff schedule in lib/notify/backoff.ts, and retried once that time
//      passes. After the budget is exhausted (5 attempts; elapsed time depends on scheduling) it's
//      marked delivered with the last error kept.
//
//  This route is safe to run frequently: the batch is bounded, every write is
//  keyed by row id, and a row waiting out a backoff is skipped rather than
//  re-sent. The current Hobby deployment schedules it daily; five-minute delivery
//  requires a supported scheduler (see docs/optimization-2026-09.md).
//
//  Auth: `Authorization: Bearer <CRON_SECRET>` or `?secret=<CRON_SECRET>`.
//  Fails closed in production when CRON_SECRET is unset. Service-role client.
//
//  Requires env: SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET.
//  Optional env (delivery no-ops without them): RESEND_API_KEY + RESEND_FROM,
//  TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_FROM, EXPO_ACCESS_TOKEN.
// ============================================================================

import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizedCron } from "@/lib/cron/auth";
import { reportHandledError, reportHandledMessage } from "@/lib/observability/report";
import {
  channelsForType,
  renderNotificationEmail,
  renderNotificationPush,
  renderNotificationSms,
  type DeliverableNotification,
} from "@/lib/notify/messages";
import { sendEmail, sendPush, sendSms } from "@/lib/notify/providers";
import { createStudioReplyToResolver } from "@/lib/notify/reply-to";
import { nextAttemptAt } from "@/lib/notify/backoff";

export const dynamic = "force-dynamic";

const DEFAULT_BATCH = 200;

type ProfileContact = { id: string; email: string | null; phone: string | null };

async function deliver(req: NextRequest) {
  if (!authorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let supabase;
  try {
    supabase = createAdminClient();
  } catch (e) {
    await reportHandledError(e, {
      route: "cron.deliver-notifications",
      tags: { reason: "admin-client" },
    });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Admin client unavailable" },
      { status: 500 },
    );
  }

  const limitParam = Number(req.nextUrl.searchParams.get("limit"));
  const batch =
    Number.isFinite(limitParam) && limitParam > 0 && limitParam <= 1000
      ? Math.floor(limitParam)
      : DEFAULT_BATCH;

  const summary = {
    processed: 0,
    emailsSent: 0,
    smsSent: 0,
    pushesSent: 0,
    tokensRevoked: 0,
    inAppOnly: 0,
    failedRetained: 0,
    gaveUp: 0,
  };

  // 1. Pull the un-delivered queue that is due now (oldest first).
  //
  //    `next_attempt_at` (0117) is null until a row first fails, so a fresh
  //    notification is always due. A row waiting out a backoff is skipped by
  //    value rather than by a separate query — see lib/notify/backoff.ts.
  //
  //    nullsFirst matters: never-attempted rows must sort ahead of rows already
  //    carrying failures, or a provider outage would fill the batch with its
  //    own retries and starve new notifications behind them.
  const dueBeforeIso = new Date().toISOString();
  const { data: rows, error: fetchErr } = await supabase
    .from("notifications")
    // Kept as one string literal: supabase-js parses the select at the type
    // level, and a concatenated expression degrades the row type to
    // GenericStringError. The three *_sent_at stamps are what let a retry skip
    // a channel that already succeeded — see `alreadySent` below.
    .select("id, type, title, body, link, user_id, studio_id, delivery_attempts, email_sent_at, sms_sent_at, push_sent_at")
    .is("delivered_at", null)
    .or(`next_attempt_at.is.null,next_attempt_at.lte.${dueBeforeIso}`)
    .order("next_attempt_at", { ascending: true, nullsFirst: true })
    .order("sent_at", { ascending: true })
    .limit(batch);

  if (fetchErr) {
    await reportHandledMessage("Notification queue read failed", {
      route: "cron.deliver-notifications",
      tags: { reason: "queue-read" },
      extra: { message: fetchErr.message },
    });
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }
  if (!rows || rows.length === 0) {
    return NextResponse.json({ ok: true, ranAt: new Date().toISOString(), summary });
  }

  // 2. Resolve recipient contact details + notification preferences in one go.
  const userIds = [...new Set(rows.map((r) => r.user_id as string))];
  const [{ data: profiles }, { data: prefRows }, { data: deviceRows }] = await Promise.all([
    supabase.from("profiles").select("id, email, phone").in("id", userIds),
    supabase
      .from("notification_preferences")
      .select("user_id, notification_type, email_enabled, sms_enabled, push_enabled")
      .in("user_id", userIds),
    // Live device registrations only (0120). A parent may have several — phone
    // and iPad — and every one of them is the same notification.
    supabase
      .from("device_tokens")
      .select("user_id, token")
      .in("user_id", userIds)
      .is("revoked_at", null),
  ]);
  const contacts = new Map<string, ProfileContact>(
    (profiles ?? []).map((p) => [
      p.id as string,
      { id: p.id as string, email: p.email as string | null, phone: p.phone as string | null },
    ]),
  );
  // prefKey = `${userId}:${type}` → { emailEnabled, smsEnabled, pushEnabled }
  const prefMap = new Map<
    string,
    { emailEnabled: boolean; smsEnabled: boolean; pushEnabled: boolean }
  >(
    (prefRows ?? []).map((p) => [
      `${p.user_id}:${p.notification_type}`,
      {
        emailEnabled: Boolean(p.email_enabled),
        smsEnabled: Boolean(p.sms_enabled),
        // Rows written before 0120 have no value; the column defaults true, so
        // this only guards a hand-written null.
        pushEnabled: p.push_enabled ?? true,
      },
    ]),
  );
  function channelEnabled(
    userId: string,
    type: string,
    channel: "email" | "sms" | "push",
  ): boolean {
    const pref = prefMap.get(`${userId}:${type}`);
    if (!pref) return true; // default on when no explicit preference saved
    if (channel === "email") return pref.emailEnabled;
    if (channel === "sms") return pref.smsEnabled;
    return pref.pushEnabled;
  }

  // userId → live push tokens. Mutable: a token Expo rejects as dead is dropped
  // here as well as revoked in the DB, so the rest of this batch stops sending
  // to it immediately rather than re-learning it row by row.
  const devices = new Map<string, string[]>();
  for (const d of deviceRows ?? []) {
    const uid = d.user_id as string;
    const list = devices.get(uid);
    if (list) list.push(d.token as string);
    else devices.set(uid, [d.token as string]);
  }
  const revokedTokens = new Map<string, string>(); // token → reason

  const nowIso = new Date().toISOString();

  // Per-run, so a studio that changes its contact address is picked up on the
  // next pass rather than being cached for the life of the process.
  const studioReplyTo = createStudioReplyToResolver(supabase);

  // 3. Deliver each row.
  for (const row of rows) {
    summary.processed += 1;
    const channels = channelsForType(row.type as string);
    const attempts = ((row.delivery_attempts as number) ?? 0) + 1;
    const update: Record<string, unknown> = { delivery_attempts: attempts };

    if (channels.length === 0) {
      // In-app only — nothing to send, mark done.
      update.delivered_at = nowIso;
      summary.inAppOnly += 1;
      await supabase.from("notifications").update(update).eq("id", row.id);
      continue;
    }

    const notif: DeliverableNotification = {
      id: row.id as string,
      type: row.type as string,
      title: row.title as string,
      body: (row.body as string | null) ?? null,
      link: (row.link as string | null) ?? null,
    };
    const contact = contacts.get(row.user_id as string);
    const errors: string[] = [];
    let retryable = false;

    // A row is retried as a whole, but its channels succeed independently: a
    // class_reminder whose SMS fails comes back around with its email already
    // delivered. Without this guard that email is sent again on every one of
    // the five attempts. Push makes the case routine rather than rare — a
    // parent who uninstalled on one of two devices fails the push channel on
    // an otherwise perfect row — so each channel is skipped once it is stamped.
    //
    // Push is stamped when *any* device took it. Re-pushing every device to
    // reach one that was throttled would ring the others a second time, and a
    // duplicate lock-screen alert is worse than a missed one.
    const alreadySent = (channel: "email" | "sms" | "push"): boolean =>
      row[`${channel}_sent_at` as const] != null;

    if (
      channels.includes("email") &&
      !alreadySent("email") &&
      channelEnabled(row.user_id as string, row.type as string, "email")
    ) {
      if (contact?.email) {
        // Studio-branded mail — an invoice or a class reminder — must reply to
        // the studio, not to Olune support. Memoised across the whole run, so
        // a batch spanning many studios costs one lookup each, not one per row.
        const r = await sendEmail({
          to: contact.email,
          replyTo: await studioReplyTo(row.studio_id as string | null),
          ...renderNotificationEmail(notif),
        });
        if (r.ok) {
          update.email_sent_at = nowIso;
          summary.emailsSent += 1;
        } else if (!r.skipped) {
          errors.push(`email: ${r.error}`);
          retryable = true;
        }
        // r.skipped (no keys) → terminal, no retry.
      }
      // no email address → terminal for this channel.
    }

    if (
      channels.includes("sms") &&
      !alreadySent("sms") &&
      channelEnabled(row.user_id as string, row.type as string, "sms")
    ) {
      if (contact?.phone) {
        const r = await sendSms({
          to: contact.phone,
          body: renderNotificationSms(notif),
          // Studios with their own connected Twilio account send from their own
          // number; everyone else falls back to the platform credentials.
          studioId: (row.studio_id as string | null) ?? null,
        });
        if (r.ok) {
          update.sms_sent_at = nowIso;
          summary.smsSent += 1;
        } else if (!r.skipped) {
          errors.push(`sms: ${r.error}`);
          retryable = true;
        }
      }
    }

    if (
      channels.includes("push") &&
      !alreadySent("push") &&
      channelEnabled(row.user_id as string, row.type as string, "push")
    ) {
      const tokens = devices.get(row.user_id as string) ?? [];
      if (tokens.length) {
        const rendered = renderNotificationPush(notif);
        const r = await sendPush({ tokens, ...rendered });
        if (!r.skipped) {
          let anyOk = false;
          for (const ticket of r.tickets) {
            if (ticket.ok) {
              anyOk = true;
              summary.pushesSent += 1;
              continue;
            }
            if (ticket.unregistered) {
              // Terminal for this device, not for this notification. Revoke it
              // and drop it from the batch; a parent's other device may still
              // be live, so this must not fail the row on its own.
              revokedTokens.set(
                ticket.token,
                /valid expo push token/i.test(ticket.error)
                  ? "invalid_token"
                  : "device_not_registered",
              );
              devices.set(
                row.user_id as string,
                (devices.get(row.user_id as string) ?? []).filter((t) => t !== ticket.token),
              );
            } else if (ticket.retryable) {
              retryable = true;
            }
            errors.push(`push: ${ticket.error}`);
          }
          if (anyOk) update.push_sent_at = nowIso;
        }
        // r.skipped (no EXPO_ACCESS_TOKEN) → terminal, no retry.
      }
      // No live devices → terminal for this channel. A parent who hasn't
      // installed the app is not a delivery failure.
    }

    if (errors.length) update.delivery_error = errors.join(" | ");

    if (!retryable) {
      update.delivered_at = nowIso;
    } else {
      // Schedule the retry rather than relying on "the next pass" — at a
      // 5-minute cadence that would burn the whole budget inside a blip.
      const retryAt = nextAttemptAt(attempts);
      if (retryAt === null) {
        update.delivered_at = nowIso; // budget exhausted; keep last error.
        summary.gaveUp += 1;
      } else {
        update.next_attempt_at = retryAt.toISOString();
        summary.failedRetained += 1;
      }
    }

    await supabase.from("notifications").update(update).eq("id", row.id);
  }

  // 4. Retire the device tokens Expo told us are dead.
  //
  //    Grouped by reason so both writes stay a single statement each, and done
  //    after the loop so a token rejected on the first row isn't re-revoked on
  //    the next twenty. Failures here are logged into the summary rather than
  //    failing the run: the notifications themselves are already committed, and
  //    the next pass will simply learn the same thing again.
  if (revokedTokens.size) {
    const byReason = new Map<string, string[]>();
    for (const [token, reason] of revokedTokens) {
      const list = byReason.get(reason);
      if (list) list.push(token);
      else byReason.set(reason, [token]);
    }
    for (const [reason, tokens] of byReason) {
      const { error } = await supabase
        .from("device_tokens")
        .update({ revoked_at: nowIso, revoked_reason: reason })
        .in("token", tokens)
        .is("revoked_at", null);
      if (!error) summary.tokensRevoked += tokens.length;
    }
  }

  // A row that exhausted its retry budget is a notification a parent never
  // received — an absence SMS, a payment-failed warning. The run itself
  // "succeeded", so nothing else would ever surface it. Reported once per run
  // rather than once per row to keep the alert readable.
  if (summary.gaveUp > 0) {
    await reportHandledMessage("Notification delivery gave up on one or more rows", {
      route: "cron.deliver-notifications",
      tags: { reason: "delivery-exhausted" },
      extra: { ...summary },
    });
  }

  return NextResponse.json({ ok: true, ranAt: new Date().toISOString(), summary });
}

// The 10-minute lease exceeds the current Hobby maximum execution window.
// Revisit its TTL if changing hosting execution limits. A terminated worker
// recovers automatically; a stale worker cannot release a newer lease.
export async function GET(req: NextRequest) {
  if (!authorizedCron(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const supabase = createAdminClient();
  const token = randomUUID();
  const { data: acquired, error } = await supabase.rpc("acquire_notification_delivery_lease", { p_token: token });
  if (error) {
    await reportHandledMessage("Notification delivery lease unavailable", { route: "cron.deliver-notifications" });
    return NextResponse.json({ error: "delivery_temporarily_unavailable" }, { status: 503 });
  }
  if (!acquired) return NextResponse.json({ ok: true, skipped: "already-running" });
  try {
    return await deliver(req);
  } finally {
    const { error: releaseError } = await supabase.rpc("release_notification_delivery_lease", { p_token: token });
    if (releaseError) await reportHandledMessage("Notification delivery lease release failed", { route: "cron.deliver-notifications" });
  }
}
